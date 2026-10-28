const jsonHeaders = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }

function json (data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), { status, headers: { ...jsonHeaders, ...extraHeaders } })
}

function sameSecret (actual, expected) {
  if (!actual || !expected || actual.length !== expected.length) return false
  let difference = 0
  for (let i = 0; i < actual.length; i++) difference |= actual.charCodeAt(i) ^ expected.charCodeAt(i)
  return difference === 0
}

function corsHeaders (request, env) {
  const origin = request.headers.get('origin')
  const allowed = [env.PUBLIC_ORIGIN, 'http://localhost:4173']
  if (!origin || !allowed.includes(origin)) return {}
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': 'Content-Type',
    'vary': 'Origin'
  }
}

async function actorHash (request, env) {
  const address = request.headers.get('cf-connecting-ip') || 'unknown'
  const material = new TextEncoder().encode(`${env.AUDIT_SALT}:${address}`)
  const hash = await crypto.subtle.digest('SHA-256', material)
  return Array.from(new Uint8Array(hash).slice(0, 12), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function recordEvent (request, env, kind) {
  const hash = await actorHash(request, env)
  const country = String(request.cf?.country || 'unknown').slice(0, 2)
  const userAgent = String(request.headers.get('user-agent') || 'unknown').slice(0, 160)
  await env.DB.prepare('INSERT INTO events (kind, actor_hash, country, user_agent) VALUES (?, ?, ?, ?)')
    .bind(kind, hash, country, userAgent).run()
}

async function login (request, env) {
  const extra = corsHeaders(request, env)
  let body
  try {
    const raw = await request.text()
    if (raw.length > 2048) return json({ error: 'Request too large' }, 413, extra)
    body = JSON.parse(raw)
  } catch {
    return json({ error: 'Invalid JSON' }, 400, extra)
  }
  const valid = typeof body?.email === 'string' && typeof body?.password === 'string' &&
    body.email === env.DEMO_USER && sameSecret(body.password, env.DEMO_PASSWORD)
  await recordEvent(request, env, valid ? 'login_success' : 'login_failure')
  return valid ? json({ ok: true, user: env.DEMO_USER }, 200, extra) : json({ error: 'Invalid credentials' }, 401, extra)
}

async function privateData (request, env) {
  const authorization = request.headers.get('authorization') || ''
  const key = authorization.startsWith('Bearer ') ? authorization.slice(7) : ''
  const valid = sameSecret(key, env.INVENTORY_API_KEY)
  await recordEvent(request, env, valid ? 'inventory_key_used' : 'private_access_denied')
  return valid
    ? json({ inventory: [{ sku: 'NS-001', name: 'Demo item', quantity: 42 }] })
    : json({ error: 'Unauthorized' }, 401)
}

async function events (request, env) {
  const authorization = request.headers.get('authorization') || ''
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : ''
  if (!sameSecret(token, env.ADMIN_TOKEN)) return json({ error: 'Unauthorized' }, 401)
  const sinceRaw = new URL(request.url).searchParams.get('since')
  const since = sinceRaw && Number.isFinite(Date.parse(sinceRaw)) ? new Date(sinceRaw).toISOString() : null
  if (sinceRaw && !since) return json({ error: 'Invalid since timestamp' }, 400)
  const [recent, firstUse] = await Promise.all([
    since
      ? env.DB.prepare('SELECT happened_at, kind, actor_hash, country, user_agent FROM events WHERE happened_at >= ? ORDER BY id DESC LIMIT 100').bind(since).all()
      : env.DB.prepare('SELECT happened_at, kind, actor_hash, country, user_agent FROM events ORDER BY id DESC LIMIT 100').all(),
    since
      ? env.DB.prepare("SELECT happened_at FROM events WHERE kind = 'inventory_key_used' AND happened_at >= ? ORDER BY id ASC LIMIT 1").bind(since).first()
      : env.DB.prepare("SELECT happened_at FROM events WHERE kind = 'inventory_key_used' ORDER BY id ASC LIMIT 1").first()
  ])
  return json({ firstKeyUseAt: firstUse?.happened_at || null, events: recent.results })
}

export default {
  async fetch (request, env) {
    const path = new URL(request.url).pathname
    if (request.method === 'OPTIONS' && path === '/api/login') {
      return new Response(null, { status: 204, headers: corsHeaders(request, env) })
    }
    if (request.method === 'GET' && path === '/api/health') return json({ status: 'ok' })
    if (!env.DB || !env.INVENTORY_API_KEY || !env.DEMO_PASSWORD || !env.ADMIN_TOKEN || !env.AUDIT_SALT) {
      return json({ error: 'API is not configured' }, 503)
    }
    try {
      if (request.method === 'POST' && path === '/api/login') return await login(request, env)
      if (request.method === 'GET' && path === '/api/private') return await privateData(request, env)
      if (request.method === 'GET' && path === '/api/events') return await events(request, env)
      return json({ error: 'Not found' }, 404)
    } catch (error) {
      console.error('API request failed', error)
      return json({ error: 'Service unavailable' }, 503, path === '/api/login' ? corsHeaders(request, env) : {})
    }
  }
}
