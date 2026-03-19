# ◈ pivot.molt terminal

**a live trading terminal for prediction market signals + machine logs**

`pivot.molt` is a minimal, always-on feed UI that continuously:
- scans Polymarket markets for **category vs market pricing divergences**
- logs signals + system events as **JSONL thoughts**
- streams new thoughts live via **SSE**

## stack
- **Node.js (ESM) + Express** — server + API
- **node-cron** — scheduled scans + auto-thoughts
- **SSE** — real-time thought streaming
- **Polymarket Gamma + CLOB** — public market metadata + prices
- **Render** — deployment (free tier-friendly)

## quick start (local)

```bash
npm install
cp .env.example .env
npm start
# → http://localhost:3333
```

## environment variables

- **`ORACLE_SECRET`**: shared secret for protected endpoints (defaults to `oracle2026` if unset)
- **`ANTHROPIC_API_KEY`**: optional; enables 30-min “auto-thought” observations

Example `.env`:

```bash
ORACLE_SECRET=change_me
ANTHROPIC_API_KEY=sk-ant-...
```

## signal scanner (how it works)

The scanner uses only public Polymarket endpoints:
- **Gamma** (`gamma-api.polymarket.com`) for markets + tags/categories
- **CLOB** (`clob.polymarket.com`) for midpoint prices (YES token when available)

Logic:
- group markets by tag/category
- compute **average YES price per category**
- flag markets whose YES price is **> 8¢ below** their category average
- rank by divergence, persist top results to `data/signals.json`

## auto-thoughts (every 30 minutes)

If `ANTHROPIC_API_KEY` is set, a cron job calls Anthropic and logs a short, cold, clinical
observation based on the current signals snapshot.

Model used: `claude-haiku-4-5-20251001`

## keep alive (Render free tier)

This project includes:
- `/health` — basic health response
- `/ping` — **health + resets internal scan state** and returns `{ status, uptime, signals }`

Set UptimeRobot to ping:
`https://your-app.onrender.com/ping`

Interval: **5 minutes**.

## API quick reference

- **GET** `/api/thoughts?limit=200&category=signal`
- **GET** `/api/thoughts/since/:timestamp`
- **POST** `/api/thoughts` (protected: `secret`, `category`, `content`, `metadata`)
- **GET** `/api/stream` (SSE)
- **GET** `/api/signals` (returns `timestamp`, `count`, `signals`)
- **POST** `/api/signals/scan` (protected)
- **GET** `/api/positions`
- **POST** `/api/positions` (protected)
- **GET** `/api/status`

## logging thoughts

Thoughts are appended as JSONL under `logs/` (daily files + `latest.jsonl`).

from node:
```js
import { signal, decision, trade, reflection } from './thoughts.mjs';

signal('BTC YES lagging category by 12¢', { divergence: 12, volume: 45000 });
decision('entering long YES on BTC market', { size: 25, confidence: 0.74 });
trade('executed YES @ 38¢', { shares: 65.7, price: 38, invested: 25 });
reflection('markets overreact to short-term news, mean revert fast');
```

from CLI:
```bash
./think.sh signal "crypto category up 8%, individual markets lagging"
./think.sh decision "taking profit on shutdown NO"
```

## deploy to Render (free)

1. Push to GitHub
2. Go to [render.com](https://render.com) → New Web Service
3. Connect your repo
4. Set:
   - **Build command:** `npm install`
   - **Start command:** `npm start`
   - **Environment:** `ORACLE_SECRET=your_secret` (optional: `ANTHROPIC_API_KEY=...`)
5. Deploy

## updating positions

Edit `positions.json` directly, or POST to `/api/positions`:
```bash
curl -X POST https://your-app.onrender.com/api/positions \
  -H "Content-Type: application/json" \
  -d '{
    "secret": "your_secret",
    "positions": [...],
    "track_record": { "wins": 5, "losses": 0, "totalPnl": 633.64, "brierScore": 0.0582 }
  }'
```

## signal categories

| category | meaning |
|---|---|
| `signal` | market signals, divergences found |
| `decision` | trade decisions, sizing, rationale |
| `trade` | executed trades |
| `reflection` | learnings, meta-thoughts |
| `observation` | market patterns, correlations |
| `system` | status updates, scan results |

---

*the oracle doesn't guess. it calculates.*
