// Run: node --test src/features/missions/*.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { AU, DAY, MU_SUN, bodyState, norm, propagate, sub } from '../../lib/astro.ts'
import { MISSIONS, evMs, isNode, missionById } from './data.ts'
import { lambertRev } from './lambert-rev.ts'
import { eventPosition, reconstruct, samplePath, stateAt } from './recon.ts'

const mission = (id: string) => missionById(id)!

test('ids are unique and every mission has texts in three languages', () => {
  assert.equal(new Set(MISSIONS.map((m) => m.id)).size, MISSIONS.length)
  for (const m of MISSIONS) {
    for (const l of ['nl', 'en', 'el'] as const) assert.ok(m.desc[l].length > 20, `${m.id} ${l}`)
    assert.ok(m.source && m.agency)
  }
})

test('every mission: events in chronological order, a launch first, valid dates', () => {
  for (const m of MISSIONS) {
    const ts = m.events.map(evMs)
    ts.forEach((t, i) => {
      assert.ok(Number.isFinite(t), `${m.id} #${i} date`)
      if (i) assert.ok(t > ts[i - 1], `${m.id}: event ${i} (${m.events[i].date}) not after ${m.events[i - 1].date}`)
    })
    assert.equal(m.events[0].kind, 'launch', m.id)
    assert.equal(m.events.filter((e) => e.kind === 'launch').length, 1, m.id)
    for (const e of m.events) if (isNode(e)) assert.ok(e.body, `${m.id} node without body`)
    for (const e of m.events) if (e.kind === 'minor' || e.kind === 'end') assert.ok(e.text, `${m.id} ${e.kind} needs text`)
    const nodes = m.events.filter(isNode)
    assert.ok(nodes.length >= 2, m.id)
    assert.equal(nodes[nodes.length - 1].kind, 'arrival', `${m.id}: last node is the arrival`)
  }
})

test('every reconstructed Lambert leg closes within 1000 km and has a finite state', () => {
  for (const m of MISSIONS) {
    const rc = reconstruct(m)
    assert.equal(rc.error, null, `${m.id}: ${rc.error}`)
    assert.equal(rc.legs.length, rc.nodes.length - 1)
    for (const l of rc.legs) {
      const end = propagate(l.r1, l.v1, l.t2 - l.t1, MU_SUN)
      assert.ok(norm(sub(end.r, bodyState(l.to, l.t2).r)) < 1000, `${m.id} ${l.from}→${l.to}: closure ${l.closure}`)
      assert.ok(Number.isFinite(l.a) && Number.isFinite(l.e), `${m.id} elements`)
    }
    assert.ok(Number.isFinite(rc.c3) && rc.c3 >= 0)
    assert.ok(Math.abs(rc.tof / DAY - (evMs(rc.nodes[rc.nodes.length - 1].ev) - evMs(rc.nodes[0].ev)) / 1000 / DAY) < 1e-6)
  }
})

test('reconstructed arcs never dive into the Sun (perihelion > 0.2 AU) and stay bounded', () => {
  for (const m of MISSIONS) {
    const p = samplePath(reconstruct(m), 120)
    const rs = p.pts.map(norm)
    assert.ok(Math.min(...rs) > 0.2 * AU, `${m.id} min r ${Math.min(...rs) / AU}`)
    assert.ok(Math.max(...rs) < 45 * AU, `${m.id} max r ${Math.max(...rs) / AU}`)
  }
})

test('Voyager 2: launch C3 of the order 100 km²/s², Jupiter v∞ 7–15 km/s, small unpowered-flyby mismatch', () => {
  const rc = reconstruct(mission('voyager2'))
  assert.ok(rc.c3 > 80 && rc.c3 < 130, `C3 ${rc.c3}`) // Titan IIIE-Centaur: about 100 km²/s²
  const jup = rc.flybys[0]
  assert.equal(jup.body, 'jupiter')
  assert.ok(jup.vinfIn > 7 && jup.vinfIn < 15, `v∞ Jupiter ${jup.vinfIn}`)
  assert.ok(Math.abs(jup.dVinf) < 1.5, `v∞ mismatch ${jup.dVinf}`)
  assert.deepEqual(rc.flybys.map((f) => f.body), ['jupiter', 'saturn', 'uranus'])
  assert.equal(rc.nodes[rc.nodes.length - 1].body, 'neptune')
  assert.ok(rc.tof / (365.25 * DAY) > 12 && rc.tof / (365.25 * DAY) < 12.2)
})

test('Voyager 1 and the Pioneers: Jupiter leg of 1.5–2 years, v∞ at Jupiter 8–12 km/s', () => {
  for (const id of ['voyager1', 'pioneer10', 'pioneer11']) {
    const rc = reconstruct(mission(id))
    const leg = rc.legs[0]
    assert.equal(leg.to, 'jupiter')
    assert.ok((leg.t2 - leg.t1) / DAY > 500 && (leg.t2 - leg.t1) / DAY < 700, id)
    assert.ok(leg.vinfB > 7 && leg.vinfB < 12, `${id} ${leg.vinfB}`)
  }
  assert.ok(reconstruct(mission('voyager1')).c3 > 90 && reconstruct(mission('voyager1')).c3 < 130)
})

test('Cassini: V–V–E–J–S route, dates in order, Earth flyby arrival v∞ ~ 16 km/s', () => {
  const m = mission('cassini'), rc = reconstruct(m)
  assert.deepEqual(rc.nodes.map((n) => n.body), ['earth', 'venus', 'venus', 'earth', 'jupiter', 'saturn'])
  const d = (i: number) => m.events[i].date
  assert.ok(d(1) < d(2) && d(2) < d(3) && d(3) < d(4))
  assert.equal(d(1).slice(0, 10), '1998-04-26')
  const earth = rc.flybys.find((f) => f.body === 'earth')!
  assert.ok(earth.vinfIn > 15 && earth.vinfIn < 17.5, `${earth.vinfIn}`)
  // launch C3 of Cassini was about 16–18 km²/s²
  assert.ok(rc.c3 > 10 && rc.c3 < 25, `C3 ${rc.c3}`)
})

test('New Horizons: launch C3 ~ 150–170, Jupiter flyby adds speed, ends at Pluto after ~9.5 years', () => {
  const rc = reconstruct(mission('newhorizons'))
  assert.ok(rc.c3 > 130 && rc.c3 < 190, `C3 ${rc.c3}`)
  const f = rc.flybys[0]
  assert.ok(f.vinfIn > 15 && f.vinfIn < 22)
  assert.equal(rc.nodes[2].body, 'pluto')
  assert.ok(Math.abs(rc.tof / (365.25 * DAY) - 9.5) < 0.1)
})

test('Mariner 10, MESSENGER, BepiColombo: inner-system routes visit Venus and Mercury in order', () => {
  assert.deepEqual(reconstruct(mission('mariner10')).nodes.map((n) => n.body), ['earth', 'venus', 'mercury', 'mercury', 'mercury'])
  assert.deepEqual(reconstruct(mission('messenger')).nodes.map((n) => n.body), ['earth', 'earth', 'venus', 'venus', 'mercury', 'mercury', 'mercury', 'mercury'])
  assert.equal(reconstruct(mission('bepicolombo')).nodes.length, 10)
  const mv = reconstruct(mission('mariner10')).legs[2]
  assert.ok(Math.abs(mv.a / AU - 0.61) < 0.03, `Mariner 10 cruise orbit a=${mv.a / AU}`) // 176-day orbit: 2 Mercury years
})

test('stateAt: matches the node bodies at the event dates, null outside the mission', () => {
  const rc = reconstruct(mission('voyager2'))
  for (const n of rc.nodes) {
    const s = stateAt(rc, n.t)!
    assert.ok(norm(sub(s.r, n.r)) < 1000)
  }
  assert.equal(stateAt(rc, rc.tStart - DAY), null)
  assert.equal(stateAt(rc, rc.tEnd + DAY), null)
  assert.ok(norm(sub(stateAt(rc, rc.tStart + 1)!.r, rc.nodes[0].r)) < 1e5)
})

test('eventPosition: nodes, events at a body and mid-flight events resolve; far-future events do not', () => {
  const rc = reconstruct(mission('galileo'))
  for (const e of mission('galileo').events) assert.ok(eventPosition(rc, e), e.date) // Gaspra/Ida on the path, end at Jupiter
  const nh = reconstruct(mission('newhorizons'))
  assert.equal(eventPosition(nh, mission('newhorizons').events[3]), null) // Arrokoth: after the last node, not modelled
})

test('lambertRev: revolving arc closes and agrees with the 0-rev arc for revs=0', () => {
  const a = bodyState('earth', 0), b = bodyState('mars', 400 * DAY)
  const s0 = lambertRev(a.r, b.r, 400 * DAY, MU_SUN, 0)!
  const e0 = propagate(a.r, s0.v1, 400 * DAY, MU_SUN)
  assert.ok(norm(sub(e0.r, b.r)) < 1000)
  const s1 = lambertRev(a.r, b.r, 1200 * DAY, MU_SUN, 1, 'lo')!
  const e1 = propagate(a.r, s1.v1, 1200 * DAY, MU_SUN)
  assert.ok(norm(sub(e1.r, b.r)) < 1000)
})
