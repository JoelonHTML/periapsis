// Run: node --test src/lib/astro.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  AU, DAY, MASS_RATIO_EM, MU_SUN, YEAR, bodyState, collinearGammas, decayLifetime, earthPlan,
  flybyDv, hohmann, lambert, norm, propagate, sub, toJ2000, type Vec,
} from './astro.ts'
import { optimize, type MgaInput } from './mga.ts'

const near = (a: number, b: number, tol: number, msg = '') => assert.ok(Math.abs(a - b) <= tol, `${msg} ${a} ≉ ${b}`)

test('Lambert matches Curtis example 5.2', () => {
  const s = lambert([5000, 10000, 2100], [-14600, 2500, 7000], 3600, 398600)!
  ;[-5.9925, 1.9254, 3.2456].forEach((v, i) => near(s.v1[i], v, 1e-3, 'v1'))
  ;[-3.3125, -4.1966, -0.38529].forEach((v, i) => near(s.v2[i], v, 1e-3, 'v2'))
})

test('propagating a Lambert arc lands on r2', () => {
  const t = toJ2000(Date.UTC(2026, 10, 1))
  const r1 = bodyState('earth', t).r, r2 = bodyState('mars', t + 250 * DAY).r
  const l = lambert(r1, r2, 250 * DAY, MU_SUN)!
  near(norm(sub(propagate(r1, l.v1, 250 * DAY, MU_SUN).r, r2)), 0, 1, 'miss km')
})

test('Earth ephemeris ≈ 1 AU, 29.8 km/s', () => {
  const s = bodyState('earth', 0)
  near(norm(s.r) / AU, 0.983, 0.001, 'r(J2000)') // perihelion season
  near(norm(s.v), 30.28, 0.05, 'v')
})

test('Hohmann Earth→Mars', () => {
  const h = hohmann(AU, 1.524 * AU, MU_SUN)
  near(h.dv1 + h.dv2, 5.59, 0.03)
  near(h.tof / DAY, 259, 1)
})

test('Earth–Moon L1/L2 distances', () => {
  const { g1, g2 } = collinearGammas(MASS_RATIO_EM)
  near((1 - g1) * 384400, 326400, 600, 'L1')
  near((1 + g2) * 384400, 449000, 600, 'L2')
})

test('unpowered flyby within turn limit costs nothing', () => {
  const a: Vec = [5, 0, 0], b: Vec = [5 * Math.cos(0.3), 5 * Math.sin(0.3), 0]
  near(flybyDv(a, b, 42828, 3600).dv, 0, 1e-9)
  assert.ok(flybyDv(a, [-5, 0, 0], 42828, 3600).dv > 1)
})

test('GEO Δv: plane change makes Kennedy costlier than Kourou', () => {
  const geo = { rpAlt: 35786, raAlt: 35786, incDeg: 0, parkAlt: 200, wDeg: null }
  const ksc = earthPlan(geo, 28.573, -80.6, 0, 1000, 320, 2.2, 4)
  const kou = earthPlan(geo, 5.236, -52.8, 0, 1000, 320, 2.2, 4)
  near(ksc.inSpace, 4.29, 0.03, 'KSC')
  near(kou.inSpace, 3.95, 0.03, 'Kourou')
  near(ksc.rotGain, 0.408, 0.005, 'rotation gain')
})

test('drag lifetime at 400 km is on the order of a year', () => {
  const y = decayLifetime(400, 0.01) / YEAR
  assert.ok(y > 0.3 && y < 5, `${y}`)
  assert.ok(decayLifetime(800, 0.01) > 50 * YEAR)
})

test('MGA finds a sane direct Earth→Mars 2026 transfer', () => {
  const inp: MgaInput = {
    target: 'mars', maxFlybys: 0, flybyBodies: [], mode: 'departure', tRef: toJ2000(Date.UTC(2026, 6, 1)),
    windowDays: 400, objective: 'mindv', dvBudget: 99, parkAlt: 200, arrival: 'flyby', capAlt: 300, capEcc: 0,
  }
  const t0 = performance.now()
  const s = optimize(['earth', 'mars'], inp, 'mindv')!
  const ms = performance.now() - t0
  assert.ok(s.dv > 3.4 && s.dv < 4.5, `dv ${s.dv}`)
  assert.ok(ms < 3000, `slow: ${ms} ms`)
  console.log(`  E→M: dep ${new Date(946728000000 + s.tDep * 1000).toISOString().slice(0, 10)}, ${(s.tof / DAY).toFixed(0)} d, Δv ${s.dv.toFixed(2)} km/s, ${ms.toFixed(0)} ms`)
})
