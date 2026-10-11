#!/usr/bin/env node
/**
 * Bring a network up from nothing: build the contracts, upload every wasm,
 * deploy and configure the token factory, and record the result.
 *
 * Idempotent. Uploading a wasm that is already on the network returns the same
 * hash and costs a fee but changes nothing, so re-running is safe. Pass an
 * existing --factory to refresh its token wasm hash instead of deploying a
 * second factory.
 *
 *   node scripts/bootstrap-network.mjs --network testnet --source alice
 *   node scripts/bootstrap-network.mjs --network mainnet --source prod --factory C...
 *
 * Writes contracts/wasm-manifest.json and prints the .env lines to copy.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CONTRACTS = ["token", "vesting", "factory", "airdrop"];
const WASM_DIR = "target/wasm32v1-none/release";

const USAGE = `
Usage:
  node scripts/bootstrap-network.mjs --network <testnet|mainnet|futurenet|local> --source <identity>

Flags:
  --network   Network to bootstrap                                  [required]
  --source    stellar-cli identity or secret key to pay and own it  [required]
  --factory   Reuse an existing factory instead of deploying one    [optional]
  --skip-build  Use the wasm already in target/ as-is              [optional]
`.trim();

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith("--")) continue;
    const key = argv[i].slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) { args[key] = next; i++; } else { args[key] = true; }
  }
  return args;
}

function stellar(args, { quiet = false } = {}) {
  if (!quiet) console.log(`  $ stellar ${args.join(" ")}`);
  return execFileSync("stellar", args, { cwd: ROOT, encoding: "utf-8" }).trim();
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) { console.log(USAGE); process.exit(0); }

  for (const flag of ["network", "source"]) {
    if (typeof args[flag] !== "string") {
      console.error(`Error: --${flag} is required.\n\n${USAGE}`);
      process.exit(1);
    }
  }
  const { network, source } = args;

  if (!args["skip-build"]) {
    console.log("\n=== Building contracts ===");
    execFileSync("stellar", ["contract", "build"], { cwd: ROOT, stdio: "inherit" });
  }

  console.log(`\n=== Uploading wasm to ${network} ===`);
  const hashes = {};
  const sizes = {};
  for (const name of CONTRACTS) {
    const wasm = `${WASM_DIR}/soroban_${name}.wasm`;
    const path = resolve(ROOT, wasm);
    sizes[name] = statSync(path).size;
    const hash = stellar(["contract", "upload", "--wasm", wasm,
                          "--source", source, "--network", network], { quiet: true });

    // The network returns the hash it stored; it must equal the hash of the
    // file we just built, or the manifest would vouch for the wrong binary.
    const local = sha256(path);
    if (hash !== local) {
      console.error(`\nError: ${name} uploaded as ${hash} but the local wasm hashes to ${local}.`);
      process.exit(1);
    }
    hashes[name] = hash;
    console.log(`  ${name.padEnd(8)} ${hash}  (${sizes[name]} bytes)`);
  }

  let factory = typeof args.factory === "string" ? args.factory : null;
  if (factory) {
    console.log(`\n=== Reusing factory ${factory} ===`);
  } else {
    console.log("\n=== Deploying factory ===");
    factory = stellar(["contract", "deploy", "--wasm-hash", hashes.factory,
                       "--source", source, "--network", network]);
    console.log(`  factory: ${factory}`);
    const admin = stellar(["keys", "address", source], { quiet: true });
    stellar(["contract", "invoke", "--id", factory, "--source", source,
             "--network", network, "--", "initialize", "--admin", admin]);
  }

  console.log("\n=== Pointing the factory at the token wasm ===");
  stellar(["contract", "invoke", "--id", factory, "--source", source, "--network", network,
           "--", "set_token_wasm_hash", "--wasm_hash", hashes.token]);

  const configured = stellar(["contract", "invoke", "--id", factory, "--source", source,
                              "--network", network, "--", "get_token_wasm_hash"],
                             { quiet: true }).replaceAll('"', "");
  if (configured !== hashes.token) {
    console.error(`\nError: factory reports token wasm ${configured}, expected ${hashes.token}.`);
    process.exit(1);
  }

  console.log("\n=== Updating contracts/wasm-manifest.json ===");
  const manifestPath = resolve(ROOT, "contracts/wasm-manifest.json");
  let manifest = {};
  try { manifest = JSON.parse(readFileSync(manifestPath, "utf-8")); } catch { /* first run */ }

  const rustVersion = execFileSync("rustc", ["--version"], { encoding: "utf-8" }).trim().split(" ")[1];
  for (const name of CONTRACTS) {
    const entry = manifest[name] ?? { latest: "v1.0.0", versions: {} };
    const version = entry.latest ?? "v1.0.0";
    const existing = entry.versions?.[version] ?? {};
    entry.versions = {
      ...entry.versions,
      [version]: {
        ...existing,
        wasm_hash: hashes[name],
        source_tag: version,
        wasm_bytes: sizes[name],
        // Per-network, because a hash is only meaningful next to the network
        // it was uploaded to.
        networks: { ...(existing.networks ?? {}), [network]: hashes[name] },
      },
    };
    entry.build_info = {
      sdk_version: "27.0.6",
      rust_version: rustVersion,
      target: "wasm32v1-none",
      profile: "release",
    };
    manifest[name] = entry;
  }
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");

  const envKey = `NEXT_PUBLIC_FACTORY_ADDRESS_${network.toUpperCase()}`;
  console.log(`
=== ${network} is ready ===

Factory:  ${factory}
Token:    ${hashes.token}

Add to frontend/.env.local:

  ${envKey}=${factory}

Then launch a token with:

  node scripts/deploy-token.mjs --network ${network} --source ${source} \\
    --name "My Token" --symbol MTK --supply 1000000
`);
}

main();
