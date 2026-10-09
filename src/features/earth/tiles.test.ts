// Run: node --test src/features/earth/*.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { latOfY, lonOfX, Lru, MAX_LAT, selectTiles, tileAt, tileGrid, tileKey, TILE_SOURCES, texelPixels, xOfLon, yOfLat, detailEnabled, type TileId } from './tiles.ts'
import { TileStore } from './tileStore.ts'

const near = (a: number, b: number, e = 1e-9) => assert.ok(Math.abs(a - b) < e, `${a} vs ${b}`)

test('tile <-> lat/lon (slippy-map reference values)', () => {
  // Amsterdam 52.3676N 4.9041E at z=10 is tile 525/336 (OSM)
  assert.deepEqual(tileAt(52.3676, 4.9041, 10), { z: 10, x: 525, y: 336 })
  assert.deepEqual(tileAt(0, 0, 1), { z: 1, x: 1, y: 1 })
  assert.deepEqual(tileAt(10, 180, 3), { z: 3, x: 0, y: 3 }) // date line wraps
  near(lonOfX(0, 5), -180); near(lonOfX(32, 5), 180)
  near(latOfY(0, 0), MAX_LAT, 1e-9); near(latOfY(1, 0), -MAX_LAT, 1e-9); near(latOfY(0.5, 0), 0)
  for (const [la, lo, z] of [[52.37, 4.9, 12], [-33.9, 18.4, 7], [0.1, -179.9, 3]]) {
    near(latOfY(yOfLat(la, z), z), la, 1e-9); near(lonOfX(xOfLon(lo, z), z), lo, 1e-9)
  }
  near(yOfLat(89.9, 4), 0); near(yOfLat(-89.9, 4), 16) // clamped at the Mercator limit
})

test('mercator: tile rows are not evenly spaced in latitude but v is linear in the row', () => {
  const t: TileId = { z: 6, x: 33, y: 20 } // ~52N
  const g = tileGrid(t, 8)
  const lat = (j: number) => Math.asin(g.pos[(j * 9) * 3 + 1]) * 180 / Math.PI
  assert.ok(lat(0) > lat(8))
  assert.ok(Math.abs((lat(0) - lat(1)) - (lat(7) - lat(8))) > 1e-4) // spacing differs
  near(g.tuv[1], 1); near(g.tuv[(8 * 9) * 2 + 1], 0); near(g.tuv[8 * 2], 1) // north row v=1, south row v=0, east edge u=1
  near(lat(0), latOfY(20, 6), 1e-5); near(lat(8), latOfY(21, 6), 1e-5)
  // v on the middle row equals the Mercator fraction, not the latitude fraction
  const vMid = yOfLat(lat(4), 6) - 20
  near(vMid, 0.5, 1e-6)
})

test('tile grid triangles face outwards and global uv matches', () => {
  const t: TileId = { z: 5, x: 16, y: 10 }, g = tileGrid(t, 4)
  for (let f = 0; f < g.index.length; f += 3) {
    const [a, b, c] = [0, 1, 2].map((k) => g.index[f + k] * 3)
    const p = (o: number) => [g.pos[o], g.pos[o + 1], g.pos[o + 2]]
    const A = p(a), B = p(b), C = p(c)
    const e1 = B.map((v, i) => v - A[i]), e2 = C.map((v, i) => v - A[i])
    const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]]
    assert.ok(n[0] * A[0] + n[1] * A[1] + n[2] * A[2] > 0)
  }
  near(g.uv[0], (lonOfX(16, 5) + 180) / 360, 1e-6); near(g.uv[1], (latOfY(10, 5) + 90) / 180, 1e-6)
})

const view = (alt: number, lat: number, lon: number, fovDeg = 45, hPx = 800) => {
  const d = 1 + alt, la = lat * Math.PI / 180, lo = lon * Math.PI / 180
  return { cam: [d * Math.cos(la) * Math.cos(lo), d * Math.sin(la), -d * Math.cos(la) * Math.sin(lo)] as [number, number, number], pixelRad: 2 * Math.tan(fovDeg * Math.PI / 360) / hPx }
}

// camera looking at the globe centre: a cone with the diagonal field of view
const cone = (cam: [number, number, number], fovDeg = 45) => (c: [number, number, number], r: number) => {
  const d = Math.hypot(...cam), v = [c[0] - cam[0], c[1] - cam[1], c[2] - cam[2]], l = Math.hypot(...v)
  const cos = -(v[0] * cam[0] + v[1] * cam[1] + v[2] * cam[2]) / l / d
  return Math.acos(Math.min(1, cos)) < fovDeg * 0.6 * Math.PI / 180 + Math.asin(Math.min(1, r / l))
}

test('subdivision: far away nothing (bundled map), closer = deeper, always bounded', () => {
  assert.equal(selectTiles({ ...view(4, 52, 5), minZ: 5, maxZ: 14 }).length, 0)
  let prev = 0
  for (const alt of [1, 0.3, 0.05, 0.005, 0.0005, 0.00005]) {
    const v = view(alt, 52.37, 4.9), s = selectTiles({ ...v, inFrustum: cone(v.cam), minZ: 5, maxZ: 14 })
    const z = Math.max(0, ...s.map((t) => t.z))
    assert.ok(z >= prev, `alt ${alt}: z ${z} < ${prev}`)
    assert.ok(s.length < 600, `alt ${alt}: ${s.length} tiles`)
    prev = z
  }
  const v0 = view(0.00005, 52.37, 4.9), s = selectTiles({ ...v0, inFrustum: cone(v0.cam), minZ: 5, maxZ: 14 }) // ~320 m up
  assert.equal(Math.max(...s.map((t) => t.z)), 14)
  assert.ok(s[0].z === 14 && s[0].x === tileAt(52.37, 4.9, 14).x) // nearest tile first, right under the camera
  // capped by the source's maximum zoom
  assert.equal(Math.max(...selectTiles({ ...view(0.00005, 52.37, 4.9), minZ: 5, maxZ: 8 }).map((t) => t.z)), 8)
})

test('culling: horizon, frustum, camera inside the globe', () => {
  const o = { ...view(0.002, 0, 0), minZ: 5, maxZ: 12 }
  const all = selectTiles(o)
  assert.ok(all.length > 0)
  // nothing from the far side of the planet
  for (const t of all) assert.ok(lonOfX(t.x, t.z) < 40 && lonOfX(t.x + 1, t.z) > -40, `tile ${tileKey(t.z, t.x, t.y)} is beyond the horizon`)
  assert.equal(selectTiles({ ...o, inFrustum: () => false }).length, 0)
  assert.equal(selectTiles({ ...o, cam: [0.5, 0, 0] }).length, 0)
  // texel/pixel metric: halves with every zoom level
  const c = view(3, 0, 0).cam, a = texelPixels({ z: 8, x: 128, y: 128 }, c, o.pixelRad), b = texelPixels({ z: 9, x: 256, y: 256 }, c, o.pixelRad)
  assert.ok(a / b > 1.6 && a / b < 2.4, `${a / b}`)
})

test('LRU evicts the oldest first and spares protected keys', () => {
  const ev: string[] = []
  const l = new Lru<number>(3, (k) => ev.push(k))
  for (const k of ['a', 'b', 'c', 'd']) l.set(k, 1)
  l.get('a') // a is fresh now
  l.trim(new Set())
  assert.deepEqual(ev, ['b']); assert.equal(l.size, 3)
  l.set('e', 1); l.set('f', 1)
  l.trim(new Set(['c', 'd'])) // c and d are on screen: a and e go instead
  assert.deepEqual(ev, ['b', 'a', 'e']); assert.equal(l.size, 3)
  l.set('g', 1); l.set('h', 1)
  l.trim(new Set(['c', 'd', 'f', 'g', 'h'])) // everything protected: the cap may be exceeded, nothing visible is dropped
  assert.equal(l.size, 5)
  l.clear(); assert.equal(l.size, 0); assert.equal(ev.length, 8)
})

const tick = () => new Promise((r) => setImmediate(r))
const ids = (n: number, z = 9): TileId[] => Array.from({ length: n }, (_, x) => ({ z, x, y: 0 }))

test('store: at most 6 requests in flight, queue drains, ready tiles are served', async () => {
  let live = 0, peak = 0
  const gate: (() => void)[] = []
  const st = new TileStore<string>(TILE_SOURCES, (url) => { live++; peak = Math.max(peak, live); return new Promise((res) => gate.push(() => { live--; res(url) })) }, () => {}, { max: 100 })
  st.request(ids(10), new Set())
  assert.equal(peak, 6)
  while (gate.length) { gate.shift()!(); await tick() }
  assert.equal(st.size, 10); assert.equal(peak, 6)
  assert.match(st.get(9, 3, 0)!, /^https:\/\/tiles\.maps\.eox\.at\/.*\/9\/0\/3\.jpg$/) // {z}/{y}/{x}
})

test('store: evicts beyond max (disposing) but keeps what is visible', async () => {
  const gone: string[] = []
  const st = new TileStore<string>(TILE_SOURCES, async (u) => u, (v) => gone.push(v), { max: 4 })
  const keep = new Set(ids(2).map((t) => tileKey(t.z, t.x, t.y)))
  st.request(ids(8), keep); await tick(); await tick(); await tick()
  st.request(ids(2), keep)
  assert.ok(st.size <= 4 && st.size >= 2, `size ${st.size}`)
  assert.ok(st.get(9, 0, 0) && st.get(9, 1, 0))
  assert.ok(gone.length >= 4)
})

test('store: fails over silently to the next source after 5 errors; all dead = idle', async () => {
  const urls: string[] = []
  let t = 0
  const st = new TileStore<string>(TILE_SOURCES, (u) => { urls.push(u); return u.includes('eox') ? Promise.reject(new Error('blocked')) : Promise.resolve(u) }, () => {}, { max: 50, now: () => t })
  st.request(ids(6, 7), new Set()); await tick(); await tick()
  assert.equal(st.active?.id, 'gibs')
  st.request(ids(6, 7), new Set()); await tick(); await tick()
  assert.ok(st.get(7, 2, 0)?.includes('gibs.earthdata'))
  // z beyond the fallback's maximum zoom is not requested at all
  const n = urls.length
  st.request([{ z: 12, x: 0, y: 0 }], new Set()); await tick()
  assert.equal(urls.length, n)

  const dead = new TileStore<string>(TILE_SOURCES, () => Promise.reject(new Error('offline')), () => {}, { max: 5, now: () => t, retryMs: 10 })
  for (let i = 0; i < 4; i++) { dead.request(ids(6, 7), new Set()); await tick(); await tick(); t += 100 }
  assert.equal(dead.active, null)
  dead.request(ids(6), new Set()) // no throw, no requests
  assert.equal(dead.size, 0)
})

test('store: a failed tile is retried only after the cool-down', async () => {
  let calls = 0, t = 0
  const st = new TileStore<string>([TILE_SOURCES[0]], () => { calls++; return calls === 1 ? Promise.reject(new Error('x')) : Promise.resolve('ok') }, () => {}, { max: 5, now: () => t, retryMs: 1000 })
  const w = ids(1)
  st.request(w, new Set()); await tick(); await tick()
  st.request(w, new Set()); await tick(); assert.equal(calls, 1)
  t = 1500; st.request(w, new Set()); await tick(); await tick()
  assert.equal(calls, 2); assert.equal(st.get(9, 0, 0), 'ok')
})

test('detail setting: auto is off on low tier and data saver', () => {
  assert.equal(detailEnabled('auto', false, false), true)
  assert.equal(detailEnabled('auto', true, false), false)
  assert.equal(detailEnabled('auto', false, true), false)
  assert.equal(detailEnabled('on', true, true), true)
  assert.equal(detailEnabled('off', false, false), false)
})
