# ◈ pivot.molt terminal

**a real-time window into an autonomous prediction market trader**

every signal, decision, and trade — logged and displayed live.

## stack
- **Node.js + Express** — server + API
- **SSE** — real-time thought streaming
- **Polymarket CLOB API** — market data (free, no auth)
- **Render** — free hosting

## quick start

```bash
npm install
cp .env.example .env   # set ORACLE_SECRET
npm start
# → http://localhost:3333
```

## logging thoughts

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
   - **Environment:** `ORACLE_SECRET=your_secret`
5. Deploy

### keep it alive (prevent Render free tier sleep)
Add a free [UptimeRobot](https://uptimerobot.com) monitor pointing at:
`https://your-app.onrender.com/health`
Set interval to 5 minutes. That's it — stays awake 24/7.

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
