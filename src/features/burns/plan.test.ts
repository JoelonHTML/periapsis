// Run: node --test src/features/burns/plan.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { DAY, G0, MU_EARTH, RE, propellantFor, toJ2000 } from '../../lib/astro.ts'
import { G0_MS, orbitPeriod, rocketSolve } from '../../lib/calc.ts'
import { evaluate, type MgaInput } from '../../lib/mga.ts'
import { massPlan } from '../../lib/telemetry.ts'
import {
  STORAGE_KEY, buildBurns, draftsToBurns, importRoute, loadPlan, parsePlan, propellantChain, savePlan, serializePlan, sortBurns, timeScale, totalDv,
  burnIsLong, emptyPlan, type Burn, type Plan, type Spec,
} from './plan.ts'

const near = (a: number, b: number, tol: number, msg = '') => assert.ok(Math.abs(a - b) <= tol, `${msg} ${a} ≉ ${b}`)
const tr = (k: string) => k
const mk = (id: string, t: number, dv: number, extra: Partial<Burn> = {}): Burn => ({ id, name: id, t, dv, dir: 'prograde', body: 'earth', period: null, src: 'user', ...extra })
const ok = (s: Spec) => { const r = buildBurns(s); assert.ok(r.ok, JSON.stringify(r)); return r.ok ? r.drafts : [] }

test('Hohmann LEO 200 km → GEO 35786 km ≈ 3.93 km/s (2.457 + 1.478)', () => {
  const d = ok({ type: 'hohmann', body: 'earth', alt1: 200, alt2: 35786 })
  near(d[0].dv, 2.457, 0.005); near(d[1].dv, 1.478, 0.005)
  near(d[0].dv + d[1].dv, 3.935, 0.01)
  near(d[1].dt, 5.27 * 3600, 0.05 * 3600, 'transfer time ≈ 5.3 h')
  assert.equal(d[0].dir, 'prograde')
  const down = ok({ type: 'hohmann', body: 'earth', alt1: 35786, alt2: 200 })
  near(down[0].dv + down[1].dv, d[0].dv + d[1].dv, 1e-9)
  assert.equal(down[0].dir, 'retrograde')
})

test('other burn types', () => {
  near(ok({ type: 'plane', body: 'earth', alt: 400, di: 28.5 })[0].dv, 2 * Math.sqrt(MU_EARTH / (RE + 400)) * Math.sin((28.5 * Math.PI) / 360), 1e-9)
  // combined plane change + Hohmann at apoapsis is cheaper than the separate burns
  const c = ok({ type: 'combined', body: 'earth', alt1: 200, alt2: 35786, di: 28.5 })
  const sep = ok({ type: 'hohmann', body: 'earth', alt1: 200, alt2: 35786 }), pl = ok({ type: 'plane', body: 'earth', alt: 35786, di: 28.5 })
  assert.ok(c[0].dv + c[1].dv < sep[0].dv + sep[1].dv + pl[0].dv)
  near(c[0].dv, sep[0].dv, 1e-12) // raising: first burn is the plain Hohmann one
  assert.ok(c[1].dv > sep[1].dv)
  // known value: LEO→GEO with 28.5° in the second burn ≈ 1.8 km/s (sqrt(1.6^2+3.07^2−2·1.6·3.07·cos 28.5°) ≈ 1.83)
  near(c[1].dv, 1.83, 0.03)
  // lowering puts the combined burn first
  const dn = ok({ type: 'combined', body: 'earth', alt1: 35786, alt2: 200, di: 28.5 })
  near(dn[0].dv, c[1].dv, 1e-9); near(dn[1].dv, sep[0].dv, 1e-9)
  // circularise at apogee of a GTO (200 × 35786): 1.478 km/s
  near(ok({ type: 'circ', body: 'earth', rpAlt: 200, raAlt: 35786, at: 'apo' })[0].dv, 1.478, 0.005)
  assert.equal(ok({ type: 'circ', body: 'earth', rpAlt: 200, raAlt: 35786, at: 'peri' })[0].dir, 'retrograde')
  // Moon / Mars use their own μ
  assert.ok(ok({ type: 'hohmann', body: 'moon', alt1: 100, alt2: 300 })[0].dv < 0.1)
  assert.ok(ok({ type: 'hohmann', body: 'mars', alt1: 300, alt2: 17000 })[0].dv > 0.5)
  const cu = ok({ type: 'custom', body: 'earth', dvMs: 250, dir: 'radial' })[0]
  assert.equal(cu.dv, 0.25); assert.equal(cu.dir, 'radial')
  assert.equal(buildBurns({ type: 'hohmann', body: 'earth', alt1: 300, alt2: 300 }).ok, false)
  assert.equal(buildBurns({ type: 'plane', body: 'earth', alt: -5, di: 3 }).ok, false)
  assert.equal(buildBurns({ type: 'custom', body: 'earth', dvMs: 0, dir: 'prograde' }).ok, false)
})

test('phasing: phasing-orbit period gains exactly the phase angle, Δv symmetric', () => {
  const alt = 400, r = RE + alt, T = orbitPeriod(MU_EARTH, r)
  const d = ok({ type: 'phasing', body: 'earth', alt, phase: 30, revs: 3 })
  near(d[1].dt, 3 * T * (1 - 30 / 1080), 1e-6)
  near(d[0].dv, d[1].dv, 1e-12)
  near(360 * 3 - (360 * d[1].dt) / T, 30, 1e-9)
  assert.equal(d[0].dir, 'retrograde')
  assert.equal(ok({ type: 'phasing', body: 'earth', alt, phase: -30, revs: 2 })[0].dir, 'prograde')
  assert.equal(buildBurns({ type: 'phasing', body: 'earth', alt: 300, phase: 350, revs: 1 }).ok, false) // phasing orbit would dip into the Earth
  assert.equal(buildBurns({ type: 'phasing', body: 'earth', alt, phase: 0, revs: 2 }).ok, false)
})

test('Tsiolkovsky mass chain equals the one-shot rocket equation', () => {
  const craft = { dry: 1000, prop: 2000, isp: 320 }
  const burns = [mk('a', 1, 1.0), mk('b', 2, 0.8), mk('c', 3, 0.5)]
  const c = propellantChain(burns, craft, null)
  assert.equal(c.firstFail, -1)
  let m = 3000
  c.steps.forEach((s, i) => { near(s.mBefore, m, 1e-9); m *= Math.exp(-burns[i].dv / (320 * G0)); near(s.mAfter, m, 1e-9); near(s.prop, s.mBefore - s.mAfter, 1e-9) })
  const one = rocketSolve('mf', { dv: 2300, isp: 320, m0: 3000, mf: 0 })
  near(c.mFinal, one.mf, 1e-6)
  near(c.totalProp, 3000 - one.mf, 1e-6)
  near(c.propLeft, 2000 - c.totalProp, 1e-9)
  near(c.steps[2].dvLeft, c.budget - 2.3, 1e-9)
  near(c.steps[0].prop, propellantFor(3000, 1, 320), 1e-9)
})

test('out of propellant: first burn that cannot be completed is flagged, later ones are unfunded', () => {
  const craft = { dry: 1000, prop: 2000, isp: 320 } // budget = 320·g0·ln 3 ≈ 3.447 km/s
  const c = propellantChain([mk('a', 1, 2.0), mk('b', 2, 1.0), mk('c', 3, 0.5), mk('d', 4, 0.1)], craft, null)
  assert.equal(c.firstFail, 2)
  assert.deepEqual(c.steps.map((s) => s.ok), [true, true, false, false])
  const f = c.steps[2]
  near(f.shortDv, 3.5 - c.budget, 1e-9); assert.ok(f.shortProp > 0)
  near(f.mAfter, 1000, 1e-9); near(f.propLeft, 0, 1e-9); near(f.dvLeft, 0, 1e-12)
  assert.equal(c.steps[3].prop, 0); assert.equal(c.steps[3].shortDv, 0.1)
  assert.equal(propellantChain([mk('x', 1, c.budget)], craft, null).firstFail, -1) // exactly the budget still works
  assert.equal(propellantChain([mk('x', 1, 1)], { dry: 0, prop: 1, isp: 300 }, null).firstFail, 0)
})

test('burn duration from the rocket equation and the finite-burn check', () => {
  const craft = { dry: 1000, prop: 2000, isp: 320 }
  const p = orbitPeriod(MU_EARTH, RE + 400)
  const c = propellantChain([mk('a', 1, 1.0, { period: p }), mk('b', 2, 0.001, { period: p })], craft, 400)
  const mdot = 400 / (320 * G0_MS)
  near(c.steps[0].duration!, c.steps[0].prop / mdot, 1e-9)
  near(c.steps[0].duration!, (3000 * (1 - Math.exp(-1 / (320 * G0)))) / mdot, 1e-6)
  assert.ok(burnIsLong(c.steps[0])); assert.ok(!burnIsLong(c.steps[1]))
  assert.equal(propellantChain([mk('a', 1, 1)], craft, null).steps[0].duration, null)
  assert.equal(propellantChain([mk('a', 1, 1)], craft, 400).steps[0].ratio, null) // unknown period
})

test('route import gives the same total Δv as the route (and as massPlan)', () => {
  const inp: MgaInput = { target: 'mars', maxFlybys: 1, flybyBodies: ['venus'], mode: 'departure', tRef: 0, windowDays: 0, objective: 'mindv', dvBudget: 99, parkAlt: 200, arrival: 'ellipse', capAlt: 500, capEcc: 0.9 }
  const t0 = toJ2000(Date.UTC(2026, 10, 1))
  const sol = evaluate(['earth', 'venus', 'mars'], [t0, t0 + 120 * DAY, t0 + 330 * DAY], inp)!
  const user = mk('u', t0 - 5 * DAY, 0.1)
  const plan = importRoute({ burns: [user], thrust: null }, sol.events, (e) => `${e.kind} ${e.body}`)
  const routeBurns = plan.burns.filter((b) => b.src === 'route')
  near(totalDv(routeBurns), sol.dv, 1e-9)
  near(totalDv(routeBurns), massPlan(sol, { dry: 1000, prop: 20000, isp: 3e4 }).totalDv, 1e-9)
  assert.deepEqual(routeBurns.map((b) => b.t), sol.events.filter((e) => e.dv > 0).map((e) => e.t))
  assert.equal(routeBurns[0].dir, 'prograde'); assert.equal(plan.burns[0], user)
  assert.equal(importRoute(plan, sol.events, () => 'x').burns.length, plan.burns.length) // re-import replaces, no duplicates
  const craft = { dry: 1000, prop: 20000, isp: 3e4 }
  const ch = propellantChain(sortBurns(routeBurns), craft, null), mp = massPlan(sol, craft)
  near(ch.mFinal, mp.mFinal, 1e-6 * mp.mFinal)
})

test('free flybys (Δv = 0) are not imported', () => {
  const p = importRoute(emptyPlan(), [{ kind: 'launch', body: 'earth', t: 0, dv: 3 }, { kind: 'flyby', body: 'venus', t: 5, dv: 0 }, { kind: 'arrival', body: 'mars', t: 9, dv: 1 }], () => 'n')
  assert.equal(p.burns.length, 2); assert.equal(p.burns[1].dir, 'retrograde')
})

test('sorting by date is stable; draftsToBurns offsets from the start time', () => {
  assert.deepEqual(sortBurns([mk('c', 3, 1), mk('a', 1, 1), mk('b', 1, 2)]).map((b) => b.id), ['a', 'b', 'c'])
  const b = draftsToBurns(ok({ type: 'hohmann', body: 'earth', alt1: 300, alt2: 700 }), 1000, 'earth', tr)
  assert.equal(b[0].t, 1000); assert.ok(b[1].t > 1000); assert.equal(b[0].name, 'burn.n.hohmann1'); assert.notEqual(b[0].id, b[1].id)
})

test('persistence round-trip, validation and clearing', () => {
  const mem = new Map<string, string>()
  const st = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) }
  const plan: Plan = { burns: [mk('a', 100, 1.5, { period: 5400, body: 'moon', dir: 'normal' }), mk('r', 200, 0.4, { src: 'route', dir: null, body: null })], thrust: 450 }
  savePlan(plan, st)
  assert.ok(mem.has(STORAGE_KEY)); assert.equal(STORAGE_KEY, 'periapsis.burns.v1')
  assert.deepEqual(loadPlan(st), plan)
  assert.deepEqual(parsePlan(serializePlan(plan)), plan)
  savePlan(emptyPlan(), st)
  assert.equal(mem.has(STORAGE_KEY), false); assert.deepEqual(loadPlan(st), emptyPlan())
  assert.deepEqual(parsePlan('{not json'), emptyPlan())
  assert.deepEqual(parsePlan('{"v":2,"burns":[]}'), emptyPlan())
  const raw = JSON.stringify({ v: 1, thrust: -3, burns: [
    mk('ok', 1, 1), { ...mk('nan', 1, 1), dv: null }, { ...mk('neg', 1, -1) }, { ...mk('dir', 1, 1), dir: 'sideways' }, { ...mk('body', 1, 1), body: 'pluto' }, { ...mk('per', 1, 1), period: 0 }, 5, null, mk('ok', 2, 2),
  ] })
  const p = parsePlan(raw)
  assert.deepEqual(p.burns.map((b) => b.id), ['ok']); assert.equal(p.thrust, null)
  assert.deepEqual(loadPlan({ getItem: () => { throw new Error('blocked') }, setItem: () => {}, removeItem: () => {} }), emptyPlan())
})

test('timeScale handles one burn, none, and spreads ticks', () => {
  near(timeScale([1000], 360).x(1000), 180, 1e-9)
  const s2 = timeScale([0, 100 * DAY], 360)
  near(s2.x(0), 18, 1e-9); near(s2.x(100 * DAY), 342, 1e-9); assert.equal(s2.ticks.length, 4)
  assert.ok(Number.isFinite(timeScale([], 360).x(0)))
})
