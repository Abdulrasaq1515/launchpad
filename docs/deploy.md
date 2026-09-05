# Deploying SoroPad

Two scripts. `bootstrap-network.mjs` prepares a network once;
`deploy-token.mjs` launches tokens on it, as often as you like.

## Prerequisites

- Rust as pinned by `rust-toolchain.toml` (`rustup show` installs it) with the
  `wasm32v1-none` target. This is the only Wasm target the Stellar runtime
  accepts — a `wasm32-unknown-unknown` build under current Rust is rejected
  outright with `reference-types not enabled`.
- [`stellar-cli`](https://github.com/stellar/stellar-cli) v28 or later. The
  older `soroban` binary is deprecated and will not work here.
- A funded account, as a `stellar keys` identity or a secret key.

```bash
rustup show
stellar keys generate my-identity --network testnet --fund   # testnet only
```

## 1. Bootstrap the network

Builds the contracts, uploads all four wasms, deploys the factory, points it at
the token wasm, and rewrites `contracts/wasm-manifest.json`.

```bash
node scripts/bootstrap-network.mjs --network testnet --source my-identity
```

Idempotent: re-uploading a wasm the network already has returns the same hash.
To refresh an existing factory's token wasm instead of deploying a second
factory, pass `--factory C...`.

The script refuses to record a hash the network did not return, so the manifest
can never vouch for a binary that was not actually uploaded.

Put the factory address it prints into `frontend/.env.local`:

```
NEXT_PUBLIC_FACTORY_ADDRESS_TESTNET=C...
```

## 2. Launch a token

```bash
node scripts/deploy-token.mjs --network testnet --source my-identity \
  --name "My Token" --symbol MTK --supply 1000000 --max-supply 10000000
```

One atomic `deploy_token` call: the factory creates the contract and
initializes it in the same invocation, so a launch either fully happens or does
not happen at all. There is no half-initialized token to clean up.

`--supply` and `--max-supply` are in whole tokens and are scaled by
`--decimals` using integer arithmetic, so `--supply 2500000.5` becomes exactly
`25000005000000` base units at 7 decimals.

| Flag | Required | Default | Description |
|---|---|---|---|
| `--network` | Yes | — | Network to launch on |
| `--source` | Yes | — | `stellar keys` identity or secret key |
| `--name` | Yes | — | Token name |
| `--symbol` | Yes | — | Token symbol |
| `--supply` | Yes | — | Initial supply, in whole tokens |
| `--factory` | No | from `.env.local` | Factory address |
| `--admin` | No | `--source` address | Token admin |
| `--max-supply` | No | uncapped | Hard cap, in whole tokens |
| `--decimals` | No | `7` | Decimal precision, max 18 |
| `--compliance-node` | No | none | Compliance contract address |
| `--auth-required` | No | off | Holders must be authorized to receive |
| `--auth-revocable` | No | off | Admin may revoke holder authorization |

## Going to mainnet

The same two commands, with `--network mainnet` and a funded mainnet key.
Before you run them:

1. **Set a real RPC endpoint.** SDF runs no public mainnet Soroban RPC. The
   built-in default is a community endpoint; set
   `NEXT_PUBLIC_MAINNET_SOROBAN_RPC_URL` to your own provider.
2. **Get the contracts audited.** They are unaudited. Anything launched through
   them holds real value, and `upgrade` is admin-only but not timelocked.
3. **Decide who holds the factory admin key.** That key sets the token wasm
   hash every future launch is created from. Treat it as the most sensitive
   secret in the system.
4. **Dry-run on testnet first**, with the same flags you intend to use.

Then:

```bash
node scripts/bootstrap-network.mjs --network mainnet --source prod-identity
```

Record the printed factory address in `NEXT_PUBLIC_FACTORY_ADDRESS_MAINNET`,
commit the updated `contracts/wasm-manifest.json`, and tag the commit — the
manifest's hashes are only meaningful next to the source that produced them,
and only reproducible on the pinned toolchain.

### Rolling back

Contract deployments are immutable and the factory keeps an append-only index,
so there is nothing to un-deploy. To stop new launches using a bad token wasm,
call `set_token_wasm_hash` with the previous hash — already-launched tokens are
unaffected. To move existing tokens onto new logic, each token's admin calls
`upgrade` on their own contract.

## Current testnet deployment

Deployed from this repo on the pinned toolchain and exercised end to end —
launch, mint, transfer, burn, approve, partial `transfer_from`, revoke, vesting
schedule creation and release.

| | |
|---|---|
| Factory | `CAMMOVC7NOIQYRLHBPALGOXEODTWDW4NFEKHFWI77NSIRC47BFRWPB2D` |
| Token wasm | `34257ec9ed4ee7b8d853870482e3983c79297d710fc16ade90f8c12f9381d79b` |
| Vesting wasm | `cbaa3e10b8b0ad090c2279734e26df352f10e66da676c985f024fdbaf7d50bb7` |
| Factory wasm | `6a844bebd74531d94d270bd834b755feb53916ca0a593f47be5fa2b576ad9c4b` |
| Airdrop wasm | `126cf8e1a2ffe99c4a1cd996fd02b823f5c833d58705bd573e508ac5ce79ef07` |
| Example token | `CA33XOS7YTKLFPFETDPRT4TNJUZMR67MMIE6BTU2LD667TZU6DNQDNTR` (SoroPad Demo / SPD) |
| Example vesting | `CDPK7T24CK2AQFVPSHH6S2DRKJ4L7GMRB75ST2F6DYHPGMC7LN5XF42K` |

## Verifying a deployment

`contracts/wasm-manifest.json` records each wasm hash per network, and CI
re-checks it against a fresh build on every push. To verify by hand:

```bash
stellar contract build
sha256sum target/wasm32v1-none/release/*.wasm
```

These must match the manifest. They only reproduce on the pinned toolchain: a
different rustc produces a different hash from identical source.
