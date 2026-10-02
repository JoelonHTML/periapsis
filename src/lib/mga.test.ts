// Run: node --test src/lib/mga.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { AU, BODIES, DAY, MU_SUN, bodyElements, bodyState, fmtDate, norm, toJ2000, type BodyId } from './astro.ts'
import { runMga, sequences, type MgaInput } from './mga.ts'

const near = (a: number, b: number, tol: number, msg = '') => assert.ok(Math.abs(a - b) <= tol, `${msg} ${a} ≉ ${b}`)
const base: MgaInput = {
  target: 'jupiter', maxFlybys: 2, flybyBodies: ['venus', 'earth', 'mars', 'jupiter', 'saturn'], mode: 'arrival', tRef: toJ2000(Date.UTC(2038, 10, 3)),
  windowDays: 0, objective: 'mindv', dvBudget: 99, parkAlt: 200, arrival: 'ellipse', capAlt: 500, capEcc: 0.9,
}
const noRepeat = (q: BodyId[]) => q.every((b, i) => i === 0 || b !== q[i - 1])

test('mustVisit: every sequence contains the forced body, no repeats, ≤ 2 flybys', () => {
  for (const must of ['venus', 'earth', 'mars', 'jupiter', 'saturn'] as BodyId[])
    for (const maxFlybys of [0, 1, 2]) {
      const seqs = sequences({ ...base, target: must === 'jupiter' ? 'saturn' : 'jupiter', mustVisit: must, maxFlybys })
      assert.ok(seqs.length > 0, `${must}/${maxFlybys}`)
      for (const q of seqs) {
        assert.ok(q.includes(must), `${q} lacks ${must}`)
        assert.equal(q[0], 'earth')
        assert.ok(noRepeat(q), `repeat in ${q}`)
        assert.ok(q.length - 2 <= 2, `too many flybys ${q}`)
        assert.ok(q.slice(1, -1).includes(must), 'forced body must be between Earth and target')
      }
    }
})

test('mustVisit Earth needs an Earth gravity assist after another body', () => {
  const seqs = sequences({ ...base, mustVisit: 'earth', maxFlybys: 1 })
  assert.ok(seqs.every((q) => q.length === 4 && q[2] === 'earth' && q[1] !== 'earth'))
})

test('without mustVisit the direct route is still offered', () => {
  assert.deepEqual(sequences({ ...base, maxFlybys: 0 }), [['earth', 'jupiter']])
})

test('Jupiter 2038 with forced Mars: all optimised routes visit Mars', () => {
  const one = runMga({ ...base, mustVisit: 'mars', maxFlybys: 0 }, () => {}) // 0 is raised to 1
  assert.deepEqual(one.solutions.map((s) => s.seq), [['earth', 'mars', 'jupiter']])
  const two = runMga({ ...base, mustVisit: 'mars' }, () => {})
  assert.ok(two.solutions.length >= 3)
  for (const s of two.solutions) assert.ok(s.seq.slice(1, -1).includes('mars'), s.seq.join('>'))
  assert.ok(!('porkchop' in two))
})

test('v∞ launcher/arrival limits are honoured by the optimiser', () => {
  const inp: MgaInput = {
    target: 'mars', maxFlybys: 0, flybyBodies: [], mode: 'departure', tRef: toJ2000(Date.UTC(2026, 6, 1)), windowDays: 400,
    objective: 'fastest', dvBudget: 99, parkAlt: 200, arrival: 'flyby', capAlt: 300, capEcc: 0,
  }
  const free = runMga(inp, () => {}).solutions.find((s) => s.tag === 'snelst')!
  const lim = runMga({ ...inp, maxVinfDep: 4, maxVinfArr: 6 }, () => {}).solutions.find((s) => s.tag === 'snelst')!
  assert.ok(free.events[0].vinf > 6, `unconstrained launch v∞ ${free.events[0].vinf}`)
  assert.ok(lim.events[0].vinf <= 4 + 1e-3, `launch v∞ ${lim.events[0].vinf}`)
  assert.ok(lim.events[1].vinf <= 6 + 1e-3, `arrival v∞ ${lim.events[1].vinf}`)
  assert.equal(lim.limitExcess, 0)
  assert.ok(lim.tof > free.tof)
  // a limit below anything reachable is reported as a violation instead of being silently ignored
  const bad = runMga({ ...inp, objective: 'mindv', maxVinfDep: 0.5 }, () => {}).solutions[0]
  assert.ok(bad.limitExcess! > 0 && !bad.feasible)
})

test('Pluto: JPL elements → perihelion/aphelion range, 248 yr period, 32.9 AU on 2015-07-14', () => {
  const b = BODIES.pluto
  near(b.el[0] * (1 - b.el[1]), 29.66, 0.01)
  near(b.el[0] * (1 + b.el[1]), 49.31, 0.01)
  const T = 2 * Math.PI * Math.sqrt((bodyElements('pluto', 0).a) ** 3 / MU_SUN) / (365.25 * DAY)
  near(T, 248, 1, 'period')
  const t = toJ2000(Date.UTC(2015, 6, 14))
  near(norm(bodyState('pluto', t).r) / AU, 32.9, 0.3, 'New Horizons encounter distance') // NASA: 32.9 AU from the Sun
  for (const y of [1900, 2000, 2100]) {
    const d = norm(bodyState('pluto', toJ2000(Date.UTC(y, 0, 1))).r) / AU
    assert.ok(d > 29.6 && d < 49.4, `${y}: ${d}`)
  }
})

test('Pluto: January-2006 window finds a New-Horizons-like Earth → Jupiter → Pluto route in < 10 s', () => {
  const inp: MgaInput = {
    target: 'pluto', maxFlybys: 1, flybyBodies: ['venus', 'earth', 'mars', 'jupiter', 'saturn'], mode: 'departure', tRef: toJ2000(Date.UTC(2006, 0, 1)),
    windowDays: 120, objective: 'fastest', dvBudget: 8.9, parkAlt: 200, arrival: 'flyby', capAlt: 500, capEcc: 0,
  }
  const t0 = performance.now()
  const r = runMga(inp, () => {})
  const ms = performance.now() - t0
  const s = r.solutions.find((x) => x.seq.join('>') === 'earth>jupiter>pluto' && x.tag === 'snelst')!
  assert.ok(s && s.feasible)
  console.log(`  Pluto: ${fmtDate(s.tDep)} → Jupiter ${fmtDate(s.events[1].t)} → ${fmtDate(s.tArr)} (${(s.tof / DAY / 365.25).toFixed(1)} yr), ${ms.toFixed(0)} ms`)
  // New Horizons: launch 2006-01-19, Jupiter 2007-02-28, Pluto 2015-07-14, C3 = 157 km²/s² (v∞ 12.5 km/s)
  near(s.tDep, toJ2000(Date.UTC(2006, 0, 19)), 20 * DAY, 'launch')
  near(s.events[1].t, toJ2000(Date.UTC(2007, 1, 28)), 40 * DAY, 'Jupiter flyby')
  near(s.tArr, toJ2000(Date.UTC(2015, 6, 14)), 90 * DAY, 'arrival')
  near(s.events[0].vinf, 12.5, 0.5, 'launch v∞')
  assert.ok(s.tof / DAY / 365.25 > 9 && s.tof / DAY / 365.25 < 10.5)
  assert.ok(ms < 10000, `${ms} ms`)
})

test('Pluto with up to 2 assists still contains the Jupiter route (≈ 4.5 s on an idle machine, no hard timing assert: CI load varies)', () => {
  const inp: MgaInput = {
    target: 'pluto', maxFlybys: 2, flybyBodies: ['venus', 'earth', 'mars', 'jupiter', 'saturn'], mode: 'departure', tRef: toJ2000(Date.UTC(2006, 0, 1)),
    windowDays: 120, objective: 'fastest', dvBudget: 8.9, parkAlt: 200, arrival: 'flyby', capAlt: 500, capEcc: 0,
  }
  const r = runMga(inp, () => {})
  assert.ok(r.solutions.some((x) => x.seq.join('>') === 'earth>jupiter>pluto' && x.feasible))
  assert.ok(r.solutions.some((x) => x.seq.length === 4)) // two-assist routes were searched too
})
