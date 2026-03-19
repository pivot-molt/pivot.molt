/**
 * signals engine
 * fetches Polymarket data + Paradigm open interest
 * finds divergences = trading opportunities
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { signal, observation, system } from './thoughts.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, 'data');

// Polymarket CLOB API (public, no auth needed for reads)
const POLY_API = 'https://clob.polymarket.com';
const GAMMA_API = 'https://gamma-api.polymarket.com';

// ensure data dir exists
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

/**
 * fetch top Polymarket markets by volume
 */
export async function fetchPolymarkets(limit = 50) {
  try {
    const res = await fetch(`${GAMMA_API}/markets?limit=${limit}&active=true&closed=false&order=volume24hr&ascending=false`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data;
  } catch (e) {
    system(`failed to fetch polymarkets: ${e.message}`);
    return [];
  }
}

/**
 * fetch market prices from CLOB
 */
export async function fetchMarketPrice(conditionId) {
  try {
    const res = await fetch(`${POLY_API}/midpoints?token_id=${conditionId}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (e) {
    return null;
  }
}

/**
 * fetch paradigm open interest data
 */
export async function fetchParadigmData() {
  try {
    const res = await fetch('https://predictions.paradigm.xyz/api/markets');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (e) {
    // paradigm doesn't always expose a clean API — fall back to cached
    system(`paradigm fetch failed: ${e.message}, using cache`);
    try {
      const cached = fs.readFileSync(path.join(DATA_DIR, 'paradigm.json'), 'utf8');
      return JSON.parse(cached);
    } catch {
      return null;
    }
  }
}

/**
 * main signal scan — finds laggard markets
 * markets where category is moving but individual price hasn't caught up
 */
export async function scanSignals() {
  system('starting signal scan...');

  const markets = await fetchPolymarkets(100);
  if (!markets.length) {
    system('no markets returned, aborting scan');
    return [];
  }

  // group by category/tag
  const byCategory = {};
  for (const m of markets) {
    const tags = m.tags || ['uncategorized'];
    for (const tag of tags) {
      if (!byCategory[tag]) byCategory[tag] = [];
      byCategory[tag].push(m);
    }
  }

  const signals = [];

  for (const [category, categoryMarkets] of Object.entries(byCategory)) {
    if (categoryMarkets.length < 2) continue;

    // compute avg YES price for category
    const prices = categoryMarkets
      .map(m => parseFloat(m.outcomePrices?.[0] || m.bestAsk || 0.5))
      .filter(p => p > 0 && p < 1);

    if (!prices.length) continue;

    const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;
    const totalVolume = categoryMarkets.reduce((a, m) => a + parseFloat(m.volume || 0), 0);

    // find laggards — markets priced significantly below category avg
    for (const m of categoryMarkets) {
      const price = parseFloat(m.outcomePrices?.[0] || m.bestAsk || 0.5);
      const divergence = avgPrice - price;

      // significant divergence = potential signal
      if (divergence > 0.08 && totalVolume > 10000) {
        const sig = {
          id: m.conditionId || m.id,
          question: m.question,
          category,
          price: Math.round(price * 100),
          categoryAvg: Math.round(avgPrice * 100),
          divergence: Math.round(divergence * 100),
          volume: Math.round(parseFloat(m.volume || 0)),
          direction: 'YES lagging category',
          confidence: Math.min(0.95, 0.5 + divergence * 2),
          timestamp: new Date().toISOString()
        };

        signals.push(sig);
        signal(
          `[${category}] "${m.question.slice(0, 60)}..." — ${sig.price}¢ vs ${sig.categoryAvg}¢ avg (+${sig.divergence}¢ gap)`,
          { divergence: sig.divergence, volume: sig.volume, confidence: sig.confidence }
        );
      }
    }
  }

  // sort by divergence
  signals.sort((a, b) => b.divergence - a.divergence);

  // save to data dir
  const output = {
    timestamp: new Date().toISOString(),
    count: signals.length,
    signals: signals.slice(0, 20)
  };

  fs.writeFileSync(path.join(DATA_DIR, 'signals.json'), JSON.stringify(output, null, 2));
  system(`scan complete — ${signals.length} signals found, top ${Math.min(20, signals.length)} saved`);

  return signals;
}

/**
 * get saved signals
 */
export function getSignals() {
  try {
    const data = fs.readFileSync(path.join(DATA_DIR, 'signals.json'), 'utf8');
    return JSON.parse(data);
  } catch {
    return { timestamp: null, signals: [], message: 'No signals yet. Scan pending.' };
  }
}
