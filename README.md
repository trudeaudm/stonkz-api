# stonkz-api

Server-side chain indexer for [STONKZ](https://stonkz.green). **Step A** delivers
Postgres schema + background worker only — no HTTP API (Step B) and no frontend
changes (Step C).

Third repo in the STONKZ stack:

| Repo | Role |
|---|---|
| `stonkz.green` | Contracts |
| `stonkz-site` | Frontend |
| **`stonkz-api`** | Public chain indexer + future read API |

## Stack

- Node 22 + TypeScript
- [viem](https://viem.sh) for Robinhood Chain reads
- Postgres (Render managed in production)
- [node-pg-migrate](https://github.com/salsita/node-pg-migrate) — plain SQL migrations, no ORM

## Environment

Copy `.env.example` → `.env`. Required:

| Variable | Example | Notes |
|---|---|---|
| `CHAIN_ID` | `4663` | Never hardcode in source |
| `RPC_URL` | `https://rpc.mainnet.chain.robinhood.com` | HTTPS only |
| `DATABASE_URL` | `postgres://…` | Render Postgres connection string |

Optional:

| Variable | Default | Notes |
|---|---|---|
| `CONFIRMATION_BUFFER` | `5` | Blocks behind head before indexing |
| `POLL_INTERVAL_MS` | `2000` | Follow-loop poll interval |
| `LOG_LEVEL` | `info` | pino log level |

Contract addresses come from the `generations` table — **not** env.

On Windows, if RPC TLS fails with `UNABLE_TO_VERIFY_LEAF_SIGNATURE`, set
`NODE_TLS_REJECT_UNAUTHORIZED=0` locally only (see `.env.example`).

## Setup

```bash
npm ci
cp .env.example .env   # edit DATABASE_URL
npm run migrate
npm run status
```

## CLI

```bash
npm run backfill -- --generation express-v4
npm run rebuild-candles -- --pool 0x…
npm run status
npm run cli -- report-mooner
npm run cli -- report-generation --generation express-v4
```

## Worker (Render background worker)

```bash
npm run worker
```

`render.yaml` defines:

- **PostgreSQL** `stonkz-api-db`
- **Worker** `stonkz-api-indexer` — `npm run worker`

Push to `main`; attach `DATABASE_URL` from the database service.

## Schema

Migrations (in order):

1. `1724120000000_init.cjs` — `generations`, `listings`, `swaps`, `candles`,
   `token_metadata`, `indexer_cursors`
2. `1724120000001_seed_generations.cjs` — Express V1–V4 factories (`tracked=true`,
   `visible=false`)

### Cursor invariant

`indexer_cursors.last_block` advances **only after** the batch rows are committed.
Any error leaves the cursor unchanged (enforced via per-chunk transactions).

### Swaps table

Amounts are from the PoolManager **Swap event only**. ERC-20 Transfer amounts
describe the same movement and must never be summed with Swap amounts.

`swap_direction` is trader-facing (`buy`|`sell`) for the launch token, derived
from the token-side BalanceDelta: **positive ⇒ buy**, negative ⇒ sell (same
rule as `stonkz-site` `useMainPoolSpot.swapDirection`).

## Generations seed

Values cite `stonkz.green` `deploys/official/addresses.json` for shared wiring
(PoolManager, FeeHook) plus on-chain factory addresses/deploy blocks for V1–V4.

## Verify

```bash
npm run verify:local-db   # embedded Postgres + migrations + unit tests
npm run verify:live       # backfill express-v4 against live RPC + MOONER checks
```

## License

Private / STONKZ — public repo for transparency of indexer code reading public chain data.
