// Run: node --test src/lib/lambert-rev.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { DAY, MU_SUN, bodyState, lambert, norm, propagate, sub, toJ2000 } from './astro.ts'
import { lambertLeg, lambertRev, lambertRevBranches } from './lambert-rev.ts'

const t0 = toJ2000(Date.UTC(2020, 0, 1))
const earth = bodyState('earth', t0)

test('zero revolutions equals the app\'s single-rev lambert', () => {
  for (const [to, days] of [['mars', 210], ['venus', 150], ['jupiter', 900], ['mars', 300]] as const) {
    const r2 = bodyState(to, t0 + days * DAY).r
    const a = lambert(earth.r, r2, days * DAY, MU_SUN)!, b = lambertRev(earth.r, r2, days * DAY, MU_SUN, 0)!
    assert.ok(a && b, `${to} ${days}`)
    assert.ok(norm(sub(a.v1, b.v1)) < 1e-6, `${to} v1 ${norm(sub(a.v1, b.v1))}`)
    assert.ok(norm(sub(a.v2, b.v2)) < 1e-6, `${to} v2`)
  }
})

test('one-revolution arcs (both branches) close when propagated', () => {
  const tof = 900 * DAY
  const r2 = bodyState('mars', t0 + tof).r
  const br = lambertRevBranches(earth.r, r2, tof, MU_SUN, 1)
  assert.ok(br.lo && br.hi, 'both branches exist for 900 d to Mars')
  assert.ok(norm(sub(br.lo!.v1, br.hi!.v1)) > 0.1, 'the two branches are different orbits')
  for (const [name, arc] of [['lo', br.lo!], ['hi', br.hi!]] as const) {
    const end = propagate(earth.r, arc.v1, tof, MU_SUN)
    assert.ok(norm(sub(end.r, r2)) < 1e3, `${name} miss ${norm(sub(end.r, r2))} km`) // < 1000 km of 2e8 km
    assert.ok(norm(sub(end.v, arc.v2)) < 1e-4, `${name} arrival velocity`)
    const energy = (norm(arc.v1) ** 2) / 2 - MU_SUN / norm(earth.r)
    assert.ok(energy < 0, `${name} is an ellipse`)
    // an N-rev arc of 900 d is a closed orbit whose period is shorter than the flight time
    const a = -MU_SUN / (2 * energy)
    assert.ok(2 * Math.PI * Math.sqrt(a ** 3 / MU_SUN) < tof, `${name} period < tof`)
  }
  // lambertLeg polishes to a few metres
  const polished = lambertLeg(earth.r, r2, tof, MU_SUN, 1, 'hi')!
  assert.ok(norm(sub(propagate(earth.r, polished.v1, tof, MU_SUN).r, r2)) < 0.01)
})

test('Earth → Earth in about two years (1 rev, resonant leg) closes; the near-exact resonance is rejected, not mis-solved', () => {
  const tof = 760 * DAY
  const r2 = bodyState('earth', t0 + tof).r
  const arcs = [lambertLeg(earth.r, r2, tof, MU_SUN, 1, 'lo'), lambertLeg(earth.r, r2, tof, MU_SUN, 1, 'hi')]
  assert.ok(arcs.some((a) => a), 'at least one branch')
  for (const a of arcs) if (a) assert.ok(norm(sub(propagate(earth.r, a.v1, tof, MU_SUN).r, r2)) < 1, 'closes to 1 km')
  // exactly two sidereal years: r2 ≈ r1 is numerically degenerate; a branch that fails to converge must come back null, never a wrong arc
  const tx = 730.5 * DAY, rx = bodyState('earth', t0 + tx).r
  for (const br of ['lo', 'hi'] as const) {
    const a = lambertLeg(earth.r, rx, tx, MU_SUN, 1, br)
    if (a) assert.ok(norm(sub(propagate(earth.r, a.v1, tx, MU_SUN).r, rx)) < 1, `degenerate ${br} closes or is null`)
  }
})

test('two revolutions close; too short a flight time has no multi-rev solution', () => {
  const tof = 1500 * DAY, r2 = bodyState('mars', t0 + tof).r
  const a = lambertLeg(earth.r, r2, tof, MU_SUN, 2, 'lo') ?? lambertLeg(earth.r, r2, tof, MU_SUN, 2, 'hi')
  assert.ok(a, '2-rev arc to Mars in 1500 d')
  assert.ok(norm(sub(propagate(earth.r, a.v1, tof, MU_SUN).r, r2)) < 1)
  assert.equal(lambertRev(earth.r, bodyState('mars', t0 + 200 * DAY).r, 200 * DAY, MU_SUN, 1, 'lo'), null)
  assert.equal(lambertRev(earth.r, bodyState('jupiter', t0 + 400 * DAY).r, 400 * DAY, MU_SUN, 2, 'hi'), null)
})
