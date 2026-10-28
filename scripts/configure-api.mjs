import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const supplied = process.argv[2]
let url
try {
  url = new URL(supplied)
} catch {
  console.error('Usage: node scripts/configure-api.mjs https://your-worker.workers.dev')
  process.exit(1)
}
const isLocal = url.protocol === 'http:' && url.hostname === 'localhost'
if ((url.protocol !== 'https:' && !isLocal) || url.pathname !== '/' || url.search || url.hash) {
  console.error('Provide the HTTPS origin printed by Wrangler or a localhost URL, without a path or query.')
  process.exit(1)
}
const origin = url.origin
const envPath = resolve(root, '.env')
const env = readFileSync(envPath, 'utf8').replace(/^API_BASE_URL=.*$/m, `API_BASE_URL=${origin}`)
writeFileSync(envPath, env)
writeFileSync(resolve(root, 'docs/config.js'), `window.DEMO_API_URL = ${JSON.stringify(origin)}\n`)
console.log(`Demo API URL configured: ${origin}`)
