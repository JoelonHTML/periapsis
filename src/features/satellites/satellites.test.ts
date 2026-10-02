// Run: node --test src/features/satellites/*.test.ts
// Fixture: the ISS element set printed in the satellite.js README (real data, epoch 2019 day 156.509). No invented elements.
import test from 'node:test'
import assert from 'node:assert/strict'
import { DAY, DEG, MU_EARTH, RE, earthPlan, j2Rates, toJ2000 } from '../../lib/astro.ts'
import { parseGpJson, parseTleText, satrecOf, tleChecksum, epochMs } from './tle.ts'
import { compass8, groundTrack, isSunlit, lookFromEcef, orbitInfo, stateAt, subSolar } from './orbit.ts'
import { findPasses } from './passes.ts'
import { betaAngle, eclipseAt, yearSeries } from './eclipse.ts'
import { cacheStale, readCache, writeCache } from './data.ts'

const L1 = '1 25544U 98067A   19156.50900463  .00003075  00000-0  59442-4 0  9992'
const L2 = '2 25544  51.6433  59.2583 0008217  16.4489 347.6017 15.51174618173442'
const iss = parseTleText(`ISS (ZARYA)\n${L1}\n${L2}\n`)[0]
const sr = satrecOf(iss)!
const T0 = epochMs(iss)

test('TLE checksum and parsing', () => {
  assert.equal(tleChecksum(L1), 2)
  assert.equal(tleChecksum(L2), 2)
  assert.equal(iss.name, 'ISS (ZARYA)')
  assert.equal(iss.norad, 25544)
  assert.throws(() => parseTleText(`${L1.slice(0, 68)}5\n${L2}`), /bad-tle/)
  assert.throws(() => parseTleText('hello'), /bad-tle/)
  assert.equal(new Date(T0).toISOString().slice(0, 10), '2019-06-05')
})

test('SGP4: ISS altitude, speed, period, latitude bound', () => {
  const info = orbitInfo(sr)
  assert.ok(Math.abs(info.periodS / 60 - 1440 / 15.51174618) < 0.5, `period ${info.periodS / 60}`)
  assert.ok(Math.abs(info.incDeg - 51.6433) < 1e-3)
  let maxLat = 0
  for (let k = 0; k < 200; k++) {
    const s = stateAt(sr, T0 + k * 30000)!
    assert.ok(s.alt > 380 && s.alt < 440, `alt ${s.alt}`)
    assert.ok(s.speed > 7.5 && s.speed < 7.8, `speed ${s.speed}`)
    maxLat = Math.max(maxLat, Math.abs(s.lat))
  }
  assert.ok(maxLat > 50 && maxLat <= 52.0 /* geodetic latitude exceeds the geocentric inclination by ~0.15° */, `maxLat ${maxLat}`)
  const g = groundTrack(sr, T0, 0, 5400, 60)
  assert.ok(g.length > 80)
})

test('look angles: hand-checked geometry at lat 0, lon 0', () => {
  const o = { lat: 0, lon: 0, altM: 0 }
  const up = lookFromEcef(o, [6378.137 + 500, 0, 0])
  assert.ok(Math.abs(up.el - 90) < 1e-9 && Math.abs(up.range - 500) < 1e-9)
  const north = lookFromEcef(o, [6378.137, 0, 1000])
  assert.ok(Math.abs(north.el) < 1e-9 && Math.abs(north.az) < 1e-9)
  const east = lookFromEcef(o, [6378.137, 1000, 0])
  assert.ok(Math.abs(east.az - 90) < 1e-9)
  // 45° elevation toward the south: offset (up 1000, south 1000)
  const se = lookFromEcef(o, [6378.137 + 1000, 0, -1000])
  assert.ok(Math.abs(se.el - 45) < 1e-9 && Math.abs(se.az - 180) < 1e-9)
  assert.equal(compass8(0), 0); assert.equal(compass8(95), 2); assert.equal(compass8(350), 0); assert.equal(compass8(225), 5)
})

test('shadow and sub-solar point', () => {
  const sun: [number, number, number] = [1.5e8, 0, 0]
  assert.equal(isSunlit([-(RE + 400), 0, 0], sun), false)
  assert.equal(isSunlit([RE + 400, 0, 0], sun), true)
  assert.equal(isSunlit([-(RE + 400), RE + 1, 0], sun), true)
  const ss = subSolar(Date.UTC(2026, 5, 21, 12)) // June solstice, noon UT: near lat +23.4, lon ≈ 0 (equation of time ~ -2 min)
  assert.ok(Math.abs(ss.lat - 23.4) < 0.3, `lat ${ss.lat}`)
  assert.ok(Math.abs(ss.lon) < 2, `lon ${ss.lon}`)
})

test('pass finder over Utrecht for the ISS fixture (propagated near epoch)', () => {
  const o = { lat: 52.09, lon: 5.12, altM: 0 }
  const ps = findPasses(sr, o, T0, 3, 0)
  assert.ok(ps.length >= 4 && ps.length <= 25, `${ps.length} passes`)
  for (const p of ps) {
    assert.ok(p.setMs > p.riseMs && p.maxMs >= p.riseMs && p.maxMs <= p.setMs)
    assert.ok((p.setMs - p.riseMs) / 60000 < 12, 'LEO pass shorter than 12 min')
    assert.ok(p.maxEl >= 0 && p.maxEl <= 90)
  }
  assert.ok(ps.some((p) => p.maxEl > 20))
})

test('beta angle: ISS-like range, sun-synchronous stability', () => {
  const t0 = toJ2000(Date.UTC(2026, 2, 20, 12))
  const mk = (inc: number, alt: number, lon: number) => earthPlan({ rpAlt: alt, raAlt: alt, incDeg: inc, parkAlt: alt, wDeg: null }, 28.5, lon, t0, 1000, 300, 2.2, 5)
  const issP = mk(51.64, 420, -80)
  const ys = yearSeries(issP, t0, 366)
  const mx = Math.max(...ys.beta) / DEG, mn = Math.min(...ys.beta) / DEG
  assert.ok(mx <= 51.64 + 23.45 + 0.1 && mn >= -(51.64 + 23.45 + 0.1), `${mn}..${mx}`)
  assert.ok(mx > 55 && mn < -55, 'ISS-like beta swings widely')
  const ssoInc = j2Rates(RE + 700, 0, 0).ssoInc / DEG
  const sso = yearSeries(mk(ssoInc, 700, 0), t0, 366)
  const range = (Math.max(...sso.beta) - Math.min(...sso.beta)) / DEG
  assert.ok(range < 20, `SSO beta range ${range}`)
})

test('eclipse: circular LEO matches closed form; high beta has none', () => {
  const t0 = toJ2000(Date.UTC(2026, 2, 20, 12))
  const alt = 500, r = RE + alt
  const plan = earthPlan({ rpAlt: alt, raAlt: alt, incDeg: 51.6, parkAlt: alt, wDeg: null }, 28.5, -80, t0, 1000, 300, 2.2, 5)
  for (let d = 0; d < 120; d += 17) {
    const t = t0 + d * DAY, beta = betaAngle(plan, t), ec = eclipseAt(plan, t)
    const bStar = Math.asin(RE / r)
    const exp = Math.abs(beta) < bStar ? Math.acos(Math.sqrt(1 - (RE / r) ** 2) / Math.cos(beta)) / Math.PI : 0
    assert.ok(Math.abs(ec.fraction - exp) < 0.004, `d${d} beta ${beta / DEG}: ${ec.fraction} vs ${exp}`)
    assert.ok(Math.abs(ec.period - 2 * Math.PI * Math.sqrt(r ** 3 / MU_EARTH)) < 1e-6)
  }
  const ys = yearSeries(plan, t0, 366)
  assert.ok(Math.max(...ys.dur) > 30 * 60 && Math.max(...ys.dur) < 40 * 60, `max eclipse ${Math.max(...ys.dur) / 60} min`)
  assert.ok(Math.min(...ys.frac) === 0 || Math.min(...ys.frac) < 0.2)
})

test('GP JSON parsing (CelesTrak field names) and cache logic', () => {
  const recs = parseGpJson([{
    OBJECT_NAME: 'ISS (ZARYA)', OBJECT_ID: '1998-067A', EPOCH: '2019-06-05T12:12:57.999072', MEAN_MOTION: 15.51174618, ECCENTRICITY: 0.0008217,
    INCLINATION: 51.6433, RA_OF_ASC_NODE: 59.2583, ARG_OF_PERICENTER: 16.4489, MEAN_ANOMALY: 347.6017, EPHEMERIS_TYPE: 0, CLASSIFICATION_TYPE: 'U',
    NORAD_CAT_ID: 25544, ELEMENT_SET_NO: 999, REV_AT_EPOCH: 17344, BSTAR: 0.000059442, MEAN_MOTION_DOT: 0.00003075, MEAN_MOTION_DDOT: 0,
  }, { OBJECT_NAME: 'broken' }])
  assert.equal(recs.length, 1)
  const a = stateAt(satrecOf(recs[0])!, T0)!, b = stateAt(sr, T0)!
  assert.ok(Math.abs(a.alt - b.alt) < 5 && Math.abs(a.lat - b.lat) < 0.5, 'OMM and TLE agree')
  const store = new Map<string, string>()
  const st = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) }
  assert.equal(readCache(st, 'stations'), null)
  writeCache(st, 'stations', { fetchedAt: 1000, sats: recs })
  assert.equal(readCache(st, 'stations')!.sats[0].norad, 25544)
  assert.equal(cacheStale(1000, 1000 + 11 * 3600e3), false)
  assert.equal(cacheStale(1000, 1000 + 13 * 3600e3), true)
})
