# Contributing to Soroban Token Launchpad

Thanks for your interest! This project is open to contributors via the [Stellar Wave Program on Drips](https://www.drips.network/wave).

---

## Documentation Structure

- **Feature Guides**: See `docs/` for detailed feature documentation
- **Issue Tracking**: Active issues are tracked in the `waveN.md` files in the repo root
- **Architecture**: Refer to `PRD.md` for project requirements and design decisions

---

## Local Setup

```bash
# Clone
git clone https://github.com/your-org/soroban-token-launchpad
cd soroban-token-launchpad

# Install frontend deps
npm install

# Install Rust (rustup show then installs exactly what rust-toolchain.toml pins)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
rustup show

# Install the Stellar CLI (the older `soroban` binary is deprecated)
curl -sSfL https://github.com/stellar/stellar-cli/releases/download/v28.0.0/stellar-cli-28.0.0-x86_64-unknown-linux-gnu.tar.gz \
  | tar xz -C ~/.local/bin stellar

# Run a standalone local Soroban network
# Allows rapid offline testing without waiting on testnet
docker-compose up -d

# Build contracts
cd contracts && cargo build

# Run frontend
cd frontend && npm run dev
```

---

## Local Soroban Standalone Network (Docker)

Public testnet can be slow for tight iteration loops. This repo includes a `docker-compose.yml` that spins up a local standalone Stellar + Soroban stack using Stellar Quickstart.

### Start / Stop

```bash
# Start (in background)
docker compose up -d

# View logs
docker compose logs -f

# Stop
docker compose down
```

### Endpoints

- **Horizon**
  - `http://localhost:8000`
- **Soroban RPC (JSON-RPC endpoint)**
  - `http://localhost:8000/rpc`
- **Friendbot (fund accounts)**
  - `http://localhost:8000/friendbot?addr=G...`

### Network passphrase

Local standalone uses the fixed passphrase:

```
Standalone Network ; February 2017
```

### Verify RPC health

```bash
curl --location "http://localhost:8000/rpc" --header "Content-Type: application/json" --data "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"getHealth\"}"
```

### Configure CLI network + fund an account

Depending on your CLI version, your binary may be `stellar` (newer) or `soroban` (older).

```bash
# Newer CLI
stellar network add local --rpc-url "http://localhost:8000/rpc" --network-passphrase "Standalone Network ; February 2017"
stellar keys generate local-admin

# Fund it using local friendbot
curl "http://localhost:8000/friendbot?addr=$(stellar keys address local-admin)"
```

If your CLI binary is `soroban`, use the equivalent commands:

```bash
soroban network add local --rpc-url "http://localhost:8000/rpc" --network-passphrase "Standalone Network ; February 2017"
soroban keys generate local-admin
curl "http://localhost:8000/friendbot?addr=$(soroban keys address local-admin)"
```

### Point the frontend to localnet

You can override defaults using env vars:

```bash
NEXT_PUBLIC_SOROBAN_RPC_URL=http://localhost:8000/rpc
NEXT_PUBLIC_HORIZON_URL=http://localhost:8000
NEXT_PUBLIC_NETWORK_PASSPHRASE=Standalone Network ; February 2017
```

Note: the Settings UI can override **RPC URL** and **Horizon URL**, but **does not** override the network passphrase. If you are using the Settings UI to point to `localhost`, make sure you still set `NEXT_PUBLIC_NETWORK_PASSPHRASE` for localnet.

On Windows PowerShell, set it like:

```powershell
$env:NEXT_PUBLIC_SOROBAN_RPC_URL = "http://localhost:8000/rpc"
$env:NEXT_PUBLIC_HORIZON_URL = "http://localhost:8000"
$env:NEXT_PUBLIC_NETWORK_PASSPHRASE = "Standalone Network ; February 2017"
npm run dev
```

Or use the app's Settings UI (stored in localStorage) to set:

- RPC URL: `http://localhost:8000/rpc`
- Horizon URL: `http://localhost:8000`

### Deploy contracts against localnet

Once your `local-admin` key is funded, you can deploy using the same flow as testnet, but with `--network local` and `--source local-admin`.

---

## Branching

- `main` — stable, protected
- `feat/issue-{number}-short-description` — feature branches
- `fix/issue-{number}-short-description` — bug fix branches

---

## Running Tests

```bash
# Contract tests
cd contracts && cargo test

# Frontend unit tests
npm test

# E2E tests (requires testnet funded keypair in .env.test)
npm run test:e2e
```

### Test snapshot policy

The `contracts/*/test_snapshots/` trees (token, vesting, factory, airdrop) are **tracked**, not ignored. A snapshot diff is the review artefact for any contract behaviour change: if `cargo test` rewrites snapshots, commit them and explain the change in the PR. Do not add `test_snapshots/` to `.gitignore`. Build artefacts such as `*.tsbuildinfo` and `*.stackdump` stay ignored.

---

## Submitting a PR

1. Pick an issue tagged `good first issue` or comment on one you'd like to tackle
2. Fork the repo and create a branch off `main` once assigned the issue
3. Write tests for your changes
4. Open a PR referencing the issue number: `Closes #7`
5. A maintainer will review and merge

---

## Questions?

Open a [GitHub Discussion](https://github.com/your-org/soroban-token-launchpad/discussions) or comment on the relevant issue.

---

## Regenerating Contract Bindings

TypeScript bindings live in `frontend/lib/bindings/` and are generated from the
built wasm, not from a deployed contract — so they can be regenerated without
touching a network:

```bash
stellar contract build
cd frontend && npm run bindings:generate
```

`npm run bindings:check` regenerates and fails if the result differs from what
is committed. Run it after any change to a contract's public interface; stale
bindings are how two admin actions ended up calling methods that did not
exist.
