import { createHash, timingSafeEqual } from 'node:crypto'
import { createServer } from 'node:http'
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, extname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const publicRoot = resolve(root, 'docs')
const logFile = resolve(root, 'local/data/events.jsonl')
const port = Number(process.env.DEMO_PORT || 8787)

function readVars (path) {
  return Object.fromEntries(readFileSync(path, 'utf8').split(/\r?\n/)
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => {
      const at = line.indexOf('=')
      return [line.slice(0, at), line.slice(at + 1)]
    }))
}

const vars = readVars(resolve(root, 'worker/.dev.vars'))
for (const name of ['INVENTORY_API_KEY', 'DEMO_PASSWORD', 'ADMIN_TOKEN', 'AUDIT_SALT']) {
  if (!vars[name]) throw new Error(`Missing ${name} in worker/.dev.vars`)
}
mkdirSync(dirname(logFile), { recursive: true })

function sameSecret (actual, expected) {
  if (typeof actual !== 'string' || typeof expected !== 'string' || !actual || !expected) return false
  const a = Buffer.from(actual)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

function cors (request) {
  const origin = request.headers.origin
  if (origin !== 'https://montalvolll.github.io' && origin !== 'http://localhost:4173') return {}
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': 'Content-Type',
    vary: 'Origin'
  }
}

function sendJson (response, status, body, extraHeaders = {}) {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    ...extraHeaders
  })
  response.end(JSON.stringify(body))
}

function recordEvent (request, kind) {
  const address = String(request.headers['cf-connecting-ip'] || request.socket.remoteAddress || 'unknown')
  const actorHash = createHash('sha256').update(`${vars.AUDIT_SALT}:${address}`).digest('hex').slice(0, 24)
  const event = {
    happened_at: new Date().toISOString(),
    kind,
    actor_hash: actorHash,
    country: String(request.headers['cf-ipcountry'] || 'unknown').slice(0, 2),
    user_agent: String(request.headers['user-agent'] || 'unknown').slice(0, 160)
  }
  appendFileSync(logFile, `${JSON.stringify(event)}\n`, { mode: 0o600 })
  console.log(`${event.happened_at} ${event.kind} ${event.actor_hash} ${event.country}`)
}

async function readBody (request) {
  let raw = ''
  for await (const chunk of request) {
    raw += chunk.toString('utf8')
    if (raw.length > 2048) throw new Error('Request too large')
  }
  return JSON.parse(raw)
}

function readEvents (since) {
  if (!existsSync(logFile)) return []
  return readFileSync(logFile, 'utf8').split('\n').filter(Boolean).flatMap((line) => {
    try { return [JSON.parse(line)] } catch { return [] }
  }).filter((event) => !since || event.happened_at >= since)
}

async function handleApi (request, response, path, url) {
  if (request.method === 'GET' && path === '/api/health') return sendJson(response, 200, { status: 'ok' })
  if (request.method === 'OPTIONS' && path === '/api/login') {
    response.writeHead(204, cors(request))
    return response.end()
  }
  if (request.method === 'POST' && path === '/api/login') {
    let body
    try { body = await readBody(request) } catch { return sendJson(response, 400, { error: 'Invalid request' }, cors(request)) }
    const valid = body?.email === 'demo@northstar.test' && sameSecret(body?.password, vars.DEMO_PASSWORD)
    recordEvent(request, valid ? 'login_success' : 'login_failure')
    return sendJson(response, valid ? 200 : 401, valid ? { ok: true, user: 'demo@northstar.test' } : { error: 'Invalid credentials' }, cors(request))
  }
  if (request.method === 'GET' && path === '/api/private') {
    const auth = request.headers.authorization || ''
    const key = auth.startsWith('Bearer ') ? auth.slice(7) : ''
    const valid = sameSecret(key, vars.INVENTORY_API_KEY)
    recordEvent(request, valid ? 'inventory_key_used' : 'private_access_denied')
    return sendJson(response, valid ? 200 : 401, valid
      ? { inventory: [{ sku: 'NS-001', name: 'Demo item', quantity: 42 }] }
      : { error: 'Unauthorized' })
  }
  if (request.method === 'GET' && path === '/api/events') {
    const auth = request.headers.authorization || ''
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
    if (!sameSecret(token, vars.ADMIN_TOKEN)) return sendJson(response, 401, { error: 'Unauthorized' })
    const raw = url.searchParams.get('since')
    const since = raw && Number.isFinite(Date.parse(raw)) ? new Date(raw).toISOString() : null
    if (raw && !since) return sendJson(response, 400, { error: 'Invalid since timestamp' })
    const events = readEvents(since)
    const first = events.find((event) => event.kind === 'inventory_key_used')
    return sendJson(response, 200, { firstKeyUseAt: first?.happened_at || null, events: events.slice(-100).reverse() })
  }
  return sendJson(response, 404, { error: 'Not found' })
}

function servePage (response, path) {
  if (path === '/config.js') {
    response.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-store' })
    return response.end('window.DEMO_API_URL = window.location.origin\n')
  }
  const allowed = new Map([
    ['/', 'index.html'],
    ['/index.html', 'index.html'],
    ['/main.js', 'main.js'],
    ['/styles.css', 'styles.css']
  ])
  const name = allowed.get(path)
  if (!name) return sendJson(response, 404, { error: 'Not found' })
  const contentType = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }[extname(name)]
  response.writeHead(200, { 'content-type': `${contentType}; charset=utf-8`, 'cache-control': 'no-store' })
  response.end(readFileSync(resolve(publicRoot, name)))
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://localhost')
    if (url.pathname.startsWith('/api/')) return await handleApi(request, response, url.pathname, url)
    if (request.method !== 'GET') return sendJson(response, 405, { error: 'Method not allowed' })
    return servePage(response, url.pathname)
  } catch (error) {
    console.error(error)
    if (!response.headersSent) sendJson(response, 503, { error: 'Service unavailable' })
  }
})

server.listen(port, '127.0.0.1', () => {
  console.log(`Northstar demo ready at http://127.0.0.1:${port}`)
})
