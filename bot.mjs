import { addWinnings } from './winnings.mjs';

let running = false;
let intervalId = null;
let trades = 0;
let totalProfit = 0;
let lastTradeTs = null;

export function getBotStatus() {
  return {
    running,
    trades,
    totalProfit,
    lastTradeTs,
  };
}

export function startBot() {
  if (running) return;
  const intervalMs = parseInt(process.env.BOT_INTERVAL_MS) || 60000;
  running = true;
  intervalId = setInterval(() => {
    // Simple simulated trade
    const amount = (Math.random() * 200) - 100; // -100 to +100
    const win = Math.random() < 0.6; // 60% win rate in simulation
    const profit = win ? Math.max(amount, 1) : -Math.abs(amount);

    const entry = {
      amount: Number(profit.toFixed(2)),
      currency: 'USD',
      note: win ? 'simulated profit' : 'simulated loss',
      asset: 'SIM',
      strategy: 'BOT_SIM',
      source: 'BOT'
    };

    totalProfit += profit;
    trades += 1;
    lastTradeTs = new Date().toISOString();
    // Persist winnings
    addWinnings(entry);
    console.log(`[BOT] trade ${trades}: ${entry.note} ${entry.amount} ${entry.currency} at ${lastTradeTs}`);
  }, intervalMs);
}
