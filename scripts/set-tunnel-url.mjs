import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const supplied = process.argv[2]
let url
try { url = new URL(supplied) } catch {
  console.error('Usage: node scripts/set-tunnel-url.mjs https://YOUR-TUNNEL.trycloudflare.com')
  process.exit(1)
}
if (url.protocol !== 'https:' || url.pathname !== '/' || url.search || url.hash) {
  console.error('Provide the HTTPS tunnel origin, without a path or query.')
  process.exit(1)
}
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const path = resolve(root, '.env')
const old = readFileSync(path, 'utf8')
if (!/^API_BASE_URL=/m.test(old)) throw new Error('Missing API_BASE_URL in .env')
writeFileSync(path, old.replace(/^API_BASE_URL=.*$/m, `API_BASE_URL=${url.origin}`))
console.log(`Demo URL set in .env: ${url.origin}`)

