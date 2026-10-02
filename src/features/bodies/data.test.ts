// Run: node --test src/features/bodies/*.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { BODY_LIST, BODY_MAP, NAMES, G_CONST, AU_KM } from './data.ts'
import { BODIES, MU_SUN } from '../../lib/astro.ts'
import { SYSTEMS } from '../../lib/system.ts'
import { SPECS, generateQuiz, metricValue, mulberry32 } from './quiz.ts'
import { fmtNum, fmtSci, fmtDuration, fmtGas } from './format.ts'

const rel = (a: number, b: number) => Math.abs(a - b) / Math.abs(b)
const vol = (R: number) => (4 / 3) * Math.PI * (R * 1000) ** 3

test('surface gravity, escape velocity and density agree with mass and radius', () => {
  for (const b of BODY_LIST) {
    const GM = G_CONST * b.M, R = b.R * 1000
    assert.ok(rel(b.g, GM / R ** 2) < 0.02, `${b.id} g ${b.g} vs ${GM / R ** 2}`)
    assert.ok(rel(b.vesc, Math.sqrt((2 * GM) / R) / 1000) < 0.02, `${b.id} vesc ${b.vesc} vs ${Math.sqrt((2 * GM) / R) / 1000}`)
    assert.ok(rel(b.rho, b.M / vol(b.R)) < 0.03, `${b.id} rho ${b.rho} vs ${b.M / vol(b.R)}`)
  }
})

test('every body has names and nl/en/el descriptions of 2-4 sentences', () => {
  for (const b of BODY_LIST) {
    assert.ok(NAMES[b.id], b.id)
    for (const l of ['nl', 'en', 'el'] as const) {
      assert.ok(NAMES[b.id][l], `${b.id} name ${l}`)
      const d = b.desc[l]
      assert.ok(d && d.length > 80, `${b.id} ${l} desc`)
      const n = d.split(/(?<=[.!?])\s+/).length
      assert.ok(n >= 2 && n <= 4, `${b.id} ${l}: ${n} sentences`)
    }
    assert.ok(/[α-ω]/i.test(b.desc.el), `${b.id} Greek`)
    assert.ok(b.missions.length > 0, b.id)
  }
  assert.equal(new Set(BODY_LIST.map((b) => b.id)).size, BODY_LIST.length)
})

test('consistent with astro.ts and system.ts', () => {
  for (const [id, p] of Object.entries(BODIES)) {
    const b = BODY_MAP[id]
    assert.ok(b, id)
    assert.ok(rel(b.R, p.radius) < 0.002, `${id} radius ${b.R} vs ${p.radius}`)
    assert.ok(rel(G_CONST * b.M * 1e-9, p.mu) < 0.005, `${id} GM ${G_CONST * b.M * 1e-9} vs ${p.mu}`)
    assert.ok(rel(b.a!, p.el[0] * AU_KM) < 0.005, `${id} a`)
    const T = 2 * Math.PI * Math.sqrt((p.el[0] * AU_KM) ** 3 / MU_SUN) / 86400
    assert.ok(rel(b.P!, T) < 0.01, `${id} P ${b.P} vs ${T}`)
  }
  for (const sys of Object.values(SYSTEMS)) {
    for (const m of sys.moons) {
      const b = BODY_MAP[m.id]
      if (!b) continue
      assert.equal(b.parent, sys.id, m.id)
      assert.ok(rel(b.R, m.R) < 0.01, `${m.id} R ${b.R} vs ${m.R}`)
      assert.ok(rel(b.a!, m.a) < 0.001, `${m.id} a`)
      assert.ok(rel(b.P!, m.P) < 0.001, `${m.id} P`)
    }
  }
  for (const b of BODY_LIST.filter((x) => x.kind === 'moon')) {
    assert.ok(BODIES[b.parent as keyof typeof BODIES], `${b.id} parent`)
    assert.ok(SYSTEMS[b.parent as keyof typeof SYSTEMS].moons.some((m) => m.id === b.id), `${b.id} in system`)
  }
})

test('quiz: 10 questions, four distinct options, exactly one correct, for many seeds', () => {
  for (let seed = 1; seed <= 300; seed++) {
    const qs = generateQuiz(mulberry32(seed))
    assert.equal(qs.length, 10, `seed ${seed}`)
    const keys = new Set<string>()
    for (const q of qs) {
      assert.equal(q.options.length, 4)
      assert.equal(new Set(q.options).size, 4)
      assert.ok(q.options.every((id) => BODY_MAP[id]))
      keys.add(q.kind === 'parent' ? `p:${q.bodyId}` : q.spec!.id)
      if (q.kind === 'parent') {
        const moon = BODY_MAP[q.bodyId!]
        assert.equal(q.options.filter((id) => id === moon.parent).length, 1)
        assert.equal(q.options[q.correct], moon.parent)
      } else {
        const s = q.spec!, v = q.options.map((id) => metricValue(s.metric, BODY_MAP[id])!)
        assert.ok(v.every((x) => Number.isFinite(x)))
        assert.equal(new Set(v).size, 4, 'no ties')
        const best = s.dir === 'max' ? Math.max(...v) : Math.min(...v)
        assert.equal(v.filter((x) => x === best).length, 1)
        assert.equal(v[q.correct], best)
      }
    }
    assert.equal(keys.size, 10, 'distinct questions')
  }
  assert.ok(SPECS.length >= 10)
})

test('formatting', () => {
  assert.equal(fmtSci(5.9722e24, 'en'), '5.97 × 10²⁴')
  assert.equal(fmtSci(5.9722e24, 'nl'), '5,97 × 10²⁴')
  assert.equal(fmtNum(9.8, 'en'), '9.8')
  assert.equal(fmtDuration(23.9345, 'en'), '23.93 hours')
  assert.equal(fmtDuration(24 * 365.25 * 11.86, 'en', true), '11.9 years')
  assert.equal(fmtGas('CO₂ 96.5 %', 'nl'), 'CO₂ 96,5 %')
})
