# stonkz-api

Server-side chain indexer + **public read API** for [STONKZ](https://stonkz.green).

| Repo | Role |
|---|---|
| `stonkz.green` | Contracts |
| `stonkz-site` | Frontend |
| **`stonkz-api`** | Indexer worker + read API (this repo) |

**Step A** — Postgres schema + indexer worker.  
**Step B** — Read API + SSE (this). No write/metadata endpoints (Step D). No auth — public chain data.

## Stack

- Node 22 + TypeScript
- **Fastify** for the HTTP layer (typed route schemas, lower JSON overhead than Express, clean async error handling; Express would work — Fastify fits a public read API better)
- Shared `pg` pool module with the indexer worker
- [viem](https://viem.sh) for Robinhood Chain reads
- Postgres (Render managed in production)
- [node-pg-migrate](https://github.com/salsita/node-pg-migrate)

### Amounts are strings

All token/wei/WAD amounts are JSON **strings**. They exceed JavaScript `Number` precision — never parse them with `parseFloat` / `Number`.

## Environment

Copy `.env.example` → `.env`.

| Variable | Example | Notes |
|---|---|---|
| `CHAIN_ID` | `4663` | Never hardcode in source |
| `RPC_URL` | `https://rpc.mainnet.chain.robinhood.com` | HTTPS only |
| `DATABASE_URL` | `postgres://…` | Shared by worker + API |
| `PORT` | `3080` | Read API listen port (`10000` on Render) |
| `CORS_ORIGINS` | `https://stonkz.green,…` | Comma-separated. **Add more origins by appending to this env var** |
| `RATE_LIMIT_MAX` | `120` | Requests per IP per window |
| `RATE_LIMIT_WINDOW_MS` | `60000` | Window length |
| `CANDLES_MAX_ROWS` | `500` | Hard cap per candles request |
| `CACHE_TTL_*_MS` | see `.env.example` | Per-endpoint TTLs |

Contract addresses come from the `generations` table — **not** env.

## Run

```bash
npm ci
cp .env.example .env   # edit DATABASE_URL
npm run migrate
npm run worker         # indexer
npm run api            # read API (dev)
npm start              # read API (dist, Render)
```

OpenAPI UI: `GET /docs`

## Read API endpoints

All JSON endpoints (except `/health`) filter `generations.visible = true`.  
Errors: `{ "error": { "code": "…", "message": "…" } }` — never SQL or stack traces.

| Method | Path | TTL | Description |
|---|---|---|---|
| `GET` | `/health` | ~2s | DB up, chain head, blocks behind per cursor, row counts, **all generations including hidden** |
| `GET` | `/listings?limit=&offset=` | ~3s | Paginated listings newest-first: addresses, symbol/name, supply, tier (`4k`/`8k`), lock, side bps, launch, spot (active pool), 24h volume/change |
| `GET` | `/listings/:token` | ~3s | Full detail + pool keys, stamped/live ethUsd, creator reserve + vesting state, side pool deployed, main/side spot+liquidity |
| `GET` | `/listings/:token/candles?timeframe=1m\|5m\|1h\|4h\|1d&from=&to=` | ~5s | OHLC+volume for **active** (most recently traded) pool. Includes `pool` / `pool_id`. **Max 500 rows** (`CANDLES_MAX_ROWS`); `truncated: true` when capped |
| `GET` | `/listings/:token/trades?limit=` | ~3s | Recent swaps, newest first. `direction` is trader-perspective (`buy`\|`sell`) |
| `GET` | `/wallets/:address/positions` | none (RPC) | Balances on visible listings + cost basis from indexed swaps; `partial: true` when balance ≠ swap-explained buys |
| `GET` | `/stream/prices` | SSE | Spot pushes for all visible listings |

### Example — listing summary item

```json
{
  "token_address": "0x46639f9c43a688f185c83254564a6d743a27ce36",
  "listing_address": "0x…",
  "symbol": "MOONER",
  "tier": "4k",
  "spot": {
    "price_wad": "123…",
    "pool": "main",
    "pool_id": "0x…",
    "pair_currency": "eth",
    "liquidity": "…",
    "as_of": "2026-08-20T…"
  },
  "volume_24h_pair": "…",
  "change_24h_pct": "12.3456"
}
```

### SSE `/stream/prices`

- **One** server-side `LISTEN stonkz_swaps` (+ short poll fallback) regardless of client count.
- Events: `snapshot` (bootstrap), `price` (updates), `heartbeat` (~15s).
- `id:` = `{block_number}:{pool_id}` for Last-Event-ID style clients.
- **Reconnection:** on drop, reconnect with exponential backoff; treat the stream as best-effort and re-fetch `GET /listings` (or `:token`) for authoritative spot. Heartbeats detect silent stalls — if none arrive for ~2× heartbeat interval, reconnect.

Price payload shape:

```json
{
  "type": "price",
  "token_address": "0x…",
  "listing_address": "0x…",
  "symbol": "MOONER",
  "price_wad": "…",
  "pool_id": "0x…",
  "pool": "main",
  "pair_currency": "eth",
  "liquidity": "…",
  "block_number": "…",
  "block_time": "…"
}
```

## Render

`render.yaml` defines:

- **PostgreSQL** `stonkz-api-db`
- **Worker** `stonkz-api-indexer` — `npm run worker`
- **Web** `stonkz-api-web` — `npm start`, health check `/health`

## Schema / worker (Step A)

Migrations, cursor invariant, swap direction convention — unchanged from Step A. See prior README sections or `migrations/`.

`swap_direction` is trader-facing (`buy`|`sell`) from token-side BalanceDelta: **positive ⇒ buy**.

## Verify

```bash
npm run verify:local-db
npm run verify:live
npm run verify:step-b   # embedded PG + backfill + all read endpoints + SSE
```

## License

Private / STONKZ — public repo for transparency of indexer + read API over public chain data.
