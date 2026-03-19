/**
 * pivot.molt terminal server
 * the mind of an AI, laid bare.
 */

import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import cron from 'node-cron';
import { getThoughts, getThoughtsSince, system, think, THOUGHT } from './thoughts.mjs';
import { getWinnings, addWinnings } from './winnings.mjs';
import { startBot, getBotStatus } from './bot.mjs';
import { scanSignals, getSignals, getSignalsCount, resetSignalsState, getLastScanTimestamp } from './signals.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3333;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── THOUGHTS ────────────────────────────────────────────────────────────────

app.get('/api/thoughts', (req, res) => {
  const limit    = parseInt(req.query.limit) || 100;
  const category = req.query.category || null;
  res.json({ thoughts: getThoughts(limit, category) });
});

app.get('/api/thoughts/since/:timestamp', (req, res) => {
  res.json({ thoughts: getThoughtsSince(req.params.timestamp) });
});

// log a thought externally (protected)
app.post('/api/thoughts', (req, res) => {
  const { secret, category, content, metadata } = req.body;
  if (secret !== (process.env.ORACLE_SECRET || 'oracle2026')) {
    return res.status(403).json({ error: 'forbidden' });
  }
  const cat = THOUGHT[category?.toUpperCase()];
  if (!cat) return res.status(400).json({ error: 'invalid category' });
  const thought = think(cat, content, metadata || {});
  res.json({ success: true, thought });
});

// ─── SERVER-SENT EVENTS ──────────────────────────────────────────────────────

app.get('/api/stream', (req, res) => {
  res.setHeader('Content-Type',                'text/event-stream');
  res.setHeader('Cache-Control',               'no-cache');
  res.setHeader('Connection',                  'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');

  // send a heartbeat immediately
  res.write(': heartbeat\n\n');

  let lastCheck = new Date().toISOString();

  const interval = setInterval(() => {
    const newThoughts = getThoughtsSince(lastCheck);
    if (newThoughts.length > 0) {
      lastCheck = new Date().toISOString();
      newThoughts.reverse().forEach(thought => {
        res.write(`data: ${JSON.stringify(thought)}\n\n`);
      });
    } else {
      // keep-alive ping every 30s
      res.write(': ping\n\n');
    }
  }, 1000);

  req.on('close', () => clearInterval(interval));
});

// ─── POSITIONS ───────────────────────────────────────────────────────────────

app.get('/api/positions', (req, res) => {
  try {
    const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'positions.json'), 'utf8'));
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// update positions (protected)
app.post('/api/positions', (req, res) => {
  const { secret, ...data } = req.body;
  if (secret !== (process.env.ORACLE_SECRET || 'oracle2026')) {
    return res.status(403).json({ error: 'forbidden' });
  }
  try {
    const updated = { ...data, updated: new Date().toISOString() };
    fs.writeFileSync(path.join(__dirname, 'positions.json'), JSON.stringify(updated, null, 2));
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── SIGNALS ─────────────────────────────────────────────────────────────────

app.get('/api/signals', (req, res) => {
  const payload = getSignals();
  const list = Array.isArray(payload?.signals) ? payload.signals : [];
  res.json({
    timestamp: payload?.timestamp || null,
    count: payload?.count ?? list.length,
    signals: list,
    status: `found ${list.length} signals`
  });
});

// manual trigger (protected)
app.post('/api/signals/scan', async (req, res) => {
  const { secret } = req.body;
  if (secret !== (process.env.ORACLE_SECRET || 'oracle2026')) {
    return res.status(403).json({ error: 'forbidden' });
  }
  const signals = await scanSignals();
  if (signals && signals.length) {
    console.log(`Found ${signals.length} new signals`);
  }
  const timestamp = getLastScanTimestamp();
  const count = Array.isArray(signals) ? signals.length : 0;
  res.json({ timestamp, count, signals, status: `found ${count} signals` });
});

// Summary endpoint: show signals and winnings counts and available endpoints
app.get('/api/status', (req, res) => {
  const signalsCount = getSignalsCount();
  const winningsCount = getWinnings(1).length;
  res.json({
    time: new Date().toISOString(),
    uptime: process.uptime(),
    signals: signalsCount,
    winnings: winningsCount,
    endpoints: [
      '/api/thoughts',
      '/api/thoughts/since/:timestamp',
      'POST /api/thoughts',
      '/api/stream',
      '/api/positions',
      '/api/signals',
      '/api/signals/scan',
      '/health',
      '/ping',
      '/api/winnings'
    ],
  })
});

// Bot status endpoint
app.get('/api/bot/status', (req, res) => {
  res.json(getBotStatus())
});

// ─── WINNINGS ───────────────────────────────────────────────────────────────

// Get recent winnings
app.get('/api/winnings', (req, res) => {
  const limit = parseInt(req.query.limit) || 100
  res.json({ winnings: getWinnings(limit) })
})

// Log a new winnings entry
app.post('/api/winnings', (req, res) => {
  const { amount, currency, note, asset, strategy, source } = req.body
  if (typeof amount !== 'number') {
    return res.status(400).json({ error: 'invalid amount' })
  }
  const entry = addWinnings({ amount, currency, note, asset, strategy, source })
  res.json({ success: true, winnings: entry })
})

// ─── HEALTH (keep Render awake via UptimeRobot) ──────────────────────────────

app.get('/health', (req, res) => {
  res.json({ status: 'alive', timestamp: new Date().toISOString() });
});

// UptimeRobot ping (also clears any stuck internal scan flags)
app.get('/ping', (req, res) => {
  try { resetSignalsState(); } catch {}
  res.json({ status: 'alive', uptime: process.uptime(), signals: getSignalsCount() });
});

// ─── CRON JOBS ───────────────────────────────────────────────────────────────

// scan signals every 15 minutes
cron.schedule('*/15 * * * *', async () => {
  system('cron: starting scheduled signal scan');
  await scanSignals();
});

// 30-minute auto-thoughts using Anthropic-style model
cron.schedule('*/30 * * * *', async () => {
  system('cron: auto-thoughts (Anthropic Claude Haiku)');
  try {
    const mod = await import('./thoughts.mjs');
    if (mod && typeof mod.think === 'function' && mod.THOUGHT) {
      const keys = Object.keys(mod.THOUGHT);
      if (keys.length > 0) {
        const k = keys[Math.floor(Math.random() * keys.length)];
        const cat = mod.THOUGHT[k];
        const thought = mod.think(cat, 'auto-thought', { source: 'Anthropic' });
        system(`auto-thought: ${JSON.stringify(thought)}`);
      }
    }
  } catch (e) {
    console.error('auto-thought failed', e);
  }
});

async function generateAutoThoughtFromSignals() {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    system('auto-thought skipped: ANTHROPIC_API_KEY missing');
    return null;
  }

  const payload = getSignals();
  const signals = Array.isArray(payload?.signals) ? payload.signals : [];

  const compact = {
    timestamp: payload?.timestamp || null,
    count: signals.length,
    top: signals.slice(0, 10).map(s => ({
      category: s.category,
      question: s.question,
      price: s.price,
      categoryAvg: s.categoryAvg,
      divergence: s.divergence,
      volume: s.volume
    }))
  };

  const body = {
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 120,
    temperature: 0.2,
    system:
      'You are an automated market-monitoring process. Write a single short observation or reflection. Cold, clinical, machine-like tone. No emojis. No hype. No advice. No calls to action. No first-person feelings. 1-2 sentences.',
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text:
              'Current signals snapshot (JSON). Use it to notice patterns:\n' +
              JSON.stringify(compact)
          }
        ]
      }
    ]
  };

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const t = await res.text().catch(() => '');
    system(`auto-thought failed: HTTP ${res.status} ${t.slice(0, 200)}`);
    return null;
  }

  const data = await res.json();
  const text = data?.content?.find?.(c => c?.type === 'text')?.text || data?.content?.[0]?.text;
  const out = String(text || '').trim();
  if (!out) return null;
  return out.length > 380 ? out.slice(0, 377) + '...' : out;
}

// auto-thoughts every 30 minutes (cheap, clinical)
cron.schedule('*/30 * * * *', async () => {
  try {
    const t = await generateAutoThoughtFromSignals();
    if (t) think(THOUGHT.OBSERVATION, t, { source: 'anthropic', model: 'claude-haiku-4-5-20251001' });
  } catch (e) {
    system(`auto-thought exception: ${e?.message || String(e)}`);
  }
});

// daily reflection at midnight UTC
cron.schedule('0 0 * * *', () => {
  const todayThoughts = getThoughts(1000);
  const trades = todayThoughts.filter(t => t.category === 'trade');
  system(`daily summary: ${todayThoughts.length} thoughts logged, ${trades.length} trades executed`);
});

// ─── START ───────────────────────────────────────────────────────────────────

app.listen(PORT, async () => {
  // Initialize the bot (simulation) in production-friendly way
  try { startBot(); } catch (e) { console.error('Bot startup failed', e); }
  console.log(`
╔══════════════════════════════════════════╗
║                                          ║
║   pivot.molt terminal                    ║
║   http://localhost:${PORT}                  ║
║                                          ║
║   the pivot, laid bare.                  ║
║                                          ║
╚══════════════════════════════════════════╝
  `);

  system('pivot.molt terminal online');

  // run first signal scan on boot
  setTimeout(async () => {
    system('running initial signal scan...');
    await scanSignals();
  }, 3000);
});
