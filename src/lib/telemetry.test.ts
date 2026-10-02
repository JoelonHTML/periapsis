// Run: node --test src/lib/telemetry.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { AU, DAY, G0, MU_SUN, bodyState, norm, propellantFor, toJ2000 } from './astro.ts'
import { evaluate, type MgaInput } from './mga.ts'
import { fmtMet, legSamples, massPlan, missionState, planAt, propForDry, wetMassFor } from './telemetry.ts'

const near = (a: number, b: number, tol: number, msg = '') => assert.ok(Math.abs(a - b) <= tol, `${msg} ${a} ≉ ${b}`)
const inp: MgaInput = {
  target: 'mars', maxFlybys: 1, flybyBodies: ['venus'], mode: 'departure', tRef: 0, windowDays: 0, objective: 'mindv',
  dvBudget: 99, parkAlt: 200, arrival: 'ellipse', capAlt: 500, capEcc: 0.9,
}
const t0 = toJ2000(Date.UTC(2026, 10, 1))
// fixed epochs: Earth → Venus → Mars (deterministic, no optimiser)
const sol = evaluate(['earth', 'venus', 'mars'], [t0, t0 + 120 * DAY, t0 + 330 * DAY], inp)!
// The Earth→Venus→Mars test route at arbitrary epochs is violent (≈ 60 km/s), so geometry tests use a huge-Isp craft whose tank is never short.
const craft = { dry: 1000, prop: 20000, isp: 3e4 }
// A plausible 4-event route (6.5 km/s) for the mass bookkeeping with a realistic Isp.
const evs = [{ dv: 3.0, kind: 'launch', body: 'earth', t: 0 }, { dv: 1.0, kind: 'flyby', body: 'venus', t: 5 }, { dv: 0.5, kind: 'flyby', body: 'earth', t: 9 }, { dv: 2.0, kind: 'arrival', body: 'mars', t: 12 }]
const route = { events: evs, dv: 6.5 } as never

test('Tsiolkovsky reference values (hand calculation: exp(−3000/(300·9.80665)) = 0.360697)', () => {
  near(1000 * Math.exp(-3 / (300 * G0)), 360.697, 0.01)
  near(propellantFor(1000, 3, 300), 1000 - 360.697, 0.01)
  near(propForDry(1000, 4, 320), 2577.43, 0.01, 'propellant for 1000 kg dry, 4 km/s, Isp 320')
  near(wetMassFor(1000, 4, 320), 3577.43, 0.01)
})

test('mass after sequential burns equals the one-shot rocket equation', () => {
  const p = massPlan(route, { dry: 1000, prop: 20000, isp: 320 })
  near(p.m0, 21000, 1e-9)
  near(p.mFinal, 21000 * Math.exp(-p.totalDv / (320 * G0)), 1e-6)
  near(p.totalProp, propellantFor(21000, 6.5, 320), 1e-6)
  near(p.totalDv, 6.5, 1e-12)
  let m = 21000
  for (const s of p.steps) {
    near(s.mBefore, m, 1e-9)
    near(s.mAfter, m - propellantFor(m, s.dv, 320), 1e-9)
    near(s.prop, propellantFor(m, s.dv, 320), 1e-9)
    m = s.mAfter
  }
  near(p.mFinal, m, 1e-9)
  near(p.budget, 320 * G0 * Math.log(21), 1e-9)
  near(p.remaining, 20000 - p.totalProp, 1e-9)
})

test('explicit two-burn example: 1500 m/s then 1000 m/s on 3000 kg, Isp 320 → 1352.51 kg (python reference)', () => {
  const fake = { events: [{ dv: 1.5, kind: 'launch', body: 'earth', t: 0 }, { dv: 1.0, kind: 'arrival', body: 'mars', t: 10 }] } as never
  const p = massPlan(fake, { dry: 1000, prop: 2000, isp: 320 })
  near(p.mFinal, 1352.5058, 1e-3)
  near(p.steps[0].mAfter, 3000 * Math.exp(-1.5 / (320 * G0)), 1e-9)
})

test('before launch nothing is burned; after the last event everything is', () => {
  const p = massPlan(sol, craft)
  const pre = missionState(sol, craft, sol.tDep - 10 * DAY)
  assert.equal(pre.phase, 'before')
  assert.equal(pre.burned, 0)
  assert.equal(pre.dvUsed, 0)
  near(pre.mass, 21000, 1e-12)
  near(pre.remaining, 20000, 1e-12)
  assert.equal(pre.next!.index, 0)
  near(pre.next!.dt, 10 * DAY, 1e-6)
  const post = missionState(sol, craft, sol.tArr + 5 * DAY)
  assert.equal(post.phase, 'after')
  near(post.burned, p.totalProp, 1e-9)
  near(post.dvUsed, sol.dv, 1e-12)
  near(post.mass, p.mFinal, 1e-9)
  assert.equal(post.next, null)
})

test('state in cruise: mass after each burn, Sun distance and speed are physical', () => {
  const p = massPlan(sol, craft)
  // just after the Venus flyby (event 1): mass = step 1 mAfter
  const mid = missionState(sol, craft, sol.events[1].t + 1)
  near(mid.mass, p.steps[1].mAfter, 1e-9)
  near(mid.burned, p.steps[1].cumProp, 1e-9)
  assert.equal(mid.phase, 'cruise')
  assert.equal(mid.next!.index, 2)
  // at the flyby the craft is at Venus (Lambert endpoint): ~0.72 AU, helio speed 30–40 km/s
  near(mid.rSun / AU, 0.72, 0.03)
  assert.ok(mid.speed > 30 && mid.speed < 40, `${mid.speed}`)
  near(mid.rSun, norm(bodyState('venus', sol.events[1].t + 1).r), 5e4, 'near Venus')
  // at launch: 1 AU from the Sun, ~0 from Earth
  const l = missionState(sol, craft, sol.tDep)
  near(l.rSun / AU, 1, 0.02)
  near(l.rEarth, 0, 1)
  near(l.dvUsed, sol.events[0].dv, 1e-12)
  assert.ok(l.dvUsed > 3 && l.dvUsed < 12)
})

test('tank too small: masses are counted down from the REQUIRED wet mass and never fall below dry', () => {
  const tight = { dry: 1000, prop: 100, isp: 320 }
  const p = massPlan(sol, tight)
  assert.equal(p.ok, false)
  near(p.m0, wetMassFor(1000, sol.dv, 320), 1e-6)
  near(p.mFinal, 1000, 1e-6) // ends exactly on the dry mass
  assert.ok(p.steps.every((x) => x.mAfter >= 1000 - 1e-6 && x.prop > 0))
  near(p.totalProp, propForDry(1000, sol.dv, 320), 1e-6)
  near(p.shortfall, p.totalProp - 100, 1e-6)
  near(p.remaining, 0, 1e-6)
  // live state: mass never below dry, remaining relative to the required propellant, 0 at arrival
  for (const k of [-5, 0, 0.3, 0.6, 1, 3]) {
    const st = missionState(sol, tight, sol.tDep + k * sol.tof)
    assert.ok(st.mass >= 1000 - 1e-6 && st.remaining >= -1e-6)
  }
  const end = missionState(sol, tight, sol.tArr + DAY)
  near(end.mass, 1000, 1e-6)
  near(end.remaining, 0, 1e-6)
  near(end.burned, p.totalProp, 1e-6)
  // dry-mass mode: the propellant needed makes the plan exactly feasible
  const q = massPlan(sol, { dry: 1000, prop: propForDry(1000, sol.dv, 320), isp: 320 })
  assert.equal(q.ok, true)
  near(q.mFinal, 1000, 1e-6)
  near(q.remaining, 0, 1e-6)
  assert.equal(q.shortfall, 0)
})

test('within budget: m0 = dry + tank, leftover propellant = tank − burned', () => {
  const p = massPlan(route, { dry: 1000, prop: 20000, isp: 320 })
  assert.equal(p.ok, true)
  assert.equal(p.shortfall, 0)
  near(p.m0, 21000, 1e-9)
  near(p.remaining, 20000 - p.totalProp, 1e-6)
  assert.ok(p.mFinal > 1000)
})

test('planAt is a step function; legSamples covers launch→arrival', () => {
  const p = massPlan(sol, craft)
  assert.equal(planAt(p, sol.tDep - 1).cumDv, 0)
  near(planAt(p, sol.events[1].t).cumDv, p.steps[1].cumDv, 1e-12)
  const s = legSamples(sol)
  near(s[0].t, sol.tDep, 1e-6)
  near(s[s.length - 1].t, sol.tArr, 1e-3)
  // two-body energy v²/2 − μ/r is constant along each leg (samples 0..per belong to leg 1, the rest to leg 2)
  const per = s.length / 2
  for (const leg of [s.slice(0, per), s.slice(per)]) {
    const E = (x: { speed: number; rSun: number }) => x.speed ** 2 / 2 - MU_SUN / x.rSun
    leg.forEach((x) => near(E(x), E(leg[0]), 1e-3, 'energy'))
  }
  // speed jumps at the flyby (same time, two samples) while the Sun distance does not
  const j = s[per - 1], k = s[per]
  near(j.t, k.t, 1e-6)
  near(j.rSun, k.rSun, 1)
})

test('mission elapsed time format', () => {
  assert.equal(fmtMet(0), 'T+ 0 d 00 u 00 m')
  assert.equal(fmtMet(86400 + 3 * 3600 + 5 * 60), 'T+ 1 d 03 u 05 m')
  assert.equal(fmtMet(-90 * 60), 'T− 0 d 01 u 30 m')
})
