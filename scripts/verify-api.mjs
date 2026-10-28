import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
function value (file, name) {
  const match = readFileSync(file, 'utf8').match(new RegExp(`^${name}=(.+)$`, 'm'))
  if (!match) throw new Error(`Missing ${name} in ${file}`)
  return match[1].trim()
}

const publicEnv = resolve(root, '.env')
const privateEnv = resolve(root, 'worker/.dev.vars')
const apiUrl = value(publicEnv, 'API_BASE_URL')
if (apiUrl.includes('REPLACE-ME')) throw new Error('Configure the deployed API URL first.')

const checks = [
  ['health', await fetch(`${apiUrl}/api/health`)],
  ['login', await fetch(`${apiUrl}/api/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email: value(publicEnv, 'DEMO_USERNAME'),
      password: value(publicEnv, 'DEMO_PASSWORD')
    })
  })],
  ['inventory', await fetch(`${apiUrl}/api/private`, {
    headers: { authorization: `Bearer ${value(publicEnv, 'API_KEY')}` }
  })],
  ['events', await fetch(`${apiUrl}/api/events`, {
    headers: { authorization: `Bearer ${value(privateEnv, 'ADMIN_TOKEN')}` }
  })]
]

for (const [name, response] of checks) {
  console.log(`${name}: HTTP ${response.status}`)
  if (response.status !== 200) process.exitCode = 1
}
