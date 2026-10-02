// Patched-conic reconstruction of a real mission: heliocentric Lambert arcs between the ephemeris positions of the bodies at the
// documented event dates. This is NOT telemetry: real craft also flew deep-space manoeuvres, were perturbed by planets
// and used the real (non-patched) flyby geometry, so the Lambert arcs imply small "reconstruction mismatches" at each flyby.
import {
  BODIES, DAY, MU_SUN, RE, bodyState, flybyDv, norm, propagate, sub, toJ2000, type BodyId, type Vec,
} from '../../lib/astro.ts'
import { lambertLeg } from './lambert-rev.ts'
import { evMs, isNode, type Mission, type MissionEvent } from './data.ts'

export interface Node { evIdx: number; ev: MissionEvent; body: BodyId; t: number; r: Vec; v: Vec }
export interface Leg {
  k: number; from: BodyId; to: BodyId; t1: number; t2: number; r1: Vec; v1: Vec; r2: Vec; v2: Vec; revs: number
  /** distance (km) between the propagated end of the arc and the target body: closure check of the arc */
  closure: number
  /** semi-major axis (km) and eccentricity of the heliocentric arc */
  a: number; e: number
  /** v∞ (km/s) at the departure / arrival body implied by this arc */
  vinfA: number; vinfB: number
  /** near-resonant same-body leg whose arc is (almost) the body's own orbit: v∞ cannot be determined from positions alone */
  degenerate: boolean
}
export interface FlybyInfo {
  node: number // index in recon.nodes
  body: BodyId
  t: number
  vinfIn: number // km/s, implied by the arriving arc
  vinfOut: number // km/s, implied by the leaving arc
  /** |v∞ out| − |v∞ in|: a free (unpowered) flyby keeps v∞, so this is pure reconstruction mismatch */
  dVinf: number
  /** Δv a real burn at periapsis would need to join the two arcs (km/s) */
  dv: number
  turn: number // rad
  turnMax: number // rad (at the minimum safe periapsis)
}
export interface Recon {
  mission: Mission
  nodes: Node[]
  legs: Leg[]
  flybys: FlybyInfo[]
  /** launch hyperbolic excess speed (km/s) and C3 (km²/s²) relative to the departure body's ephemeris velocity */
  vinfLaunch: number
  c3: number
  /** hyperbolic excess speed at the last node (km/s) */
  vinfArrival: number
  tof: number // s, first to last node
  tStart: number
  tEnd: number
  /** sum of the flyby mismatch Δv (km/s) */
  dvMismatch: number
  error: string | null
}

const semiMajor = (r: Vec, v: Vec) => 1 / (2 / norm(r) - (v[0] ** 2 + v[1] ** 2 + v[2] ** 2) / MU_SUN)

function orbitElems(r: Vec, v: Vec) {
  const a = semiMajor(r, v)
  const h: Vec = [r[1] * v[2] - r[2] * v[1], r[2] * v[0] - r[0] * v[2], r[0] * v[1] - r[1] * v[0]]
  const p = (h[0] ** 2 + h[1] ** 2 + h[2] ** 2) / MU_SUN
  const e = Math.sqrt(Math.max(0, 1 - p / a))
  return { a, e }
}

const cache = new Map<string, Recon>()

export function reconstruct(m: Mission): Recon {
  const hit = cache.get(m.id)
  if (hit) return hit
  const r = build(m)
  cache.set(m.id, r)
  return r
}

function build(m: Mission): Recon {
  const nodes: Node[] = []
  m.events.forEach((ev, evIdx) => {
    if (!isNode(ev) || !ev.body) return
    const t = toJ2000(evMs(ev))
    const s = bodyState(ev.body, t)
    nodes.push({ evIdx, ev, body: ev.body, t, r: s.r, v: s.v })
  })
  const legs: Leg[] = []
  let error: string | null = null
  for (let k = 0; k < nodes.length - 1; k++) {
    const a = nodes[k], b = nodes[k + 1]
    const revs = b.ev.revs ?? 0
    const sol = lambertLeg(a.r, b.r, b.t - a.t, MU_SUN, revs, b.ev.branch ?? 'lo')
    if (!sol) { error = `no Lambert arc ${a.body}→${b.body} (${b.ev.date.slice(0, 10)})`; break }
    const end = propagate(a.r, sol.v1, b.t - a.t, MU_SUN)
    const el = orbitElems(a.r, sol.v1)
    const vinfA = norm(sub(sol.v1, a.v)), vinfB = norm(sub(sol.v2, b.v))
    legs.push({
      k, from: a.body, to: b.body, t1: a.t, t2: b.t, r1: a.r, v1: sol.v1, r2: b.r, v2: sol.v2, revs,
      closure: norm(sub(end.r, b.r)), a: el.a, e: el.e, vinfA, vinfB, degenerate: a.body === b.body && vinfA < 0.6 && vinfB < 0.6,
    })
  }
  const flybys: FlybyInfo[] = []
  let vinfLaunch = NaN, vinfArrival = NaN, tof = 0, dvMismatch = 0
  if (!error && legs.length) {
    vinfLaunch = norm(sub(legs[0].v1, nodes[0].v))
    for (let i = 1; i < nodes.length - 1; i++) {
      const n = nodes[i], b = BODIES[n.body]
      const vIn = sub(legs[i - 1].v2, n.v), vOut = sub(legs[i].v1, n.v)
      const fb = flybyDv(vIn, vOut, b.mu, b.radius * b.safe)
      flybys.push({ node: i, body: n.body, t: n.t, vinfIn: norm(vIn), vinfOut: norm(vOut), dVinf: norm(vOut) - norm(vIn), dv: fb.dv, turn: fb.turn, turnMax: fb.turnMax })
      dvMismatch += fb.dv
    }
    const last = nodes.length - 1
    vinfArrival = norm(sub(legs[last - 1].v2, nodes[last].v))
    tof = nodes[last].t - nodes[0].t
  }
  return {
    mission: m, nodes, legs, flybys, vinfLaunch, c3: vinfLaunch * vinfLaunch, vinfArrival, tof,
    tStart: nodes[0]?.t ?? 0, tEnd: nodes[nodes.length - 1]?.t ?? 0, dvMismatch, error,
  }
}

/** Heliocentric state of the craft at time t on the reconstructed path; null before launch / after the last node. */
export function stateAt(rc: Recon, t: number): { r: Vec; v: Vec; leg: number } | null {
  if (rc.error || !rc.legs.length || t < rc.tStart || t > rc.tEnd) return null
  let k = rc.legs.findIndex((l) => t <= l.t2)
  if (k < 0) k = rc.legs.length - 1
  const l = rc.legs[k]
  const s = propagate(l.r1, l.v1, t - l.t1, MU_SUN)
  return { r: s.r, v: s.v, leg: k }
}

/** Sampled path (positions, times, leg index) for drawing. */
export function samplePath(rc: Recon, perLeg = 200) {
  const pts: Vec[] = [], ts: number[] = [], legIdx: number[] = []
  rc.legs.forEach((l, k) => {
    // spacing in time; revolving arcs need more points
    const n = perLeg * (1 + l.revs)
    for (let i = 0; i <= n; i++) {
      const dt = ((l.t2 - l.t1) * i) / n
      pts.push(i === 0 ? l.r1 : i === n ? l.r2 : propagate(l.r1, l.v1, dt, MU_SUN).r)
      ts.push(l.t1 + dt)
      legIdx.push(k)
    }
  })
  return { pts, ts, legIdx }
}

/** Where to draw an event marker: node → body position; event at a body → that body; otherwise on the path. null = nowhere. */
export function eventPosition(rc: Recon, ev: MissionEvent): Vec | null {
  const t = toJ2000(evMs(ev))
  const n = rc.nodes.find((x) => x.ev === ev)
  if (n) return n.r
  if (ev.body) return bodyState(ev.body, t).r
  return stateAt(rc, t)?.r ?? null
}

export const evT = (ev: MissionEvent) => toJ2000(evMs(ev))
export const legDays = (l: Leg) => (l.t2 - l.t1) / DAY
export const parkingRadius = RE + 200
