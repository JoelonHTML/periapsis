// Run: node --test src/lib/mga-adv.test.ts
// Advanced optimiser options: multi-revolution legs, resonant same-body legs, deep-space manoeuvres (all default OFF).
import test from 'node:test'
import assert from 'node:assert/strict'
import { DAY, MU_SUN, bodyState, norm, propagate, sub, toJ2000, type BodyId } from './astro.ts'
import {
  craftState, dsmVarCount, evaluate, evaluateDsm, eventPosition, optimize, refineDsm, runMga, samplePath, sequences,
  type MgaInput, type Solution,
} from './mga.ts'
import { massPlan } from './telemetry.ts'

const d = (y: number, m: number, dd: number) => toJ2000(Date.UTC(y, m - 1, dd))
const jup: MgaInput = {
  target: 'jupiter', maxFlybys: 3, flybyBodies: ['venus', 'earth', 'mars'], mode: 'arrival', tRef: d(1995, 12, 7), // Galileo arrival
  windowDays: 0, objective: 'mindv', dvBudget: 99, parkAlt: 200, arrival: 'ellipse', capAlt: 500, capEcc: 0.9,
}
const VEEJ: BodyId[] = ['earth', 'venus', 'earth', 'earth', 'jupiter']
const EVEJ: BodyId[] = ['earth', 'venus', 'earth', 'jupiter']
const sameSeq = (a: BodyId[][], b: BodyId[][]) => JSON.stringify(a) === JSON.stringify(b)

/** every leg (with its DSM, if any) really flies from r1 to r2 and the events add up */
function checkConsistent(s: Solution, tolKm = 50) {
  for (const l of s.legs) {
    if (l.dsm) {
      const a = propagate(l.r1, l.v1, l.dsm.t - l.t1, MU_SUN)
      assert.ok(norm(sub(a.r, l.dsm.r)) < 1e-3 && norm(sub(a.v, l.dsm.vIn)) < 1e-9, 'first arc ends at the DSM state')
      const b = propagate(l.dsm.r, l.dsm.vOut, l.t2 - l.dsm.t, MU_SUN)
      assert.ok(norm(sub(b.r, l.r2)) < tolKm, `second arc miss ${norm(sub(b.r, l.r2))} km`)
      assert.ok(norm(sub(b.v, l.v2)) < 1e-4, 'second arc arrival velocity')
      assert.ok(l.dsm.t > l.t1 && l.dsm.t < l.t2)
    } else {
      const e = propagate(l.r1, l.v1, l.t2 - l.t1, MU_SUN)
      assert.ok(norm(sub(e.r, l.r2)) < tolKm, `leg ${l.from}→${l.to} miss ${norm(sub(e.r, l.r2))} km`)
    }
  }
  assert.ok(Math.abs(s.events.reduce((a, e) => a + e.dv, 0) - s.dv) < 1e-9)
  for (let i = 1; i < s.events.length; i++) assert.ok(s.events[i].t >= s.events[i - 1].t, 'events sorted by time')
}

test('defaults OFF: explicit zeros / false change nothing', () => {
  const inp: MgaInput = { ...jup, target: 'mars', maxFlybys: 1, flybyBodies: ['venus', 'earth'], mode: 'departure', tRef: d(2026, 7, 1), windowDays: 400, dvBudget: 6, arrival: 'flyby' }
  const a = runMga(inp, () => {}).solutions, b = runMga({ ...inp, maxRevs: 0, allowResonant: false, dsm: false }, () => {}).solutions
  assert.deepEqual(a.map((s) => [s.seq, s.dv, s.tDep, s.tArr]), b.map((s) => [s.seq, s.dv, s.tDep, s.tArr]))
  assert.ok(a.every((s) => s.events.every((e) => e.kind !== 'dsm') && s.legs.every((l) => !l.dsm && !l.revs)))
  assert.ok(sameSeq(sequences({ ...jup, maxFlybys: 2 }), sequences({ ...jup, maxFlybys: 2, allowResonant: false, maxRevs: 0 })))
})

test('allowResonant adds same-body sequences (Earth→Earth→Jupiter, VEEGA); off = none', () => {
  const none = sequences({ ...jup, maxFlybys: 3 })
  assert.ok(none.every((q) => q.every((b, i) => i === 0 || b !== q[i - 1])), 'no repeats by default')
  const on = sequences({ ...jup, maxFlybys: 3, allowResonant: true })
  assert.ok(on.length > none.length)
  const has = (q: BodyId[]) => on.some((x) => x.join() === q.join())
  assert.ok(has(['earth', 'earth', 'jupiter']), 'EEJ')
  assert.ok(has(VEEJ), 'E-V-E-E-J (Galileo VEEGA)')
  assert.ok(has(['earth', 'venus', 'venus', 'earth', 'jupiter']), 'E-V-V-E-J (Cassini-like)')
  for (const q of on) {
    assert.equal(q.length - 1 - 1 <= 3, true)
    let rep = 0
    for (let i = 1; i < q.length; i++) if (q[i] === q[i - 1]) rep++
    assert.ok(rep <= 1, `at most one repeat: ${q}`)
  }
  assert.ok(on.length < 40, `bounded: ${on.length}`)
  // with maxFlybys 1 only the 1-flyby resonant routes
  assert.ok(sequences({ ...jup, maxFlybys: 1, allowResonant: true }).every((q) => q.length <= 4))
})

test('Galileo VEEGA at its real epochs: multi-rev + resonant leg is solvable, without it hopeless', () => {
  const ep = [d(1989, 10, 18), d(1990, 2, 10), d(1990, 12, 8), d(1992, 12, 8), d(1995, 12, 7)]
  const plain = evaluate(VEEJ, ep, jup, true)!
  const adv = evaluate(VEEJ, ep, { ...jup, maxRevs: 2, allowResonant: true }, true)!
  assert.ok(plain && adv)
  assert.ok(adv.dv < 0.25 * plain.dv, `with ${adv.dv.toFixed(1)} vs without ${plain.dv.toFixed(1)} km/s`)
  assert.equal(adv.legs[2].revs, 1, 'the Earth→Earth leg is a 1-revolution (2-year, 2:1 resonant) arc')
  assert.ok(adv.events[0].vinf > 3.4 && adv.events[0].vinf < 4.4, `launch v∞ ${adv.events[0].vinf} (Galileo C3 ≈ 15 km²/s²)`)
  checkConsistent(adv, 5)
  // the first two flybys are nearly ballistic in this model
  assert.ok(adv.events[1].dv < 0.5, `Venus flyby ${adv.events[1].dv}`)
})

test('optimiser: Earth→Earth→Jupiter / VEEGA-like for a 1995-12-07 arrival beats every route without the options', () => {
  const t0 = Date.now()
  const without = [
    optimize(['earth', 'jupiter'], jup, 'mindv'),
    optimize(['earth', 'venus', 'jupiter'], jup, 'mindv'),
    optimize(EVEJ, jup, 'mindv'),
    optimize(VEEJ, jup, 'mindv'), // the same sequence, but 0-rev legs cannot close the Earth–Earth leg cheaply
  ].map((s) => s!.dv)
  const adv = { ...jup, maxRevs: 2, allowResonant: true }
  const bud = { np: 48, gens: 200 }
  const veegaLike = optimize(VEEJ, adv, 'mindv', 1, bud)!
  const eej = optimize(['earth', 'earth', 'jupiter'], adv, 'mindv', 1, bud)!
  const best = Math.min(veegaLike.dv, eej.dv)
  assert.ok(best < 0.8 * Math.min(...without), `with ${best.toFixed(2)} vs without ${Math.min(...without).toFixed(2)} km/s (${without.map((x) => x.toFixed(1))})`)
  assert.ok(veegaLike.legs.some((l) => l.from === 'earth' && l.to === 'earth' && (l.revs ?? 0) >= 1), 'resonant leg uses a multi-rev arc')
  const rl = veegaLike.legs[2]
  assert.ok(rl.t2 - rl.t1 >= 0.9 * 365.25 * DAY && rl.t2 - rl.t1 <= 3.1 * 365.25 * DAY, 'Earth→Earth leg of 1–3 years')
  checkConsistent(veegaLike, 100)
  assert.ok(Date.now() - t0 < 20000, `${Date.now() - t0} ms`)
})

test('DSM: evaluateDsm closes, reports dsm events; craftState/samplePath honour the manoeuvre', () => {
  const seq: BodyId[] = ['earth', 'mars', 'jupiter']
  const inp: MgaInput = { ...jup, dsm: true }
  const ep = [d(2030, 1, 1), d(2030, 9, 1), d(2033, 3, 1)]
  const dx = [3.5, 0.2, 0.55, 0.4, 0.1, 1.0, 0.6] // [|v∞|,u,v,η] + leg 2 [ρ,β,η]
  assert.equal(dx.length, dsmVarCount(2))
  const s = evaluateDsm(seq, ep, dx, inp, true)!
  assert.ok(s, 'solution')
  const dsms = s.events.filter((e) => e.kind === 'dsm')
  assert.equal(dsms.length, 2, 'one DSM per leg')
  assert.deepEqual(s.events.map((e) => e.kind), ['launch', 'dsm', 'flyby', 'dsm', 'arrival'])
  assert.ok(dsms.every((e) => e.pos && e.dv > 0 && e.t > s.tDep && e.t < s.tArr))
  checkConsistent(s)
  // the Mars flyby is unpowered by construction
  assert.ok(s.events[2].dv < 1e-6, `unpowered flyby ${s.events[2].dv}`)
  assert.ok(Math.abs((s.events[2].turn ?? 0) - (s.events[2].turnMax ?? 0)) < 1e-6 || (s.events[2].turn ?? 0) <= (s.events[2].turnMax ?? 0))
  // position is continuous across the DSM, velocity jumps by the DSM Δv
  const m = s.legs[0].dsm!, dt = 1
  const before = craftState(s, m.t - dt), after = craftState(s, m.t + dt)
  assert.ok(norm(sub(after.r, before.r)) < 100, 'position continuous')
  assert.ok(Math.abs(norm(sub(after.v, before.v)) - dsms[0].dv) < 1e-3, 'velocity jump = DSM Δv')
  assert.ok(norm(sub(eventPosition(s, 1), m.r)) < 1e-6, 'eventPosition of the dsm event')
  assert.ok(norm(sub(eventPosition(s, 2), s.legs[0].r2)) < 1e-6 && norm(sub(eventPosition(s, 4), s.legs[1].r2)) < 1e-6, 'eventPosition skips dsm events')
  const p = samplePath(s, 60)
  assert.ok(p.pts.every((v) => v.every(Number.isFinite)))
  // consumers: mass plan has one step per event and the same total Δv
  const plan = massPlan(s, { dry: 1000, prop: 2000, isp: 320 })
  assert.equal(plan.steps.length, s.events.length)
  assert.ok(Math.abs(plan.totalDv - s.dv) < 1e-9 && plan.steps.some((x) => x.kind === 'dsm'))
})

test('DSM: a route never gets worse than without DSM (Δv ≈ 0 DSM is always available)', () => {
  const t0 = Date.now()
  const cases: [BodyId[], Partial<MgaInput>][] = [
    [['earth', 'jupiter'], {}],
    [EVEJ, {}],
    [['earth', 'venus', 'venus', 'earth', 'jupiter'], { allowResonant: true }],
    [['earth', 'earth', 'jupiter'], { allowResonant: true, maxRevs: 1 }],
  ]
  for (const [seq, o] of cases) {
    const inp = { ...jup, ...o }
    const bud = { np: 36, gens: 120 }
    const plain = optimize(seq, inp, 'mindv', 1, bud)!
    const withDsm = optimize(seq, { ...inp, dsm: true }, 'mindv', 1, bud)!
    assert.ok(withDsm.dv <= plain.dv + 1e-9, `${seq.join('>')}: ${withDsm.dv} > ${plain.dv}`)
    checkConsistent(withDsm, 100)
    const again = refineDsm(seq, { ...inp, dsm: true }, 'mindv', 1, bud, plain)!
    assert.ok(again.dv <= plain.dv + 1e-9)
  }
  assert.ok(Date.now() - t0 < 20000, `${Date.now() - t0} ms`)
})

test('DSM: runMga returns DSM-capable routes no worse than the ballistic ones, with valid event kinds', () => {
  const inp: MgaInput = {
    target: 'mars', maxFlybys: 0, flybyBodies: [], mode: 'departure', tRef: d(2026, 7, 1), windowDays: 300, objective: 'mindv', dvBudget: 99,
    parkAlt: 200, arrival: 'ellipse', capAlt: 400, capEcc: 0.9,
  }
  const a = runMga(inp, () => {}).solutions[0]
  const b = runMga({ ...inp, dsm: true }, () => {}).solutions[0]
  assert.ok(b.dv <= a.dv + 1e-9, `${b.dv} vs ${a.dv}`)
  for (const e of b.events) assert.ok(['launch', 'flyby', 'dsm', 'arrival'].includes(e.kind))
  checkConsistent(b, 100)
  const plan = massPlan(b, { dry: 500, prop: 1500, isp: 320 })
  assert.equal(plan.steps.length, b.events.length)
})
