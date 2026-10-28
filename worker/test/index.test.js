import assert from 'node:assert/strict'
import test from 'node:test'
import worker from '../src/index.js'

function setup () {
  const rows = []
  const env = {
    PUBLIC_ORIGIN: 'https://montalvolll.github.io',
    DEMO_USER: 'demo@northstar.test',
    DEMO_PASSWORD: 'test-password',
    INVENTORY_API_KEY: 'test-inventory-key',
    ADMIN_TOKEN: 'test-admin-token',
    AUDIT_SALT: 'test-salt',
    DB: {
      prepare (sql) {
        return {
          bind (...values) {
            return { async run () { rows.push({ kind: values[0], actor_hash: values[1], country: values[2], user_agent: values[3], happened_at: '2026-10-28T00:00:00.000Z' }) } }
          },
          async all () { return { results: [...rows].reverse() } },
          async first () { return rows.find((row) => row.kind === 'inventory_key_used') || null }
        }
      }
    }
  }
  return { env, rows }
}

test('login sends CORS headers and records success without credentials', async () => {
  const { env, rows } = setup()
  const request = new Request('https://api.example.test/api/login', {
    method: 'POST',
    headers: { origin: 'https://montalvolll.github.io', 'content-type': 'application/json' },
    body: JSON.stringify({ email: env.DEMO_USER, password: env.DEMO_PASSWORD })
  })
  const response = await worker.fetch(request, env)
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('access-control-allow-origin'), 'https://montalvolll.github.io')
  assert.equal(rows[0].kind, 'login_success')
  assert.doesNotMatch(JSON.stringify(rows), /test-password/)
})

test('the inventory key returns sample data and records its use', async () => {
  const { env, rows } = setup()
  const request = new Request('https://api.example.test/api/private', {
    headers: { authorization: `Bearer ${env.INVENTORY_API_KEY}` }
  })
  const response = await worker.fetch(request, env)
  assert.equal(response.status, 200)
  assert.equal((await response.json()).inventory[0].sku, 'NS-001')
  assert.equal(rows[0].kind, 'inventory_key_used')
  assert.doesNotMatch(JSON.stringify(rows), /test-inventory-key/)
})

test('wrong keys are denied and the event feed requires the private admin token', async () => {
  const { env, rows } = setup()
  const denied = await worker.fetch(new Request('https://api.example.test/api/private', { headers: { authorization: 'Bearer wrong' } }), env)
  assert.equal(denied.status, 401)
  assert.equal(rows[0].kind, 'private_access_denied')
  const anonymous = await worker.fetch(new Request('https://api.example.test/api/events'), env)
  assert.equal(anonymous.status, 401)
  const authorized = await worker.fetch(new Request('https://api.example.test/api/events', { headers: { authorization: `Bearer ${env.ADMIN_TOKEN}` } }), env)
  assert.equal(authorized.status, 200)
  assert.equal((await authorized.json()).firstKeyUseAt, null)
})
