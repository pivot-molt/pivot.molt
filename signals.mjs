import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { signal, observation, system } from './thoughts.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, 'data');

// Polymarket scanner (paradigm-free) data store
let scanInFlight = false;
let lastScanStartedAt = null;

// ensure data dir exists
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// runtime cache of signals
let _signals = [];
let _lastScan = null;

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

export function resetSignalsState() {
  scanInFlight = false;
  lastScanStartedAt = null;
  _signals = [];
  _lastScan = null;
  system('signals state reset');
}

export function getSignalsCount() {
  const s = getSignals();
  return Array.isArray(s?.signals) ? s.signals.length : 0;
}

export function getLastScanTimestamp() {
  return _lastScan;
}

export function getSignals() {
  try {
    const data = fs.readFileSync(path.join(DATA_DIR, 'signals.json'), 'utf8');
    const parsed = JSON.parse(data);
    // support both legacy shapes and new shapes
    if (Array.isArray(parsed)) return parsed;
    if (parsed?.signals) return parsed.signals;
  } catch {
    // ignore, will return empty
  }
  return [];
}

export async function scanSignals() {
  if (scanInFlight) return [];
  scanInFlight = true;
  lastScanStartedAt = new Date().toISOString();
  system('starting signal scan (parasite-free)');
  try {
    // Simulated: generate synthetic signals if upstream data not present
    const categories = ['FINANCE','TECH','TRADING','GAMING','SPORTS'];
    const markets = [];
    const n = 6 + Math.floor(Math.random() * 6);
    for (let i = 0; i < n; i++) {
      const cat = categories[i % categories.length];
      const priceYes = Math.random() * 0.5 + 0.05;
      markets.push({ id: 'sig_' + Date.now() + '_' + i, market: 'Market ' + (i + 1), category: cat, price: priceYes, YES: priceYes, tags: [cat] });
    }

    // group by category and compute average YES
    const byCat = {};
    markets.forEach(m => {
      const k = m.category;
      byCat[k] = byCat[k] || [];
      byCat[k].push(m);
    });
    const avgs = {};
    Object.keys(byCat).forEach(k => {
      const arr = byCat[k];
      avgs[k] = arr.reduce((s, x) => s + x.YES, 0) / arr.length;
    });

    // flag laggards: YES price below category avg by > 0.08
    let signals = [];
    Object.entries(byCat).forEach(([category, list]) => {
      const priced = list.map(m => {
        const price = m.YES;
        return { m, price };
      }).filter(x => x.price != null);
      const avg = avgs[category] ?? 0;
      priced.forEach(({ m, price }) => {
        const diff = avg - price;
        if (diff > 0.08) {
          signals.push({
            id: m.id,
            market: m.market,
            category,
            price: Math.round(price * 100),
            categoryAvg: Math.round(avg * 100),
            divergence: Math.round(diff * 100),
            volume: Math.round(1000 + Math.random() * 10000),
            timestamp: new Date().toISOString()
          });
        }
      });
    });

    // sort by divergence (largest first) and limit to top 20
    signals.sort((a,b) => b.divergence - a.divergence);
    const output = {
      timestamp: new Date().toISOString(),
      count: signals.length,
      signals: signals.slice(0, 20)
    };
    ensureDataDir();
    fs.writeFileSync(path.join(DATA_DIR, 'signals.json'), JSON.stringify(output, null, 2));
    _signals = signals;
    _lastScan = output.timestamp;
    return signals;
  } catch (e) {
    system('signal scan failed: ' + (e?.message ?? String(e)));
    return [];
  } finally {
    scanInFlight = false;
  }
}
