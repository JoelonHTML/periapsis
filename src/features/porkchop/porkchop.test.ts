import { test } from 'node:test'
import assert from 'node:assert/strict'
import { AU, BODIES, DAY, MU_SUN, RE, bodyState, propagate, departDv, fmtDate, norm, sub, toJ2000, ecl2eq } from '../../lib/astro.ts'
import { evaluate, type MgaInput } from '../../lib/mga.ts'
import { computeAll, evalPoint, hohmannTof, makeSpec, refineMin, niceLevels, synodic, type PorkchopParams } from './porkchop.ts'
import { arrivalReadout, departureReadout, raDec, raDecFromEcliptic } from './angles.ts'
import { sampleRoute, toCsv, toOem } from './export.ts'

const P: PorkchopParams = { target: 'mars', parkAlt: 200, arrival: 'flyby', capAlt: 500, capEcc: 0.9 }
const day = (s: string) => toJ2000(Date.parse(s + 'T00:00:00Z'))
// one opportunity only (the default ±1.25 synodic window also contains the 2028 one)
const SPEC26 = { t0: day('2026-08-01'), t1: day('2027-02-01'), tof0: 100 * DAY, tof1: 400 * DAY, nx: 72, ny: 60 }

test('default window is centred correctly and has sensible bounds', () => {
  const sp = makeSpec('mars', day('2026-11-01'))
  assert.ok(Math.abs((sp.t0 + sp.t1) / 2 - day('2026-11-01')) < 1)
  assert.ok(sp.tof0 > 60 * DAY && sp.tof1 < 500 * DAY && sp.tof1 > sp.tof0)
})

test('synodic period Earth-Mars is about 780 days', () => {
  assert.ok(Math.abs(synodic('mars') / DAY - 780) < 5)
})

test('Mars 2026 window: minimum C3 about 8-10 km2/s2 in Oct-Nov 2026', () => {
  const g = computeAll(SPEC26, P)
  const m = refineMin(g, P, 'c3')!
  assert.ok(m, 'minimum found')
  assert.ok(m.c3 > 7.5 && m.c3 < 10.5, `C3 ${m.c3}`)
  const d = fmtDate(m.tDep)
  assert.ok(d >= '2026-10-01' && d <= '2026-12-15', d)
  assert.ok(m.tof / DAY > 150 && m.tof / DAY < 330, `tof ${m.tof / DAY}`)
  assert.ok(m.vinfArr > 2 && m.vinfArr < 4.5, `arrival vinf ${m.vinfArr}`)
})

test('a grid point matches the optimiser leg evaluation (same Lambert model)', () => {
  const tDep = day('2026-11-10'), tof = 230 * DAY
  const q = evalPoint(P, tDep, tof)!
  const inp: MgaInput = { target: 'mars', maxFlybys: 0, flybyBodies: [], mode: 'departure', tRef: tDep, windowDays: 1, objective: 'mindv', dvBudget: 99, parkAlt: 200, arrival: 'flyby', capAlt: 500, capEcc: 0.9 }
  const s = evaluate(['earth', 'mars'], [tDep, tDep + tof], inp)!
  assert.ok(Math.abs(s.events[0].vinf - q.vinfDep) < 1e-12)
  assert.ok(Math.abs(s.events[1].vinf - q.vinfArr) < 1e-12)
  assert.ok(Math.abs(s.dv - q.dv) < 1e-12)
  assert.ok(Math.abs(q.dvDep - departDv(q.vinfDep, RE + 200)) < 1e-12)
})

test('Hohmann consistency: Earth-Mars at the Hohmann time gives v-infinity near 2.9 km/s', () => {
  // best phasing: scan departures for the one whose arrival lands on Mars with the lowest v-inf at the Hohmann time
  const tof = hohmannTof('mars')
  let best = Infinity
  for (let d = 0; d < 780; d += 2) { const q = evalPoint(P, day('2025-01-01') + d * DAY, tof); if (q && q.vinfDep < best) best = q.vinfDep }
  // circular-coplanar Hohmann v-inf at Earth is 2.94 km/s; eccentricity makes the best case somewhat lower
  assert.ok(best > 2.5 && best < 3.6, `best vinf ${best}`)
  // …and the unrestricted (date, tof) minimum in the 2026 window lies close to the circular Hohmann value 2.94 km/s
  const m = refineMin(computeAll(SPEC26, P), P, 'c3')!
  assert.ok(m.vinfDep > 2.8 && m.vinfDep < 3.2, `min vinf ${m.vinfDep}`)
  assert.ok(Math.abs(hohmannTof('mars') / DAY - 259) < 2)
  assert.ok(Math.abs(MU_SUN) > 0 && AU > 0 && BODIES.mars.el[0] > 1)
})

function marsRoute() {
  const g = computeAll(SPEC26, P)
  const m = refineMin(g, P, 'c3')!
  const inp: MgaInput = { target: 'mars', maxFlybys: 0, flybyBodies: [], mode: 'departure', tRef: m.tDep, windowDays: 1, objective: 'mindv', dvBudget: 99, parkAlt: 200, arrival: 'flyby', capAlt: 500, capEcc: 0.9 }
  return { sol: evaluate(['earth', 'mars'], [m.tDep, m.tDep + m.tof], inp)!, m }
}

test('departure angles at the Mars minimum are sane', () => {
  const { sol, m } = marsRoute()
  const r = departureReadout(sol)
  assert.equal(r.to, 'mars')
  assert.ok(Math.abs(r.vinf ** 2 - m.c3) < 1e-9)
  assert.ok(r.phase > 20 && r.phase < 80, `phase ${r.phase}`) // Mars ahead of Earth
  assert.ok(Math.abs(r.inPlane) < 25, `in-plane ${r.inPlane}`)
  assert.ok(r.angleToPrograde < 15, `prograde angle ${r.angleToPrograde}`)
  assert.ok(Math.abs(r.outOfPlane) < 8)
  assert.ok(Math.abs(r.dec) < 24)
  assert.ok(r.ra >= 0 && r.ra < 360)
  assert.ok(r.asymptoteAnomaly > 110 && r.asymptoteAnomaly < 165, `nu ${r.asymptoteAnomaly}`)
  assert.ok(r.ejection > 100 && r.ejection < 180, `ejection ${r.ejection}`)
  // equatorial vector has the same length
  assert.ok(Math.abs(norm(r.vinfEq) - r.vinf) < 1e-9)
  const a = arrivalReadout(sol)
  assert.ok(Math.abs(a.vinf - m.vinfArr) < 1e-9)
})

test('RA/Dec conversion', () => {
  const x = raDecFromEcliptic([1, 0, 0]); assert.ok(Math.abs(x.ra) < 1e-9 && Math.abs(x.dec) < 1e-9)
  const y = raDecFromEcliptic([0, 1, 0]); assert.ok(Math.abs(y.ra - 90) < 1e-9 && Math.abs(y.dec - 23.439281) < 1e-6)
  const z = raDec([0, 0, 2]); assert.ok(Math.abs(z.dec - 90) < 1e-9)
  const w = raDec([-1, -1e-9, 0]); assert.ok(w.ra > 179.99 && w.ra < 360)
  const e = ecl2eq([0, 0, 1]); assert.ok(e[1] < 0 && e[2] > 0)
})

test('phase angle: Earth-Mars Hohmann phasing is about 44 degrees ahead', () => {
  const tof = hohmannTof('mars')
  let bestPhase = NaN, bestV = Infinity
  for (let d = 0; d < 780; d += 1) {
    const t = day('2025-01-01') + d * DAY, q = evalPoint(P, t, tof)
    if (q && q.vinfDep < bestV) { bestV = q.vinfDep; bestPhase = t }
  }
  const inp: MgaInput = { target: 'mars', maxFlybys: 0, flybyBodies: [], mode: 'departure', tRef: bestPhase, windowDays: 1, objective: 'mindv', dvBudget: 99, parkAlt: 200, arrival: 'flyby', capAlt: 500, capEcc: 0.9 }
  const r = departureReadout(evaluate(['earth', 'mars'], [bestPhase, bestPhase + tof], inp)!)
  assert.ok(r.phase > 36 && r.phase < 60, `phase ${r.phase}`)
  void bodyState; void sub
})

test('phase angle: Earth-Venus Hohmann phasing has Venus about 54 degrees BEHIND Earth', () => {
  const tof = hohmannTof('venus'), PV: PorkchopParams = { ...P, target: 'venus' }
  let bestT = 0, bestV = Infinity
  for (let d = 0; d < 584; d += 1) {
    const t = day('2025-01-01') + d * DAY, q = evalPoint(PV, t, tof)
    if (q && q.vinfDep < bestV) { bestV = q.vinfDep; bestT = t }
  }
  const inp: MgaInput = { target: 'venus', maxFlybys: 0, flybyBodies: [], mode: 'departure', tRef: bestT, windowDays: 1, objective: 'mindv', dvBudget: 99, parkAlt: 200, arrival: 'flyby', capAlt: 500, capEcc: 0.9 }
  const r = departureReadout(evaluate(['earth', 'venus'], [bestT, bestT + tof], inp)!)
  assert.ok(r.phase < -40 && r.phase > -70, `phase ${r.phase}`)
  assert.ok(r.angleToPrograde > 120, `angle ${r.angleToPrograde}: inward transfer: v-infinity points against the orbital motion`)
  assert.ok(r.ejection >= 0 && r.ejection < 360)
})

test('CSV and OEM export', () => {
  const { sol } = marsRoute()
  const csv = toCsv(sol).trim().split('\n')
  assert.ok(csv[0].startsWith('#'))
  const head = csv.findIndex((l) => l.startsWith('time_utc'))
  assert.equal(csv[head], 'time_utc,t_s_since_J2000,x_km,y_km,z_km,vx_km_s,vy_km_s,vz_km_s,leg')
  const first = csv[head + 1].split(','), last = csv[csv.length - 1].split(',')
  assert.equal(first.length, 9)
  assert.ok(first[0].startsWith(fmtDate(sol.tDep)))
  assert.ok(Math.abs(+first[2] - sol.legs[0].r1[0]) < 1e-3)
  assert.ok(Math.abs(+last[2] - sol.legs[0].r2[0]) < 1e-3)
  const oem = toOem(sol, new Date('2026-01-01T00:00:00Z'))
  const lines = oem.split('\n')
  assert.equal(lines[0], 'CCSDS_OEM_VERS = 2.0')
  for (const k of ['CREATION_DATE = 2026-01-01T00:00:00', 'ORIGINATOR = ', 'META_START', 'CENTER_NAME = SUN', 'REF_FRAME = EME2000', 'TIME_SYSTEM = TDB', 'START_TIME = ', 'STOP_TIME = ', 'META_STOP', 'OBJECT_NAME = ', 'OBJECT_ID = '])
    assert.ok(oem.includes(k), k)
  // data lines: epoch + 6 numbers, epochs strictly increasing
  const data = lines.filter((l) => /^\d{4}-\d\d-\d\dT/.test(l)).map((l) => l.split(' '))
  assert.ok(data.length > 40)
  assert.ok(data.every((d) => d.length === 7))
  for (let i = 1; i < data.length; i++) assert.ok(data[i][0] > data[i - 1][0])
  // EME2000 rotation keeps the vector length
  const r0 = data[0].slice(1, 4).map(Number)
  assert.ok(Math.abs(Math.hypot(r0[0], r0[1], r0[2]) - norm(sol.legs[0].r1)) < 1e-2)
})

test('sampleRoute reaches the arrival body', () => {
  const { sol } = marsRoute()
  const legs = sampleRoute(sol)
  const l = sol.legs[0], end = propagate(l.r1, l.v1, l.t2 - l.t1, MU_SUN) // propagating the full leg lands on Mars
  assert.ok(norm(sub(end.r, l.r2)) < 1e3, `miss ${norm(sub(end.r, l.r2))} km`)
  assert.ok(legs[0].length >= 41)
  for (let i = 1; i < legs[0].length; i++) assert.ok(legs[0][i].t > legs[0][i - 1].t)
})

test('niceLevels', () => {
  const l = niceLevels(8.7, 60)
  assert.ok(l.length >= 4 && l.length <= 12 && l[0] >= 8.7)
})
