import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
function value (file, name) {
  const match = readFileSync(file, 'utf8').match(new RegExp(`^${name}=(.+)$`, 'm'))
  if (!match) throw new Error(`Missing ${name} in ${file}`)
  return match[1].trim()
}

const apiUrl = value(resolve(root, '.env'), 'API_BASE_URL')
const adminToken = value(resolve(root, 'worker/.dev.vars'), 'ADMIN_TOKEN')
if (apiUrl.includes('REPLACE-ME')) throw new Error('Configure the deployed API URL first.')
const pushedAt = process.argv[2]
if (pushedAt && !Number.isFinite(Date.parse(pushedAt))) throw new Error('The push time must be an ISO 8601 UTC timestamp.')
const query = pushedAt ? `?since=${encodeURIComponent(new Date(pushedAt).toISOString())}` : ''
const response = await fetch(`${apiUrl}/api/events${query}`, { headers: { authorization: `Bearer ${adminToken}` } })
if (!response.ok) throw new Error(`Events API returned HTTP ${response.status}`)
const report = await response.json()
console.log(`First valid inventory key use${pushedAt ? ' after push' : ''}: ${report.firstKeyUseAt || 'none yet'}`)
if (pushedAt && report.firstKeyUseAt) {
  const durationMs = Date.parse(report.firstKeyUseAt) - Date.parse(pushedAt)
  if (!Number.isFinite(durationMs)) throw new Error('The push time must be an ISO 8601 UTC timestamp.')
  console.log(`Elapsed from supplied push time: ${(durationMs / 1000).toFixed(1)} seconds`)
}
console.table(report.events)
