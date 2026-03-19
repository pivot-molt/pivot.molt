import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_FILE = path.join(__dirname, 'winnings.json')

function loadWinnings() {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8')
    if (!raw) return []
    return JSON.parse(raw)
  } catch (e) {
    return []
  }
}

function saveWinnings(items) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(items, null, 2))
}

export function getWinnings(limit = 100) {
  const data = loadWinnings()
  return data
    .slice()
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, limit)
}

export function addWinnings(entry) {
  const data = loadWinnings()
  const newEntry = {
    id: 'w' + Date.now(),
    timestamp: new Date().toISOString(),
    ...entry
  }
  data.push(newEntry)
  saveWinnings(data)
  return newEntry
}
