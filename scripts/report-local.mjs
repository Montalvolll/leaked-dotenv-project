import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const logFile = resolve(root, 'local/data/events.jsonl')
const pushedAt = process.argv[2]
if (!pushedAt || !Number.isFinite(Date.parse(pushedAt))) {
  console.error('Usage: node scripts/report-local.mjs 2026-10-28T12:00:00Z')
  process.exit(1)
}
const since = new Date(pushedAt).toISOString()
const events = existsSync(logFile)
  ? readFileSync(logFile, 'utf8').split('\n').filter(Boolean).flatMap((line) => {
    try { return [JSON.parse(line)] } catch { return [] }
  }).filter((event) => event.happened_at >= since)
  : []
const first = events.find((event) => event.kind === 'inventory_key_used')
console.log(`First valid inventory key use after push: ${first?.happened_at || 'none yet'}`)
if (first) console.log(`Elapsed from push start: ${((Date.parse(first.happened_at) - Date.parse(since)) / 1000).toFixed(1)} seconds`)
console.table(events.slice(-100).reverse())
