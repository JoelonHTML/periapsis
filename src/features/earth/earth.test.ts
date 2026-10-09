// Run: node --test src/features/earth/*.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, statSync } from 'node:fs'
import { angularDistanceDeg, latLonToUv, latLonToXyz, xyzToLatLon } from './geo.ts'
import { CITIES, labelCount } from './cities.ts'
import { lineSegmentPositions, loadBorders } from './borders.ts'
import { effectiveLayers, fitTexSize, resolveTier, selectTier, tierConfig } from './tier.ts'
import { EARTH_KEY, parseSettings } from './settings.ts'
import { EARTH_CREDITS } from './credits.ts'

const here = (p: string) => new URL(p, import.meta.url)

test('lat/lon -> xyz -> lat/lon round trip', () => {
  for (const [la, lo] of [[0, 0], [52.37, 4.9], [-33.9, 18.4], [89, -179.5], [-89.9, 120], [0, 180], [10, -90]]) {
    const p = latLonToXyz(la, lo, 6.378)
    assert.ok(Math.abs(Math.hypot(p[0], p[1], p[2]) - 6.378) < 1e-9)
    const [la2, lo2] = xyzToLatLon(p[0], p[1], p[2])
    assert.ok(Math.abs(la2 - la) < 1e-9, `lat ${la}`)
    const dl = Math.abs(((lo2 - lo + 540) % 360) - 180)
    assert.ok(dl < 1e-9 || Math.abs(Math.abs(lo) - 180) < 1e-9, `lon ${lo} -> ${lo2}`)
  }
})

test('frame matches the scene convention: lon 0 on +x, north +y, east towards -z', () => {
  const o = latLonToXyz(0, 0), e = latLonToXyz(0, 90), n = latLonToXyz(90, 0)
  assert.deepEqual(o.map((x) => Math.round(x) + 0), [1, 0, 0])
  assert.deepEqual(e.map((x) => Math.round(x) + 0), [0, 0, -1])
  assert.deepEqual(n.map((x) => Math.round(x) + 0), [0, 1, 0])
  // the same mapping Scene.tsx uses for the launch-site marker
  const lat = 28.5, lon = -80.6
  const site = [Math.cos(lat * Math.PI / 180) * Math.cos(lon * Math.PI / 180), Math.sin(lat * Math.PI / 180), -Math.cos(lat * Math.PI / 180) * Math.sin(lon * Math.PI / 180)]
  latLonToXyz(lat, lon).forEach((v, i) => assert.ok(Math.abs(v - site[i]) < 1e-12))
  assert.deepEqual(latLonToUv(0, 0), [0.5, 0.5])
})

test('angular distance', () => {
  assert.ok(Math.abs(angularDistanceDeg(0, 0, 0, 90) - 90) < 1e-9)
  assert.ok(Math.abs(angularDistanceDeg(52.3676, 4.9041, 48.8566, 2.3522) - 3.87) < 0.1) // Amsterdam-Paris ~ 430 km
})

test('cities: well-known coordinates within 0.05 degrees, sorted, unique, sane', () => {
  const known: Record<string, [number, number]> = {
    Amsterdam: [52.3676, 4.9041], Paris: [48.8566, 2.3522], London: [51.5074, -0.1278], Athens: [37.9838, 23.7275],
    Tokyo: [35.6895, 139.6917], 'New York': [40.7128, -74.006], Sydney: [-33.8688, 151.2093], Cairo: [30.0444, 31.2357],
  }
  for (const [n, [la, lo]] of Object.entries(known)) {
    const c = CITIES.find((x) => x.name === n)
    assert.ok(c, n)
    assert.ok(angularDistanceDeg(c.lat, c.lon, la, lo) < 0.05, n)
  }
  assert.ok(CITIES.length >= 60 && CITIES.length <= 120)
  assert.equal(new Set(CITIES.map((c) => c.name)).size, CITIES.length)
  for (let i = 1; i < CITIES.length; i++) assert.ok(CITIES[i - 1].pop >= CITIES[i].pop)
  for (const c of CITIES) assert.ok(Math.abs(c.lat) <= 90 && Math.abs(c.lon) <= 180 && c.pop > 0, c.name)
  assert.equal(CITIES[0].name, 'Tokyo')
  assert.ok(labelCount(20) === 0 && labelCount(2) > labelCount(6) && labelCount(1.2) === CITIES.length)
})

test('border data: well-formed and within the size budget', () => {
  const size = statSync(here('./data/borders-data.ts')).size
  assert.ok(size <= 150 * 1024, `borders-data.ts is ${size} bytes`)
  const { coast, borders } = loadBorders()
  assert.ok(coast.length > 500 && borders.length > 100)
  let pts = 0
  for (const l of [...coast, ...borders]) {
    assert.ok(l.length >= 4 && l.length % 2 === 0)
    for (let k = 0; k < l.length; k += 2) {
      pts++
      assert.ok(l[k] >= -180.01 && l[k] <= 180.01 && l[k + 1] >= -90.01 && l[k + 1] <= 90.01)
    }
  }
  assert.ok(pts > 20000)
  // spot checks: a coastline vertex near the Dutch coast (Den Helder ~52.95N 4.75E) and a border vertex near Basel (47.56N 7.59E)
  const near = (lines: Float32Array[], la: number, lo: number, tol: number) => lines.some((l) => { for (let k = 0; k < l.length; k += 2) if (Math.hypot(l[k] - lo, l[k + 1] - la) < tol) return true; return false })
  assert.ok(near(coast, 52.95, 4.75, 0.6))
  assert.ok(near(borders, 47.56, 7.59, 0.6))
  // edges that cross the date line are drawn the short way (no segment longer than a few degrees)
  const all = lineSegmentPositions([...coast, ...borders], 1)
  let longest = 0
  for (let i = 0; i < all.length; i += 6) longest = Math.max(longest, Math.hypot(all[i] - all[i + 3], all[i + 1] - all[i + 4], all[i + 2] - all[i + 5]))
  assert.ok(longest < 0.05, `longest drawn segment ${longest}`) // ~ 2 degrees of arc = 0.035
  const seg = lineSegmentPositions(coast.slice(0, 5), 1)
  assert.ok(seg.length % 6 === 0 && seg.length > 0)
  for (let i = 0; i < seg.length; i += 3) assert.ok(Math.abs(Math.hypot(seg[i], seg[i + 1], seg[i + 2]) - 1) < 1e-5)
})

test('asset byte budget (the inlined single-file build grows by 4/3 of this)', () => {
  const sizes = ['assets/earth-day-4096.jpg', 'assets/earth-night-4096.jpg', 'assets/earth-bump-spec-clouds-4096.jpg'].map((f) => statSync(here(`./${f}`)).size)
  const total = sizes.reduce((a, b) => a + b, 0)
  assert.ok(total <= 3.0 * 1024 * 1024, `earth textures total ${total} bytes`)
  const old = statSync(here('../../assets/earth.jpg')).size // the legacy 2048 map used by the other views (now the new day map, downsized)
  assert.ok(old <= 300 * 1024)
  const added = ((total + old) * 4) / 3 + statSync(here('./data/borders-data.ts')).size - 512606 * (4 / 3)
  assert.ok(added <= 5 * 1024 * 1024, `net added to the single-file HTML ~ ${(added / 1024 / 1024).toFixed(2)} MB`)
  for (const f of ['assets/earth-day-4096.jpg', 'assets/earth-night-4096.jpg', 'assets/earth-bump-spec-clouds-4096.jpg']) {
    const b = readFileSync(here(`./${f}`))
    assert.equal(b[0], 0xff); assert.equal(b[1], 0xd8) // JPEG
  }
})

test('quality tiers', () => {
  assert.equal(selectTier({ maxTextureSize: 2048, cores: 8 }), 'low') // old GPU
  assert.equal(selectTier({ maxTextureSize: 8192, cores: 4 }), 'low')
  assert.equal(selectTier({ maxTextureSize: 4096, cores: 8, memoryGb: 2 }), 'low')
  assert.equal(selectTier({ maxTextureSize: 8192, cores: 8, touch: true, dpr: 3 }), 'mid') // typical phone
  assert.equal(selectTier({ maxTextureSize: 8192, cores: 6, touch: true, dpr: 2 }), 'mid')
  assert.equal(selectTier({ maxTextureSize: 16384, cores: 12, dpr: 1 }), 'high') // desktop
  assert.equal(selectTier({ maxTextureSize: 16384 }), 'high') // unknown cores
  assert.equal(resolveTier('low', { maxTextureSize: 16384, cores: 16 }), 'low')
  assert.equal(resolveTier('auto', { maxTextureSize: 16384, cores: 16 }), 'high')
  // texture sizes never exceed the GPU limit; low is smaller than high; clouds shadow only on high
  assert.equal(fitTexSize(4096, 2048), 2048)
  assert.equal(fitTexSize(4096, 3000), 2048)
  assert.equal(fitTexSize(4096, 16384), 4096)
  assert.equal(fitTexSize(2048, 100), 512)
  const lo = tierConfig('low', 4096), mid = tierConfig('mid', 4096), hi = tierConfig('high', 4096)
  assert.ok(lo.dayTex < hi.dayTex && lo.nightTex < hi.nightTex && mid.nightTex < hi.nightTex)
  assert.ok(!lo.cloudShadow && !mid.cloudShadow && hi.cloudShadow)
  assert.ok(!lo.relief && hi.relief)
  assert.ok(tierConfig('high', 2048).dayTex === 2048 && tierConfig('high', 2048).dataTex === 2048)
  assert.ok(Object.values(lo.layers).filter(Boolean).length < Object.values(hi.layers).filter(Boolean).length) // fewer overlays by default
  assert.equal(effectiveLayers(lo, { cities: true }).cities, true)
  assert.equal(effectiveLayers(hi, { clouds: false }).clouds, false)
})

test('settings parsing is tolerant and uses the versioned key', () => {
  assert.equal(EARTH_KEY, 'periapsis.earth.v1')
  assert.deepEqual(parseSettings(null), { quality: 'auto', custom: {}, detail: 'auto' })
  assert.deepEqual(parseSettings('not json'), { quality: 'auto', custom: {}, detail: 'auto' })
  assert.deepEqual(parseSettings('{"quality":"mid","custom":{"clouds":false,"borders":"yes","x":1}}'), { quality: 'mid', custom: { clouds: false }, detail: 'auto' })
  assert.equal(parseSettings('{"quality":"ultra"}').quality, 'auto')
})

test('credits name every source with a licence', () => {
  assert.ok(EARTH_CREDITS.length >= 3)
  for (const c of EARTH_CREDITS) assert.ok(c.who.length > 10 && c.licence.length > 2)
  assert.ok(EARTH_CREDITS.some((c) => c.licence === 'CC BY 4.0'))
})
