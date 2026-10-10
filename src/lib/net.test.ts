// Run: node --test src/lib/net.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'

const mem = new Map<string, string>()
;(globalThis as { localStorage?: unknown }).localStorage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) }
const { _resetNet, getCached, getCachedChain } = await import('./net.ts')

const parse = (b: unknown) => { const o = b as { n?: number }; if (typeof o?.n !== 'number') throw new Error('bad'); return o.n }

test('fetches, caches, serves cache while fresh, refetches when stale', async () => {
  const real = globalThis.fetch
  let calls = 0
  try {
    globalThis.fetch = (async () => { calls++; return new Response(JSON.stringify({ n: calls })) }) as typeof fetch
    const a = await getCached('t1', 'https://x', { maxAgeMs: 1000, minRetryMs: 0, parse, now: 0 })
    assert.deepEqual([a.data, a.fromCache, a.error], [1, false, null])
    const b = await getCached('t1', 'https://x', { maxAgeMs: 1000, minRetryMs: 0, parse, now: 500 })
    assert.deepEqual([b.data, b.fromCache, calls], [1, true, 1])
    const c = await getCached('t1', 'https://x', { maxAgeMs: 1000, minRetryMs: 0, parse, now: 2000 })
    assert.deepEqual([c.data, c.fromCache, calls], [2, false, 2])
  } finally { globalThis.fetch = real; _resetNet() }
})

test('offline / http error / bad data fall back to the cache with an error flag, and retries are throttled', async () => {
  const real = globalThis.fetch
  let calls = 0
  try {
    globalThis.fetch = (async () => { calls++; return new Response(JSON.stringify({ n: 7 })) }) as typeof fetch
    await getCached('t2', 'https://x', { maxAgeMs: 0, minRetryMs: 0, parse, now: 0 })
    globalThis.fetch = (async () => { calls++; throw new Error('offline') }) as typeof fetch
    const off = await getCached('t2', 'https://x', { maxAgeMs: 0, minRetryMs: 0, parse, now: 10 })
    assert.deepEqual([off.data, off.error, off.fromCache], [7, 'offline', true])
    globalThis.fetch = (async () => { calls++; return new Response('nope', { status: 503 }) }) as typeof fetch
    assert.equal((await getCached('t2', 'https://x', { maxAgeMs: 0, minRetryMs: 0, parse, now: 20 })).error, 'http')
    globalThis.fetch = (async () => { calls++; return new Response(JSON.stringify({ x: 1 })) }) as typeof fetch
    assert.equal((await getCached('t2', 'https://x', { maxAgeMs: 0, minRetryMs: 0, parse, now: 30 })).error, 'parse')
    const before = calls
    await getCached('t2', 'https://x', { maxAgeMs: 0, minRetryMs: 60_000, parse, now: 40 }) // throttled: no request
    assert.equal(calls, before)
  } finally { globalThis.fetch = real; _resetNet() }
})

test('mirror chain: unreachable primary and a 503 page do not stop the third source; all dead keeps the primary error', async () => {
  const real = globalThis.fetch
  const hit: string[] = []
  try {
    globalThis.fetch = (async (u: string) => {
      hit.push(u)
      if (u.includes('api.')) throw new TypeError('net::ERR_CONNECTION_TIMED_OUT') // looks like 'offline'
      if (u.includes('page')) return new Response('<html>Service Unavailable</html>', { status: 503 })
      return new Response(JSON.stringify({ n: 42 }))
    }) as typeof fetch
    const r = await getCachedChain('chain', ['https://api.x', 'https://page.x', 'https://mirror.x'], { maxAgeMs: 0, minRetryMs: 0, parse, now: 0 })
    assert.deepEqual([r.data, r.error, hit.length], [42, null, 3])
    _resetNet(); hit.length = 0
    globalThis.fetch = (async (u: string) => { hit.push(u); throw new TypeError('down ' + u) }) as typeof fetch
    const d = await getCachedChain('chain2', ['https://a', 'https://b'], { maxAgeMs: 0, minRetryMs: 0, parse, now: 0 })
    assert.deepEqual([d.error, hit.length], ['offline', 2]); assert.match(d.detail ?? '', /down https:\/\/a/)
  } finally { globalThis.fetch = real; _resetNet() }
})
