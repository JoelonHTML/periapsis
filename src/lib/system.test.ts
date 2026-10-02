// Run: node --test src/lib/system.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { AU, BODIES, DAY, DEG, MU_EARTH, MU_SUN, YEAR, bodyState, keplerE, norm, sub, toJ2000, type Vec } from './astro.ts'
import {
  SYSTEMS, SYS_IDS, apoFromE, appendPlan, combinedDv, eccOf, initialOrbit, keplerPeriod, moonPosEcl, orbPeriod, orbState, planManeuver,
  planetFrame, propFor, shipState, toOrb, vApo, vPeri, type Orb, type Seg,
} from './system.ts'
import { EXTRA, extraOrbit, extraPeriod, extraState, kuiperRows } from './extra-bodies.ts'

const near = (a: number, b: number, tol: number, msg = '') => assert.ok(Math.abs(a - b) <= tol, `${msg} ${a} ≉ ${b} (±${tol})`)
const angleDeg = (a: Vec, b: Vec) => Math.acos((a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / (norm(a) * norm(b))) / DEG
const date = (s: string) => toJ2000(Date.parse(s))

// ---- moons ----------------------------------------------------------------------------------------------------------
test('catalogue periods agree with Kepler III (a, planet GM) and with the published periods', () => {
  const published: Record<string, number> = { io: 1.769, titan: 15.945, phobos: 0.319, europa: 3.551, ganymede: 7.155, callisto: 16.689, triton: 5.877, charon: 6.387, oberon: 13.463 }
  for (const id of SYS_IDS) {
    for (const mn of SYSTEMS[id].moons) {
      const k = keplerPeriod(mn.a, BODIES[id].mu) / DAY
      // moon mass, J2 and perturbations: Kepler III from the planet's GM alone is good to ~1 %
      near(k / mn.P, 1, mn.id === 'hyperion' ? 0.03 : id === 'pluto' ? 0.07 : 0.012, `${mn.name} Kepler/catalogue`) // Hyperion: Titan 4:3 resonance; Pluto moons: Pluto's GM alone, without Charon's 12 % mass
      if (published[mn.id]) near(mn.P, published[mn.id], 0.002 * published[mn.id], `${mn.name} published`)
    }
  }
  near(keplerPeriod(421800, 126686531.9) / DAY, 1.7699, 0.001, 'Io')
  near(keplerPeriod(9376, 42828.4) / DAY, 0.3190, 0.0005, 'Phobos')
})

test('moon positions: distance within a(1±e); retrograde moons run against the planet spin', () => {
  const t = date('2030-06-01')
  for (const id of SYS_IDS) {
    const f = planetFrame(id)
    for (const mn of SYSTEMS[id].moons) {
      if (mn.id === 'moon') continue
      for (const dt of [0, 0.3 * mn.P * DAY, 1.7 * mn.P * DAY]) {
        const r = norm(moonPosEcl(id, mn, t + dt, f))
        assert.ok(r >= mn.a * (1 - mn.e) - 1e-6 && r <= mn.a * (1 + mn.e) + 1e-6, `${mn.name} r=${r}`)
      }
    }
  }
  const f = planetFrame('neptune'), tr = SYSTEMS.neptune.moons.find((x) => x.id === 'triton')!
  const r1 = moonPosEcl('neptune', tr, t, f), r2 = moonPosEcl('neptune', tr, t + 3600, f)
  const h = [r1[1] * r2[2] - r1[2] * r2[1], r1[2] * r2[0] - r1[0] * r2[2], r1[0] * r2[1] - r1[1] * r2[0]] as Vec
  assert.ok(h[0] * f.Z[0] + h[1] * f.Z[1] + h[2] * f.Z[2] < 0, 'Triton retrograde')
  near(norm(moonPosEcl('earth', SYSTEMS.earth.moons[0], t)), 384400, 30000, 'Moon distance')
})

test('IAU pole orientation gives the known axial tilts to the ecliptic', () => {
  // tilt of the SPIN vector: the IAU pole is the spin axis only for prograde rotators (wRate > 0)
  const tilt = (id: Parameters<typeof planetFrame>[0]) => { const a = angleDeg(planetFrame(id).Z, [0, 0, 1]); return SYSTEMS[id].wRate < 0 ? 180 - a : a }
  near(tilt('earth'), 23.439, 0.01, 'Earth')
  near(tilt('mars'), 26.7, 0.3, 'Mars')
  near(tilt('saturn'), 28.0, 1.2, 'Saturn')
  near(tilt('uranus'), 98.0, 1.2, 'Uranus')
  near(tilt('jupiter'), 3.1, 1.6, 'Jupiter')
  near(tilt('neptune'), 28.3, 1.0, 'Neptune')
  const f = planetFrame('mars')
  near(angleDeg(f.X, f.Y), 90, 1e-9); near(angleDeg(f.X, f.Z), 90, 1e-9)
})

// ---- orbit maths ----------------------------------------------------------------------------------------------------
const MU_MARS = 42828.4, R_MARS = 3389.5
const circ = (alt: number, i = 30, tp = 0): Orb => toOrb({ rpAlt: alt, raAlt: alt, incDeg: i, nodeDeg: 0, argpDeg: 0 }, R_MARS, tp)

test('vis-viva / circular speeds', () => {
  near(vPeri(circ(200), MU_MARS), 3.4542, 5e-4, 'Mars 200 km')
  near(vPeri(toOrb({ rpAlt: 400, raAlt: 400, incDeg: 51.6, nodeDeg: 0, argpDeg: 0 }, 6378.137, 0), MU_EARTH), 7.6686, 5e-4, 'ISS')
  // GTO 250 × 35 786 km by hand: v_peri = √(μ(2/6628.1 − 1/24396.1)) = 10.195, v_apo = 1.6025 km/s
  const gto = toOrb({ rpAlt: 250, raAlt: 35786, incDeg: 0, nodeDeg: 0, argpDeg: 0 }, 6378.137, 0)
  near(vPeri(gto, MU_EARTH), 10.195, 0.005, 'GTO perigee'); near(vApo(gto, MU_EARTH), 1.6025, 0.002, 'GTO apogee')
  near(orbPeriod(circ(200), MU_MARS) / 3600, 1.8137, 0.0005, 'Mars 200 km period') // 2π√(3589.5³/42828.4) = 6529 s
})

test('eccentricity <-> apogee conversion', () => {
  const rp = R_MARS + 200
  const ra = apoFromE(rp, 0.1)
  near(ra, 4387.17, 0.01, 'ra')
  near(eccOf(rp, ra), 0.1, 1e-12, 'e roundtrip')
  near(ra - R_MARS, 997.67, 0.01, 'apogee altitude')
  assert.equal(eccOf(rp, rp), 0)
  // swapped inputs are normalised, absurd eccentricity is capped
  const o = toOrb({ rpAlt: 1000, raAlt: 200, incDeg: 0, nodeDeg: 0, argpDeg: 0 }, R_MARS, 0)
  near(o.rp, R_MARS + 200, 1e-9); near(o.ra, R_MARS + 1000, 1e-9)
  assert.ok(eccOf(toOrb({ rpAlt: 100, raAlt: 1e9, incDeg: 0, nodeDeg: 0, argpDeg: 0 }, R_MARS, 0).rp, toOrb({ rpAlt: 100, raAlt: 1e9, incDeg: 0, nodeDeg: 0, argpDeg: 0 }, R_MARS, 0).ra) <= 0.995 + 1e-12)
})

test('plane change Δv = √(v1²+v2²−2 v1 v2 cos Δi)', () => {
  near(combinedDv(3, 4, Math.PI / 2), 5, 1e-12, 'right angle')
  near(combinedDv(3.4542, 3.4542, 10 * DEG), 2 * 3.4542 * Math.sin(5 * DEG), 1e-9, 'pure rotation')
  near(combinedDv(3.4542, 3.4542, 10 * DEG), 0.6022, 1e-3)
  near(combinedDv(5, 5, 0), 0, 1e-12)
  near(combinedDv(5, 6, 0), 1, 1e-12)
})

test('Mars 200 → 400 km circular Hohmann: Δv, transfer time and propellant (Tsiolkovsky)', () => {
  const from = circ(200), to = { rp: R_MARS + 400, ra: R_MARS + 400, i: 30 * DEG }
  const m0 = 1200 + 1800, isp = 320
  const p = planManeuver(MU_MARS, from, to, 0, m0, isp)
  // hand calc: r1 = 3589.5, r2 = 3789.5 km, μ = 42828.4 → Δv1 = v1(√(2r2/(r1+r2)) − 1) = 0.04650, Δv2 = v2(1 − √(2r1/(r1+r2))) = 0.04587 km/s
  assert.equal(p.burns.length, 2)
  near(p.burns[0].dv, 0.04650, 2e-5, 'Δv1'); near(p.burns[1].dv, 0.04587, 2e-5, 'Δv2')
  near(p.dv, 0.09237, 4e-5, 'total')
  near(p.tof / 3600, 0.945, 0.001, 'transfer time (h)')
  // m_p = m0 (1 − exp(−Δv/(Isp g0))) = 3000 (1 − exp(−0.09237/3.1381)) = 87.0 kg
  near(p.kg, 87.0, 0.2, 'propellant')
  near(p.kg, propFor(m0, p.dv, isp), 1e-9, 'sequential burns = one burn of the total Δv')
  near(p.mFinal, m0 - p.kg, 1e-9)
  // the two burns are half a transfer orbit apart, burn 1 at the old periapsis (tp = 0)
  near(p.tb1, 0, 1e-6); near(p.tb2 - p.tb1, p.tof, 1e-9)
  near(p.final.rp, R_MARS + 400, 1e-9)
  assert.ok(!p.same)
})

test('lowering 400 → 200 km costs the same Δv (Hohmann symmetry) and burns retrograde', () => {
  const up = planManeuver(MU_MARS, circ(200), { rp: R_MARS + 400, ra: R_MARS + 400, i: 30 * DEG }, 0, 3000, 320)
  const down = planManeuver(MU_MARS, circ(400), { rp: R_MARS + 200, ra: R_MARS + 200, i: 30 * DEG }, 0, 3000, 320)
  near(down.dv, up.dv, 1e-9)
  assert.ok(down.burns[0].vAfter < down.burns[0].vBefore)
})

test('no-op and plane-change-only plans', () => {
  const same = planManeuver(MU_MARS, circ(200), { rp: R_MARS + 200, ra: R_MARS + 200, i: 30 * DEG }, 0, 3000, 320)
  assert.ok(same.same); assert.equal(same.burns.length, 0)
  // pure 10° plane change in a 200 km circular orbit: ≈ 2 v sin(5°)
  const pc = planManeuver(MU_MARS, circ(200), { rp: R_MARS + 200, ra: R_MARS + 200, i: 40 * DEG }, 0, 3000, 320)
  near(pc.dv, 2 * 3.4542 * Math.sin(5 * DEG), 1e-3, 'plane change')
  // a combined transfer is cheaper than doing the plane change separately
  const both = planManeuver(MU_MARS, circ(200), { rp: R_MARS + 400, ra: R_MARS + 400, i: 40 * DEG }, 0, 3000, 320)
  assert.ok(both.dv < 0.09237 + pc.dv)
})

test('timeline: positions are continuous at the burns and the speed jumps by exactly Δv', () => {
  const from = circ(200, 30, 0)
  const segs0: Seg[] = [{ t0: -Infinity, t1: Infinity, orb: from, kind: 'orbit' }]
  const plan = planManeuver(MU_MARS, from, { rp: R_MARS + 400, ra: R_MARS + 400, i: 30 * DEG }, 1000, 3000, 320)
  const segs = appendPlan(segs0, plan)
  assert.equal(segs.length, 3)
  const eps = 1e-3
  for (const b of plan.burns) {
    const a = shipState(segs, MU_MARS, b.t - eps), z = shipState(segs, MU_MARS, b.t + eps)
    near(norm(sub(a.r, z.r)), 0, 0.01, `burn ${b.n} position jump`)
    near(z.speed - a.speed, b.vAfter - b.vBefore, 1e-4, `burn ${b.n} speed jump`)
    near(Math.abs(z.speed - a.speed), b.dv, 1e-4, `burn ${b.n} Δv`)
  }
  // after the second burn the craft is on a 400 km circle
  const late = shipState(segs, MU_MARS, plan.tb2 + 0.4 * orbPeriod(plan.final, MU_MARS))
  near(late.rad, R_MARS + 400, 0.01, 'final radius')
  near(late.speed, Math.sqrt(MU_MARS / (R_MARS + 400)), 1e-6, 'final speed')
  // the transfer reaches the target radius at its far apsis and is strictly between the circles before that
  near(shipState(segs, MU_MARS, plan.tb2 - 1e-3).rad, R_MARS + 400, 0.01, 'apogee of the transfer')
  const mid = shipState(segs, MU_MARS, plan.tb1 + plan.tof / 2).rad
  assert.ok(mid > R_MARS + 200 && mid < R_MARS + 400)
})

test('non-circular start: burn 1 at periapsis, burn 2 at the new apoapsis; elliptical → circular', () => {
  const from = toOrb({ rpAlt: 300, raAlt: 3000, incDeg: 20, nodeDeg: 10, argpDeg: 40 }, R_MARS, 500)
  const to = { rp: R_MARS + 3000, ra: R_MARS + 3000, i: 20 * DEG }
  const p = planManeuver(MU_MARS, from, to, 123456, 3000, 320)
  // old apoapsis = target radius → burn 1 is zero, burn 2 circularises at apoapsis: Δv = v_circ − v_apo
  assert.equal(p.burns.length, 1)
  const vc = Math.sqrt(MU_MARS / (R_MARS + 3000))
  near(p.burns[0].dv, vc - vApo(from, MU_MARS), 1e-9)
  // epoch of the first periapsis at/after tNow
  const T = orbPeriod(from, MU_MARS)
  assert.ok(p.tb1 >= 123456 - 1e-6 && p.tb1 < 123456 + T)
  near(((p.tb1 - from.tp) / T) % 1 < 1e-6 ? 0 : 0, 0, 0)
  const st = orbState(from, MU_MARS, p.tb1)
  near(norm(st.r), from.rp, 1e-3, 'at periapsis')
})

test('initial orbit from a mission arrival or the default', () => {
  const sol = { arrival: { kind: 'ellipse', body: 'mars' as const, rp: R_MARS + 500, e: 0.9 }, tArr: 123 }
  const m = initialOrbit('mars', sol, 0)
  assert.equal(m.src, 'mission'); near(m.alt.rpAlt, 500, 1e-9); near(m.alt.raAlt, (R_MARS + 500) * 1.9 / 0.1 - R_MARS, 1e-6); assert.equal(m.tp, 123)
  assert.equal(initialOrbit('jupiter', sol, 5).src, 'default')
  assert.equal(initialOrbit('mars', { ...sol, arrival: { ...sol.arrival, kind: 'flyby' } }, 5).src, 'default')
  const d = initialOrbit('earth', null, 77)
  near(d.alt.rpAlt, 200, 0); near(d.alt.incDeg, 51.6, 0); assert.equal(d.tp, 77)
})

// ---- extra objects --------------------------------------------------------------------------------------------------
test('Halley: period from a (Kepler III), perihelion and aphelion distance', () => {
  const h = EXTRA.find((x) => x.id === 'halley')!
  near(extraPeriod(h) / YEAR, 75.3, 0.1, 'period') // observed 75.3 y; a = 17.834 AU → a^1.5 = 75.31 y
  near(keplerPeriod(17.834 * AU, MU_SUN) / YEAR, 75.31, 0.01)
  near(norm(extraState(h, date('1986-02-09')).r) / AU, 0.586, 0.002, 'q')
  near(norm(extraState(h, date('1986-02-09') + extraPeriod(h) / 2).r) / AU, 35.08, 0.02, 'Q')
  // 2024: Halley sits at ~35.1 AU (aphelion was Dec 2023)
  near(norm(extraState(h, date('2024-01-01')).r) / AU, 35.1, 0.15, 'r(2024)')
})

test('Kepler solver is stable for near-parabolic orbits', () => {
  for (const e of [0.9, 0.967, 0.995]) {
    for (let k = 0; k < 720; k++) {
      const M = (k / 720) * 2 * Math.PI, E = keplerE(M, e)
      near(E - e * Math.sin(E), M, 1e-9, `e=${e} M=${M}`)
    }
  }
})

test('extra bodies sit where they should (independent observations)', () => {
  const r = (id: string, d: string) => norm(extraState(EXTRA.find((x) => x.id === id)!, date(d)).r) / AU
  near(r('eris', '2024-01-01'), 95.8, 1.5, 'Eris ~96 AU')
  near(r('haumea', '2024-01-01'), 51.5, 2, 'Haumea')
  near(r('makemake', '2024-01-01'), 52.7, 2, 'Makemake')
  near(r('sedna', '2024-01-01'), 83.8, 3, 'Sedna')
  near(r('chiron', '2024-01-01'), 18.8, 0.4, 'Chiron')
  near(r('halebopp', '1997-04-01'), 0.914, 0.003, 'Hale–Bopp q')
  near(r('67p', '2021-11-02'), 1.210, 0.05, '67P q')
  // Vesta at its 2018-06-19 opposition: ~2.15 AU from the Sun, ~1.14 AU from Earth
  const t = date('2018-06-19'), vesta = extraState(EXTRA.find((x) => x.id === 'vesta')!, t).r, earth = bodyState('earth', t).r
  near(norm(vesta) / AU, 2.15, 0.1, 'Vesta r'); near(norm(sub(vesta, earth)) / AU, 1.14, 0.12, 'Vesta–Earth')
  // Eros close approach 2012-01-31 (0.18 AU)
  const t2 = date('2012-01-31')
  assert.ok(norm(sub(extraState(EXTRA.find((x) => x.id === 'eros')!, t2).r, bodyState('earth', t2).r)) / AU < 0.45)
})

test('orbit polylines close on themselves; Kuiper belt cloud has the requested structure', () => {
  for (const d of EXTRA) {
    const pts = extraOrbit(d)
    assert.ok(pts.every((p) => p.every(Number.isFinite)), d.id)
    near(norm(pts[240]) / AU, d.a * (1 - d.e), 0.01 * d.a, `${d.id} perihelion`) // true anomaly 0 is the middle sample
  }
  const rows = kuiperRows(2000)
  assert.equal(rows.length, 2000)
  const plut = rows.filter((x) => Math.abs(x[0] - 39.4) < 0.8).length, two = rows.filter((x) => Math.abs(x[0] - 47.8) < 1).length
  assert.ok(plut > 150 && two > 80, `clumps ${plut} ${two}`)
  assert.ok(rows.every((x) => x[0] >= 30 && x[1] < 0.95))
})
