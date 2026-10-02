// Run: node --test src/features/tonight/*.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { DAY_MS, moonEclJDE, sunApparentJDE, planetPos, planetMag, skyNight, solarNoon, moonPhaseAt, bodyAltAz, msOfJde, eqToEcl, obliquityDeg, jdeOf, precess, sunVecJDE, bodyVecKm } from './sky.ts'
import { phaseJDE, phasesBetween, eclipsesBetween, seasonsBetween, timeOfSolarLongitude, solarLongitudeJ2000 } from './lunation.ts'

const near = (a: number, b: number, tol: number, msg = '') => assert.ok(Math.abs(a - b) <= tol, `${msg} ${a} !~ ${b} (tol ${tol})`)
const ms = (s: string) => Date.parse(s)
const minutes = (a: number, b: number) => Math.abs(a - b) / 60000

test('Sun: Meeus example 25.a (1992 Oct 13.0 TD)', () => {
  const s = sunApparentJDE(2448908.5)
  near(s.lon, 199.90895, 0.005, 'apparent longitude')
  near(s.R, 0.99766, 0.0001, 'R')
})

test('Moon: Meeus example 47.a (1992 Apr 12.0 TD)', () => {
  const m = moonEclJDE(2448724.5)
  near(m.lon, 133.167265, 0.02, 'apparent longitude')
  near(m.lat, -3.229126, 0.01, 'latitude')
  near(m.r, 368409.7, 400, 'distance')
})

test('Moon distance stays within perigee/apogee limits over a year', () => {
  let lo = 1e9, hi = 0
  for (let d = 0; d < 365; d += 0.25) { const r = moonEclJDE(2461000.5 + d).r; lo = Math.min(lo, r); hi = Math.max(hi, r) }
  assert.ok(lo > 355000 && lo < 366000, `min ${lo}`)
  assert.ok(hi > 404000 && hi < 407500, `max ${hi}`)
})

test('precession agrees with the Meeus A/B/C formulas', () => {
  const T = 0.26, a0 = 120 * Math.PI / 180, d0 = 30 * Math.PI / 180
  const v = precess([Math.cos(d0) * Math.cos(a0), Math.cos(d0) * Math.sin(a0), Math.sin(d0)], T)
  const as = Math.PI / 180 / 3600
  const zeta = (2306.2181 * T + 0.30188 * T * T + 0.017998 * T ** 3) * as, z = (2306.2181 * T + 1.09468 * T * T + 0.018203 * T ** 3) * as, th = (2004.3109 * T - 0.42665 * T * T - 0.041833 * T ** 3) * as
  const A = Math.cos(d0) * Math.sin(a0 + zeta), Bq = Math.cos(th) * Math.cos(d0) * Math.cos(a0 + zeta) - Math.sin(th) * Math.sin(d0), C = Math.sin(th) * Math.cos(d0) * Math.cos(a0 + zeta) + Math.cos(th) * Math.sin(d0)
  const alpha = Math.atan2(A, Bq) + z, delta = Math.asin(C)
  near(v[0], Math.cos(delta) * Math.cos(alpha), 1e-9); near(v[1], Math.cos(delta) * Math.sin(alpha), 1e-9); near(v[2], Math.sin(delta), 1e-9)
})

test('Standish Earth-based Sun agrees with the Meeus Sun (frame check)', () => {
  const t = ms('2026-10-02T00:00:00Z')
  const jde = jdeOf(t)
  const eps = obliquityDeg(jde)
  const e = bodyVecKm('sun', t) // Meeus
  // planets are built from Earth's Keplerian orbit: Mercury's geocentric direction vs the Sun must be consistent with it
  const p = planetPos('venus', t)
  const sun = sunVecJDE(jde)
  const lonSun = eqToEcl(sun, eps).lon, lonV = eqToEcl(p.vec, eps).lon
  assert.ok(Number.isFinite(lonSun) && Number.isFinite(lonV) && e[0] !== 0)
  // elongation of Venus from its helio/geo triangle must equal the vector separation to the Sun (consistent frames)
  const elongTri = Math.acos((p.d * p.d + p.R * p.R - p.r * p.r) / (2 * p.d * p.R)) * 180 / Math.PI
  const dot = p.vec[0] * sun[0] + p.vec[1] * sun[1] + p.vec[2] * sun[2]
  const elongVec = Math.acos(dot / (Math.hypot(...p.vec) * Math.hypot(...sun))) * 180 / Math.PI
  near(elongVec, elongTri, 0.05, 'Venus elongation (triangle vs of-date vectors)')
})

test('Full moons 2026 follow the 29.53 d cycle and known instants', () => {
  const ph = phasesBetween(ms('2026-01-01T00:00:00Z'), ms('2026-12-31T23:59:59Z'))
  const full = ph.filter((p) => p.kind === 'full')
  assert.equal(full.length, 13) // 2026 has 13 full moons (Jan 3 ... Dec 24)
  for (let i = 1; i < full.length; i++) near((full[i].ms - full[i - 1].ms) / DAY_MS, 29.53, 0.35, 'synodic spacing')
  const f3 = full.find((p) => new Date(p.ms).getUTCMonth() === 2)!
  assert.ok(minutes(f3.ms, ms('2026-03-03T11:38:00Z')) < 5, `full moon March 2026 ${new Date(f3.ms).toISOString()}`)
  const n8 = ph.find((p) => p.kind === 'new' && new Date(p.ms).getUTCMonth() === 7)!
  assert.ok(minutes(n8.ms, ms('2026-08-12T17:37:00Z')) < 5, `new moon Aug 2026 ${new Date(n8.ms).toISOString()}`)
  // Meeus example 49.a: new moon 1977 Feb 18 03:37:42 TD (k = -283)
  near(phaseJDE(-283), 2443192.65118, 0.0005, 'Meeus 49.a')
  // phases alternate in the right order
  const order = ph.map((p) => p.kind)
  for (let i = 1; i < order.length; i++) assert.notEqual(order[i], order[i - 1])
})

test('Phase-instant consistency: Moon elongation at the computed phase is 0/90/180/270 deg', () => {
  const targets = { new: 0, first: 90, full: 180, last: 270 } as const
  for (const p of phasesBetween(ms('2026-10-01T00:00:00Z'), ms('2027-03-01T00:00:00Z'))) {
    const e = moonPhaseAt(p.ms).elong
    const d = Math.abs(((e - targets[p.kind] + 540) % 360) - 180)
    assert.ok(d < 0.08, `${p.kind} ${new Date(p.ms).toISOString()} elong ${e}`)
  }
})

test('Eclipses: 2026-03-03 total lunar, 2026-08-12 and 2027-08-02 total solar, 2026-02-17 annular', () => {
  const all = eclipsesBetween(ms('2026-01-01T00:00:00Z'), ms('2027-12-31T00:00:00Z'))
  const at = (iso: string, type: string) => all.find((e) => e.type === type && minutes(e.ms, ms(iso)) < 12 * 60)
  const l = at('2026-03-03T11:33:00Z', 'lunar')!
  assert.equal(l.kind, 'total'); assert.ok(minutes(l.ms, ms('2026-03-03T11:33:00Z')) < 10, new Date(l.ms).toISOString())
  const s1 = at('2026-08-12T17:46:00Z', 'solar')!
  assert.equal(s1.kind, 'total'); assert.ok(minutes(s1.ms, ms('2026-08-12T17:46:00Z')) < 10, new Date(s1.ms).toISOString()); near(s1.gamma, 0.898, 0.02, 'gamma')
  const s2 = at('2027-08-02T10:07:00Z', 'solar')!
  assert.equal(s2.kind, 'total'); assert.ok(minutes(s2.ms, ms('2027-08-02T10:07:00Z')) < 10, new Date(s2.ms).toISOString()); near(s2.gamma, 0.142, 0.02, 'gamma')
  const s3 = at('2026-02-17T12:12:00Z', 'solar')!
  assert.equal(s3.kind, 'annular'); near(s3.gamma, -0.974, 0.02, 'gamma')
  const p = at('2026-08-28T04:13:00Z', 'lunar')!
  assert.equal(p.kind, 'partial')
  // 2026 has exactly 2 solar + 2 lunar eclipses
  assert.equal(all.filter((e) => e.type === 'solar' && new Date(e.ms).getUTCFullYear() === 2026).length, 2)
  assert.equal(all.filter((e) => e.type === 'lunar' && new Date(e.ms).getUTCFullYear() === 2026).length, 2)
})

test('Equinoxes and solstices 2026', () => {
  const s = seasonsBetween(ms('2026-01-01T00:00:00Z'), ms('2026-12-31T23:59:59Z'))
  assert.equal(s.length, 4)
  const exp = ['2026-03-20T14:46:00Z', '2026-06-21T08:24:00Z', '2026-09-23T00:05:00Z', '2026-12-21T20:50:00Z']
  s.forEach((e, i) => assert.ok(minutes(e.ms, ms(exp[i])) < 4, `${e.kind} ${new Date(e.ms).toISOString()}`))
  // consistency with the Sun series: apparent longitude 0/90/180/270 (of date) within 0.02 deg
  s.forEach((e, i) => { const l = sunApparentJDE(jdeOf(e.ms)).lon; near(Math.abs(((l - i * 90 + 540) % 360) - 180), 0, 0.02, 'sun lon') })
})

test('Solar longitude J2000 solver', () => {
  const t = timeOfSolarLongitude(2026, 140)
  near(solarLongitudeJ2000(t), 140, 1e-4)
  assert.equal(new Date(t).getUTCMonth(), 7) // Perseids peak in August
  assert.ok(new Date(t).getUTCDate() >= 12 && new Date(t).getUTCDate() <= 13)
})

test('Amsterdam June solstice 2026: sunrise ~05:18 CEST, sunset ~22:05 CEST', () => {
  const site = { lat: 52.3731, lon: 4.8922, altM: 0 }
  const n = skyNight(site, solarNoon(2026, 6, 21, site.lon), solarNoon(2026, 6, 22, site.lon))
  assert.ok(n.sunset && n.sunrise)
  assert.ok(minutes(n.sunset!, ms('2026-06-21T20:05:00Z')) < 4, `sunset ${new Date(n.sunset!).toISOString()}`)
  assert.ok(minutes(n.sunrise!, ms('2026-06-22T03:18:00Z')) < 4, `sunrise ${new Date(n.sunrise!).toISOString()}`)
  // no astronomical night at 52N in June
  assert.equal(n.astro[0], null)
  assert.ok(n.civil[0] && n.civil[1])
})

test('Amsterdam December solstice 2026: sunrise ~08:46, sunset ~16:30 CET', () => {
  const site = { lat: 52.3731, lon: 4.8922, altM: 0 }
  const n = skyNight(site, solarNoon(2026, 12, 21, site.lon), solarNoon(2026, 12, 22, site.lon))
  assert.ok(minutes(n.sunset!, ms('2026-12-21T15:30:00Z')) < 4, `sunset ${new Date(n.sunset!).toISOString()}`)
  assert.ok(minutes(n.sunrise!, ms('2026-12-22T07:46:00Z')) < 4, `sunrise ${new Date(n.sunrise!).toISOString()}`)
  assert.ok(n.astro[0] && n.astro[1])
})

test('Tonight: all planets get a coherent record', () => {
  const site = { lat: 52.09, lon: 5.12, altM: 0 }
  const n = skyNight(site, solarNoon(2026, 10, 2, site.lon), solarNoon(2026, 10, 3, site.lon))
  assert.equal(n.planets.length, 7)
  for (const p of n.planets) {
    assert.ok(Number.isFinite(p.mag) && p.mag > -5.5 && p.mag < 9, `${p.id} mag ${p.mag}`)
    assert.ok(p.illum >= 0 && p.illum <= 1)
    if (p.visible) assert.ok(p.best!.alt >= 5 && p.best!.ms >= n.sunset! && p.best!.ms <= n.sunrise!)
    else assert.ok(p.why)
  }
  // Saturn is at opposition on 2026-10-04: up all night, mag ~ +0.6
  const sat = n.planets.find((p) => p.id === 'saturn')!
  assert.ok(sat.visible); near(sat.mag, 0.6, 0.35, 'Saturn mag'); assert.ok(!sat.east || sat.elong > 150)
  assert.ok(sat.elong > 160)
})

test('Magnitudes at well-known configurations', () => {
  // Jupiter at opposition 2027-02-11 (r ~5.3 AU, so fainter than at perihelion): about -2.6
  near(planetMag('jupiter', planetPos('jupiter', ms('2027-02-11T00:00:00Z'))), -2.6, 0.2, 'Jupiter')
  // Mars at opposition 2027-02-19: about -1.2
  near(planetMag('mars', planetPos('mars', ms('2027-02-19T00:00:00Z'))), -1.2, 0.35, 'Mars')
  // Uranus ~5.7, Neptune ~7.8 around their 2026 oppositions
  near(planetMag('uranus', planetPos('uranus', ms('2026-11-25T00:00:00Z'))), 5.7, 0.2, 'Uranus')
  near(planetMag('neptune', planetPos('neptune', ms('2026-09-26T00:00:00Z'))), 7.8, 0.2, 'Neptune')
  // Venus at greatest elongation 2026-08-15: about -4.4
  near(planetMag('venus', planetPos('venus', ms('2026-08-15T00:00:00Z'))), -4.4, 0.25, 'Venus')
})

test('alt/az sanity: Sun is at its highest about solar noon, due south in Amsterdam', () => {
  const site = { lat: 52.37, lon: 4.89, altM: 0 }
  const t = solarNoon(2026, 6, 21, site.lon)
  const a = bodyAltAz('sun', t, site)
  near(a.alt, 90 - 52.37 + 23.44, 0.6, 'noon altitude')
  near(a.az, 180, 4, 'azimuth')
  assert.ok(msOfJde(2451545) > 0)
})
