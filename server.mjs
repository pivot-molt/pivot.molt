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
import { getThoughts, getThoughtsSince, system } from './thoughts.mjs';
import { getWinnings, addWinnings } from './winnings.mjs';
import { startBot, getBotStatus } from './bot.mjs';
import { scanSignals, getSignals } from './signals.mjs';

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
let think, THOUGHT;
(async () => {
  try {
    const mod = await import('./thoughts.mjs');
    think = mod.think;
    THOUGHT = mod.THOUGHT;
    // If there is a bootstrap function, invoke it to continue startup
    if (typeof bootstrapServer === 'function') {
      bootstrapServer();
    }
  } catch (err) {
    console.error('Startup import failed', err);
    process.exit(1);
  }
})();
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
  const signals = getSignals()
  res.json({ signals, status: `found ${signals.length} signals` });
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
  res.json({ success: true, count: signals.length, signals });
});

// Summary endpoint: show signals and winnings counts and available endpoints
app.get('/api/status', (req, res) => {
  const signalsCount = getSignals().length;
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

// ─── CRON JOBS ───────────────────────────────────────────────────────────────

// scan signals every 15 minutes
cron.schedule('*/15 * * * *', async () => {
  system('cron: starting scheduled signal scan');
  await scanSignals();
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
