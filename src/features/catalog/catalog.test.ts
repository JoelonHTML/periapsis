// Run: node --test src/features/catalog/*.test.ts
// FIXTURES follow the documented shapes of the NASA Exoplanet Archive TAP JSON and the JPL SBDB API. The values are illustrative
// (round numbers), written to exercise the parsers; they are not real catalogue data and the live schemas are unverified here.
import test from 'node:test'
import assert from 'node:assert/strict'
import { AU, DAY, DEG, MU_SUN, norm } from '../../lib/astro.ts'
import { NO_FILTERS, filterExo, inHabitableZone, methodCounts, parseTap, sortExo, travelYears, travelYearsFracC, distLy } from './exo.ts'
import { elementMap, jdOfT, msOfJd, nextPerihelionJd, parseSbdb, periodFromA, smallOrbit, smallState } from './sbdb.ts'

const TAP = [
  { pl_name: 'Fix b', hostname: 'Fix', sy_dist: 10, pl_rade: 1.1, pl_bmasse: 1.3, pl_orbper: 35.5, pl_orbsmax: 0.15, pl_eqt: 250, pl_insol: 0.9, disc_year: 2016, discoverymethod: 'Radial Velocity', st_teff: 3000, ra: 217.4, dec: -62.7 },
  { pl_name: 'Fix c', hostname: 'Fix', sy_dist: 10, pl_rade: null, pl_bmasse: 4, pl_orbper: 5, pl_orbsmax: null, pl_eqt: null, pl_insol: null, disc_year: 2020, discoverymethod: 'Radial Velocity', st_teff: 3000, ra: 217.4, dec: -62.7 },
  { pl_name: 'Demo d', hostname: 'Demo', sy_dist: '100.5', pl_rade: '12', pl_bmasse: null, pl_orbper: '3.2', pl_orbsmax: 0.04, pl_eqt: 1500, pl_insol: 900, disc_year: 2009, discoverymethod: 'Transit', st_teff: 5800, ra: 10, dec: 20 },
  { pl_name: 'Demo e', hostname: 'Demo', sy_dist: 100.5, pl_rade: 1.5, pl_bmasse: 5, pl_orbper: 200, pl_orbsmax: 0.8, pl_eqt: 300, pl_insol: 2.5, disc_year: null, discoverymethod: 'Transit', st_teff: 5800, ra: 10, dec: 20 },
  { pl_name: '  ', hostname: 'x' }, // dropped: no name
  null,
]

test('TAP parser: columns, nulls, string numbers, junk rows', () => {
  const p = parseTap(TAP)
  assert.equal(p.length, 4)
  assert.equal(p[0].name, 'Fix b')
  assert.equal(p[0].host, 'Fix')
  assert.equal(p[0].distPc, 10)
  assert.equal(p[0].mass, 1.3)
  assert.equal(p[1].radius, null)
  assert.equal(p[1].insol, null)
  assert.equal(p[2].distPc, 100.5) // string → number
  assert.equal(p[2].radius, 12)
  assert.equal(p[3].year, null)
  assert.equal(p[0].method, 'Radial Velocity')
  assert.deepEqual(parseTap(JSON.stringify(TAP)), p) // accepts text too
  assert.throws(() => parseTap({ rows: [] }))
  assert.throws(() => parseTap([]))
})

test('habitable-zone filter: 0.35–1.75 × Earth flux and radius < 1.8', () => {
  const p = parseTap(TAP)
  assert.deepEqual(p.filter(inHabitableZone).map((x) => x.name), ['Fix b'])
  assert.equal(inHabitableZone({ insol: 0.35, radius: 1.79 }), true)
  assert.equal(inHabitableZone({ insol: 1.76, radius: 1 }), false)
  assert.equal(inHabitableZone({ insol: 1, radius: 1.8 }), false)
  assert.equal(inHabitableZone({ insol: null, radius: 1 }), false)
  assert.deepEqual(filterExo(p, { ...NO_FILTERS, hz: true }).map((x) => x.name), ['Fix b'])
})

test('search, method, distance filters, sort and counts', () => {
  const p = parseTap(TAP)
  assert.deepEqual(filterExo(p, { ...NO_FILTERS, q: 'demo' }).map((x) => x.name), ['Demo d', 'Demo e'])
  assert.deepEqual(filterExo(p, { ...NO_FILTERS, method: 'Transit' }).length, 2)
  assert.deepEqual(filterExo(p, { ...NO_FILTERS, maxLy: 40 }).map((x) => x.host), ['Fix', 'Fix']) // 10 pc = 32.6 ly
  assert.equal(sortExo(p, 'radius')[0].name, 'Fix b')
  assert.equal(sortExo(p, 'radius').at(-1)!.name, 'Fix c') // null last
  assert.equal(sortExo(p, 'year')[0].name, 'Fix c') // newest first
  assert.deepEqual(methodCounts(p).map((x) => x[1]), [2, 2])
})

test('travel time', () => {
  const ly = distLy({ distPc: 1 })!
  assert.ok(Math.abs(ly - 3.2616) < 1e-3)
  // 1 ly at 17 km/s: c / 17 = 17634 years
  assert.ok(Math.abs(travelYears(1, 17) - 299792.458 / 17) / 17634 < 2e-3)
  assert.equal(travelYearsFracC(4.24, 0.1), 42.4)
})

// ---- SBDB ----
const earthLike = (over: Record<string, unknown> = {}) => ({
  object: { fullname: '  9999 Test   (2000 XX)', kind: 'an', orbit_class: { name: 'Apollo', code: 'APO' } },
  orbit: {
    epoch: '2451545.0',
    elements: [
      { name: 'e', value: '0', sigma: '1e-9', units: null },
      { name: 'a', value: '1.0', units: 'au' },
      { name: 'q', value: '1.0', units: 'au' },
      { name: 'i', value: '0', units: 'deg' },
      { name: 'om', value: '0', units: 'deg' },
      { name: 'w', value: '0', units: 'deg' },
      { name: 'ma', value: '0', units: 'deg' },
      { name: 'tp', value: '2451545.0', units: 'JD' },
      { name: 'per', value: String(periodFromA(1)), units: 'd' },
      { name: 'ad', value: '1.0', units: 'au' },
    ],
    ...over,
  },
  phys_par: [{ name: 'diameter', value: '0.5', units: 'km' }, { name: 'H', value: '18.5' }, { name: 'albedo', value: '0.25' }, { name: 'rot_per', value: '5.1' }, { name: 'bad', value: 'x' }],
})

test('SBDB element parser: name/value list, string numbers, physical data', () => {
  const m = elementMap([{ name: 'e', value: '0.5' }, { name: 'a', value: 2 }, { name: 'zz', value: 'abc' }, { name: 'w', value: null }, null])
  assert.deepEqual(m, { e: 0.5, a: 2 })
  const s = parseSbdb(earthLike())
  assert.equal(s.name, '9999 Test (2000 XX)')
  assert.equal(s.cls, 'Apollo')
  assert.equal(s.a, 1)
  assert.equal(s.epochJd, 2451545)
  assert.equal(s.diameter, 0.5)
  assert.equal(s.H, 18.5)
  assert.equal(s.albedo, 0.25)
  assert.equal(s.rotPer, 5.1)
  const noPhys = parseSbdb({ ...earthLike(), phys_par: undefined })
  assert.equal(noPhys.diameter, null)
  // derived: no per/tp but ma + epoch, no a but q and e
  const o = earthLike()
  o.orbit.elements = [{ name: 'e', value: '0.5' }, { name: 'q', value: '1' }, { name: 'i', value: '5' }, { name: 'om', value: '10' }, { name: 'w', value: '20' }, { name: 'ma', value: '90' }]
  const d = parseSbdb(o)
  assert.ok(Math.abs(d.a - 2) < 1e-12)
  assert.ok(Math.abs(d.per - periodFromA(2)) < 1e-9)
  assert.ok(Math.abs(d.tp - (2451545 - d.per / 4)) < 1e-9)
  assert.ok(Math.abs(d.ad - 3) < 1e-12)
  // rejects
  assert.throws(() => parseSbdb({ list: [] }))
  assert.throws(() => parseSbdb({ object: {}, orbit: { elements: [{ name: 'e', value: '1.2' }, { name: 'q', value: '1' }, { name: 'i', value: '0' }, { name: 'om', value: '0' }, { name: 'w', value: '0' }, { name: 'tp', value: '1' }] } }))
})

test('Kepler propagation: Earth-like object stays at ~1 AU and its period matches 2π√(a³/μ)', () => {
  const s = parseSbdb(earthLike())
  const Tseconds = 2 * Math.PI * Math.sqrt((AU ** 3) / MU_SUN)
  assert.ok(Math.abs(s.per * DAY - Tseconds) < 1)
  for (let k = 0; k < 24; k++) {
    const st = smallState(s, (k / 24) * Tseconds)
    assert.ok(Math.abs(norm(st.r) / AU - 1) < 1e-9)
  }
  const a = smallState(s, 0).r, b = smallState(s, Tseconds).r
  assert.ok(norm([a[0] - b[0], a[1] - b[1], a[2] - b[2]]) < 1e3) // back to the start after one period (< 1000 km)
  assert.ok(Math.abs(smallState(s, 0).r[0] / AU - 1) < 1e-9) // at perihelion on the +x axis (i = Ω = ω = 0)
  // quarter period: 90° further along (+y in the ecliptic)
  const q = smallState(s, Tseconds / 4).r
  assert.ok(Math.abs(q[1] / AU - 1) < 1e-6 && Math.abs(q[0]) / AU < 1e-6)
  // speed = circular speed
  assert.ok(Math.abs(norm(smallState(s, 1000).v) - Math.sqrt(MU_SUN / AU)) < 1e-6)
})

test('eccentric orbit: distance between q and Q, orbit polyline closed', () => {
  const o = earthLike()
  o.orbit.elements = [{ name: 'e', value: '0.5' }, { name: 'a', value: '2' }, { name: 'i', value: '30' }, { name: 'om', value: '40' }, { name: 'w', value: '50' }, { name: 'tp', value: '2451545' }]
  const s = parseSbdb(o)
  assert.ok(Math.abs(s.q - 1) < 1e-12 && Math.abs(s.ad - 3) < 1e-12)
  const rp = norm(smallState(s, 0).r) / AU
  assert.ok(Math.abs(rp - 1) < 1e-9)
  const ra = norm(smallState(s, (s.per / 2) * DAY).r) / AU
  assert.ok(Math.abs(ra - 3) < 1e-6)
  const pts = smallOrbit(s, 120)
  assert.equal(pts.length, 121)
  assert.ok(norm([pts[0][0] - pts[120][0], pts[0][1] - pts[120][1], pts[0][2] - pts[120][2]]) < 1e-3)
  const rs = pts.map((p) => norm(p) / AU)
  assert.ok(Math.min(...rs) > 0.99 && Math.max(...rs) < 3.01)
  // inclined: z reaches sin(i) * r
  assert.ok(Math.max(...pts.map((p) => p[2])) > 0)
})

test('next perihelion from tp and period', () => {
  const s = { tp: 2446467.4, per: 27500 } // Halley-like: tp in the past, period 75.3 yr
  const jd = 2461315.5 // 2026-ish
  const next = nextPerihelionJd(s, jd)
  assert.ok(next >= jd && next - jd < s.per)
  assert.ok(Math.abs((next - s.tp) / s.per - Math.round((next - s.tp) / s.per)) < 1e-9)
  assert.equal(nextPerihelionJd(s, s.tp), s.tp) // exactly at perihelion
  assert.equal(nextPerihelionJd({ tp: 2470000, per: 1000 }, 2461000), 2470000 - 9000) // tp in the future: earlier cycle is the next one
  assert.equal(msOfJd(2440587.5), 0)
  assert.equal(jdOfT(0), 2451545)
  assert.ok(Math.abs(msOfJd(2451545) - Date.UTC(2000, 0, 1, 12)) < 1)
  assert.ok(DEG > 0)
})
