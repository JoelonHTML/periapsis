// Multiple-gravity-assist (MGA) trajectory search, EMTG-style but simplified:
// ballistic Lambert legs between bodies, powered flybys (no deep-space manoeuvres),
// global search with Differential Evolution per flyby sequence.
import {
  AU, BODIES, DAY, MU_SUN, RE, add, bodyState, captureDv, cross, departDv, dot, flybyDv, flybyGeometry, lambert, mul, norm, propagate, sub,
  type BodyId, type Vec,
} from './astro.ts'
import { lambertRev, lambertRevBranches, polishArc } from './lambert-rev.ts'

export type ArrivalKind = 'flyby' | 'ellipse' | 'circle'
export interface MgaInput {
  target: BodyId
  maxFlybys: number
  flybyBodies: BodyId[]
  mode: 'departure' | 'arrival'
  tRef: number // departure window start, or fixed arrival epoch (s since J2000)
  windowDays: number
  objective: 'mindv' | 'fastest'
  dvBudget: number
  parkAlt: number
  arrival: ArrivalKind
  capAlt: number
  capEcc: number
  /** Launcher limit on the departure excess speed v∞ (km/s). 0/undefined = no limit. */
  maxVinfDep?: number
  /** Limit on the arrival v∞ (km/s). 0/undefined = no limit. */
  maxVinfArr?: number
  /** Every route must use a gravity assist at this body (between Earth and the target). */
  mustVisit?: BodyId
  /** Advanced (all default OFF): allow legs with 0…maxRevs extra revolutions (both Lambert branches, cheapest kept). 0–2. */
  maxRevs?: number
  /** Advanced: allow the same body twice in a row (e.g. Earth → Earth legs of 1–3 years, needs multi-rev or a DSM). */
  allowResonant?: boolean
  /** Advanced: one impulsive deep-space manoeuvre per leg (MGA-1DSM, Izzo/pykep style). */
  dsm?: boolean
}
export interface FlightEvent {
  kind: 'launch' | 'flyby' | 'arrival' | 'dsm'
  /** For 'dsm' the body the leg departs from. */
  body: BodyId
  /** Heliocentric position (km), only set for 'dsm' events. */
  pos?: Vec
  t: number
  dv: number
  vinf: number
  vinfIn?: Vec
  vinfOut?: Vec
  turn?: number
  turnMax?: number
  vHelioIn?: number
  vHelioOut?: number
}
/** v1 = heliocentric velocity right after the departure body, v2 = right before the arrival body. With a deep-space manoeuvre the
 *  craft flies r1,v1 up to dsm.t, then dsm.r with dsm.vOut (a second Kepler arc) to r2,v2. */
export interface Leg {
  from: BodyId; to: BodyId; t1: number; t2: number; r1: Vec; v1: Vec; r2: Vec; v2: Vec
  /** extra full revolutions of a multi-rev Lambert arc (the arc after the DSM when there is one) */
  revs?: number
  dsm?: { t: number; r: Vec; vIn: Vec; vOut: Vec }
}
/** Heliocentric state on a leg at time t (t1 <= t <= t2), honouring a deep-space manoeuvre. */
export function legState(l: Leg, t: number): { r: Vec; v: Vec } {
  if (l.dsm && t > l.dsm.t) return propagate(l.dsm.r, l.dsm.vOut, t - l.dsm.t, MU_SUN)
  return propagate(l.r1, l.v1, t - l.t1, MU_SUN)
}
/** Heliocentric position of event k (events may contain 'dsm' entries between the leg endpoints). */
export function eventPosition(sol: Solution, k: number): Vec {
  const e = sol.events[k]
  if (e.kind === 'dsm' && e.pos) return e.pos
  let j = 0
  for (let i = 0; i < k; i++) if (sol.events[i].kind !== 'dsm') j++
  return j === 0 ? sol.legs[0].r1 : sol.legs[j - 1].r2
}
export interface Solution {
  seq: BodyId[]
  legs: Leg[]
  events: FlightEvent[]
  dv: number
  tof: number
  tDep: number
  tArr: number
  /** Within the Δv budget AND the v∞ limits. */
  feasible: boolean
  /** km/s by which the v∞ limits are exceeded (summed); 0 = limits respected. */
  limitExcess?: number
  tag: string
  /** Orbit the craft ends up in after the last event (rp = periapsis radius in km from the body's centre). */
  arrival: { kind: ArrivalKind; body: BodyId; rp: number; e: number }
}

export function arrivalDv(vinf: number, body: BodyId, inp: Pick<MgaInput, 'arrival' | 'capAlt' | 'capEcc'>) {
  if (inp.arrival === 'flyby') return 0
  const b = BODIES[body]
  return captureDv(vinf, b.radius + inp.capAlt, b.mu, inp.arrival === 'circle' ? 0 : inp.capEcc)
}

const advRevs = (inp: MgaInput) => Math.max(0, Math.min(2, Math.round(inp.maxRevs ?? 0)))

interface Cand { v1: Vec; v2: Vec; revs: number }
/** Lambert candidates for one leg. Default (no advanced option, different bodies) is exactly the app's own single-rev `lambert`. */
function legCands(r1: Vec, r2: Vec, T: number, same: boolean, maxRevs: number, polish: boolean): Cand[] {
  const out: Cand[] = []
  const fin = (l: { v1: Vec; v2: Vec } | null) => (polish ? polishArc(r1, r2, T, MU_SUN, l) : l)
  const l0 = same || maxRevs > 0 ? lambertRev(r1, r2, T, MU_SUN, 0) : lambert(r1, r2, T, MU_SUN)
  const p0 = l0 && fin(l0)
  if (p0) out.push({ ...p0, revs: 0 })
  for (let n = 1; n <= maxRevs; n++) {
    const br = lambertRevBranches(r1, r2, T, MU_SUN, n)
    for (const l of [br.lo, br.hi]) {
      const q = l && fin(l)
      if (q) out.push({ ...q, revs: n })
    }
  }
  return out
}

const limitPenalty = (vinf0: number, vinfA: number, inp: MgaInput) =>
  (inp.maxVinfDep ? Math.max(0, vinf0 - inp.maxVinfDep) : 0) + (inp.maxVinfArr ? Math.max(0, vinfA - inp.maxVinfArr) : 0)

function finish(seq: BodyId[], epochs: number[], legs: Leg[], events: FlightEvent[], vinf0: number, vinfA: number, inp: MgaInput): Solution {
  const last = seq.length - 1
  const dv = events.reduce((s, e) => s + e.dv, 0)
  const limitExcess = limitPenalty(vinf0, vinfA, inp)
  return {
    seq, legs, events, dv, tof: epochs[last] - epochs[0], tDep: epochs[0], tArr: epochs[last],
    feasible: dv <= inp.dvBudget && limitExcess === 0, limitExcess, tag: '',
    arrival: { kind: inp.arrival, body: seq[last], rp: BODIES[seq[last]].radius + inp.capAlt, e: inp.arrival === 'circle' ? 0 : inp.capEcc },
  }
}

/** Ballistic legs (optionally multi-rev / resonant); flybys may be powered. `polish` = differential-correct the Lambert arcs (final answer only). */
export function evaluate(seq: BodyId[], epochs: number[], inp: MgaInput, polish = false): Solution | null {
  const states = seq.map((b, i) => bodyState(b, epochs[i]))
  const nL = seq.length - 1, maxRevs = advRevs(inp)
  const cands: Cand[][] = []
  for (let i = 0; i < nL; i++) {
    const c = legCands(states[i].r, states[i + 1].r, epochs[i + 1] - epochs[i], seq[i] === seq[i + 1], maxRevs, polish)
    if (!c.length) return null
    cands.push(c)
  }
  const fbAt = (i: number, a: Cand, b: Cand) => {
    const bd = BODIES[seq[i]]
    return flybyDv(sub(a.v2, states[i].v), sub(b.v1, states[i].v), bd.mu, bd.radius * bd.safe).dv
  }
  const dep = (c: Cand) => { const v = norm(sub(c.v1, states[0].v)); return departDv(v, RE + inp.parkAlt) + 50 * limitPenalty(v, 0, inp) }
  const arr = (c: Cand) => { const v = norm(sub(c.v2, states[nL].v)); return arrivalDv(v, seq[nL], inp) + 50 * limitPenalty(0, v, inp) }
  // cheapest combination of revolution counts / branches over all legs (Viterbi over the legs, exact for the sum of event Δv)
  let pick: number[]
  if (cands.every((c) => c.length === 1)) pick = cands.map(() => 0)
  else {
    let cost = cands[0].map(dep)
    const back: number[][] = []
    for (let i = 1; i < nL; i++) {
      const nc: number[] = [], bk: number[] = []
      cands[i].forEach((b) => {
        let best = Infinity, bj = 0
        cands[i - 1].forEach((a, j) => { const c = cost[j] + fbAt(i, a, b); if (c < best) { best = c; bj = j } })
        nc.push(best); bk.push(bj)
      })
      cost = nc; back.push(bk)
    }
    cost = cost.map((c, k) => c + arr(cands[nL - 1][k]))
    let k = 0
    for (let j = 1; j < cost.length; j++) if (cost[j] < cost[k]) k = j
    pick = new Array(nL).fill(0)
    pick[nL - 1] = k
    for (let i = nL - 1; i >= 1; i--) pick[i - 1] = back[i - 1][pick[i]]
  }
  const ch = cands.map((c, i) => c[pick[i]])
  const legs: Leg[] = ch.map((c, i) => ({
    from: seq[i], to: seq[i + 1], t1: epochs[i], t2: epochs[i + 1], r1: states[i].r, v1: c.v1, r2: states[i + 1].r, v2: c.v2,
    ...(c.revs ? { revs: c.revs } : {}),
  }))
  const events: FlightEvent[] = []
  const vinf0 = norm(sub(legs[0].v1, states[0].v))
  events.push({ kind: 'launch', body: seq[0], t: epochs[0], vinf: vinf0, dv: departDv(vinf0, RE + inp.parkAlt), vHelioOut: norm(legs[0].v1) })
  for (let i = 1; i < seq.length - 1; i++) {
    const b = BODIES[seq[i]]
    const vinfIn = sub(legs[i - 1].v2, states[i].v), vinfOut = sub(legs[i].v1, states[i].v)
    const fb = flybyDv(vinfIn, vinfOut, b.mu, b.radius * b.safe)
    events.push({
      kind: 'flyby', body: seq[i], t: epochs[i], dv: fb.dv, vinf: norm(vinfIn), vinfIn, vinfOut,
      turn: fb.turn, turnMax: fb.turnMax, vHelioIn: norm(legs[i - 1].v2), vHelioOut: norm(legs[i].v1),
    })
  }
  const vinfA = norm(sub(legs[nL - 1].v2, states[nL].v))
  events.push({ kind: 'arrival', body: seq[nL], t: epochs[nL], vinf: vinfA, dv: arrivalDv(vinfA, seq[nL], inp), vHelioIn: norm(legs[nL - 1].v2) })
  return finish(seq, epochs, legs, events, vinf0, vinfA, inp)
}

// ---------- MGA-1DSM (one impulsive deep-space manoeuvre per leg) ----------
/** Extra decision variables: leg 0 → [|v∞|, u, v, η]; later legs → [ρ, β, η]. */
export const dsmVarCount = (nLegs: number) => 4 + 3 * (nLegs - 1)
const ETA_LO = 0.02, ETA_HI = 0.98
const RP_SPAN = Math.log(300) // flyby periapsis between rpMin and 300·rpMin (log scale)

/** Turn the incoming v∞ vector by the (unpowered) turn angle of a hyperbola with periapsis rp, rotated by azimuth β about v̂in. */
function perpBasis(u: Vec): [Vec, Vec] {
  const ref: Vec = Math.abs(u[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0]
  const e1c = cross(u, ref), e1 = mul(e1c, 1 / norm(e1c))
  return [e1, cross(u, e1)]
}
function bendVinf(vIn: Vec, rho: number, beta: number, mu: number, rpMin: number): Vec {
  const v = norm(vIn), rp = rpMin * Math.exp(rho * RP_SPAN)
  const delta = 2 * Math.asin(1 / (1 + (rp * v * v) / mu))
  const u = mul(vIn, 1 / v)
  const [e1, e2] = perpBasis(u)
  const perp = add(mul(e1, Math.cos(beta)), mul(e2, Math.sin(beta)))
  return mul(add(mul(u, Math.cos(delta)), mul(perp, Math.sin(delta))), v)
}

/** Evaluate a sequence with one DSM per leg. `dx` = the dsmVarCount() extra variables (see above). Flybys are unpowered by construction
 *  (|v∞| conserved, turn ≤ what the planet can deliver at its minimum periapsis); every Δv is the launch, the DSMs and the capture. */
export function evaluateDsm(seq: BodyId[], epochs: number[], dx: number[], inp: MgaInput, polish = false): Solution | null {
  const states = seq.map((b, i) => bodyState(b, epochs[i]))
  const nL = seq.length - 1, maxRevs = advRevs(inp)
  const legs: Leg[] = [], events: FlightEvent[] = []
  let vinf0 = 0, vPrevIn: Vec = [0, 0, 0], k = 0
  for (let i = 0; i < nL; i++) {
    const T = epochs[i + 1] - epochs[i], st = states[i]
    let vinfOut: Vec
    if (i === 0) {
      const [mag, u, w] = dx, th = 2 * Math.PI * u, sz = 2 * w - 1, cz = Math.sqrt(Math.max(0, 1 - sz * sz))
      vinfOut = [mag * cz * Math.cos(th), mag * cz * Math.sin(th), mag * sz]
      k = 3
    } else {
      const b = BODIES[seq[i]]
      vinfOut = bendVinf(sub(vPrevIn, st.v), dx[k], dx[k + 1], b.mu, b.radius * b.safe)
      k += 2
    }
    const eta = ETA_LO + dx[k++] * (ETA_HI - ETA_LO)
    const v1 = add(st.v, vinfOut)
    const tD = epochs[i] + eta * T
    const a = propagate(st.r, v1, eta * T, MU_SUN)
    const cs = legCands(a.r, states[i + 1].r, (1 - eta) * T, false, maxRevs, polish)
    if (!cs.length) return null
    // keep the cheapest second arc: DSM Δv (+ the capture burn on the last leg)
    let best = cs[0], bc = Infinity
    for (const c of cs) {
      const d = norm(sub(c.v1, a.v))
      const c2 = d + (i === nL - 1 ? arrivalDv(norm(sub(c.v2, states[nL].v)), seq[nL], inp) : 0)
      if (c2 < bc) { bc = c2; best = c }
    }
    const dvDsm = norm(sub(best.v1, a.v))
    if (!isFinite(dvDsm)) return null
    legs.push({
      from: seq[i], to: seq[i + 1], t1: epochs[i], t2: epochs[i + 1], r1: st.r, v1, r2: states[i + 1].r, v2: best.v2,
      ...(best.revs ? { revs: best.revs } : {}), dsm: { t: tD, r: a.r, vIn: a.v, vOut: best.v1 },
    })
    if (i === 0) {
      vinf0 = norm(vinfOut)
      events.push({ kind: 'launch', body: seq[0], t: epochs[0], vinf: vinf0, dv: departDv(vinf0, RE + inp.parkAlt), vHelioOut: norm(v1) })
    } else {
      const b = BODIES[seq[i]], vinfIn = sub(vPrevIn, st.v), fb = flybyDv(vinfIn, vinfOut, b.mu, b.radius * b.safe)
      events.push({
        kind: 'flyby', body: seq[i], t: epochs[i], dv: fb.dv, vinf: norm(vinfIn), vinfIn, vinfOut,
        turn: fb.turn, turnMax: fb.turnMax, vHelioIn: norm(vPrevIn), vHelioOut: norm(v1),
      })
    }
    events.push({ kind: 'dsm', body: seq[i], t: tD, dv: dvDsm, vinf: 0, pos: a.r, vHelioIn: norm(a.v), vHelioOut: norm(best.v1) })
    vPrevIn = best.v2
  }
  const vinfA = norm(sub(vPrevIn, states[nL].v))
  events.push({ kind: 'arrival', body: seq[nL], t: epochs[nL], vinf: vinfA, dv: arrivalDv(vinfA, seq[nL], inp), vHelioIn: norm(vPrevIn) })
  return finish(seq, epochs, legs, events, vinf0, vinfA, inp)
}

/** Number of gravity assists needed to honour `mustVisit` (Earth itself needs Earth → X → Earth → target). */
const minFlybys = (inp: MgaInput) => (!inp.mustVisit || inp.mustVisit === inp.target ? 0 : inp.mustVisit === 'earth' ? 2 : 1)

/** Plausible flyby sequences Earth → [≤2 flybys] → target (0-rev Lambert cannot do same-body legs).
 *  With `mustVisit` every sequence contains that body; the flyby count is raised when needed (cap 2). */
export function sequences(inp: MgaInput): BodyId[][] {
  const aT = BODIES[inp.target].el[0]
  const lo = Math.min(1, aT) / 1.7, hi = Math.max(1, aT) * 1.7
  const must = inp.mustVisit && inp.mustVisit !== inp.target ? inp.mustVisit : undefined
  const n = Math.min(2, Math.max(inp.maxFlybys, minFlybys(inp)))
  const c = inp.flybyBodies.filter((b) => b !== inp.target && BODIES[b].el[0] >= lo && BODIES[b].el[0] <= hi)
  if (must && !c.includes(must)) c.push(must) // forced body is allowed even outside the usual range
  const out: BodyId[][] = []
  out.push(['earth', inp.target]) // dropped below when a flyby is forced
  if (n >= 1) for (const b of c) if (b !== 'earth') out.push(['earth', b, inp.target])
  if (n >= 2)
    for (const b1 of c) for (const b2 of c) if (b1 !== 'earth' && b1 !== b2) out.push(['earth', b1, b2, inp.target])
  if (inp.allowResonant) {
    // Extra sequences with exactly one same-body repeat (Earth → Earth, Venus → Venus …), up to 3 flybys.
    const nR = Math.min(3, Math.max(inp.maxFlybys, minFlybys(inp)))
    const pool = c.includes('earth') ? c : ['earth' as BodyId, ...c]
    const walk = (q: BodyId[], dup: number) => {
      if (q.length >= 2 && dup === 1) out.push([...q, inp.target])
      if (q.length - 1 >= nR) return
      for (const b of pool) {
        if (b === inp.target) continue
        const d = b === q[q.length - 1] ? 1 : 0
        if (dup + d <= 1) walk([...q, b], dup + d)
      }
    }
    walk(['earth'], 0)
  }
  return must ? out.filter((q) => q.slice(1, -1).includes(must)) : out
}

export function tofBounds(a: BodyId, b: BodyId, maxRevs = 0): [number, number] {
  if (a === b) { // resonant leg: roughly 0.9 … 3.1 orbital periods of the body (Earth: 1 … 3 years)
    const P = 2 * Math.PI * Math.sqrt((BODIES[a].el[0] * AU) ** 3 / MU_SUN)
    return [0.9 * P, 3.1 * P]
  }
  const aT = ((BODIES[a].el[0] + BODIES[b].el[0]) / 2) * AU
  const th = Math.PI * Math.sqrt(aT ** 3 / MU_SUN)
  return [Math.max(20 * DAY, 0.12 * th), 1.6 * th * (1 + 0.5 * maxRevs)]
}

function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function epochsFrom(x: number[], seq: BodyId[], inp: MgaInput) {
  const n = seq.length - 1
  if (inp.mode === 'departure') {
    const ep = [x[0]]
    for (let i = 0; i < n; i++) ep.push(ep[i] + x[i + 1])
    return ep
  }
  const ep = new Array<number>(n + 1)
  ep[n] = inp.tRef
  for (let i = n - 1; i >= 0; i--) ep[i] = ep[i + 1] - x[i]
  return ep
}

/** Differential-evolution budget. Defaults reproduce the original search; advanced options use a capped budget (phone-friendly). */
export interface DeBudget { np?: number; gens?: number; cr?: number }

/** Differential Evolution (rand/1/bin, dithered F) over [departure epoch?, leg TOFs, (DSM variables)].
 *  With `inp.dsm` the MGA-1DSM model is searched as well and the cheaper of {with DSM, ballistic} is returned,
 *  so enabling DSMs can never make a route worse (a DSM of Δv ≈ 0 is the ballistic leg). */
/** Express a ballistic/powered-flyby solution in the DSM variables: the first leg is reproduced exactly (DSM Δv ≈ 0 at any η);
 *  later legs get the closest unpowered flyby (same turn direction, turn clipped to what the planet can give). */
function dsmSeed(sol: Solution, seq: BodyId[], inp: MgaInput, lo: number[], hi: number[], eta: number): number[] {
  const x: number[] = []
  if (inp.mode === 'departure') x.push(sol.tDep)
  for (const l of sol.legs) x.push(l.t2 - l.t1)
  const clamp = (v: number, j: number) => Math.max(lo[j], Math.min(hi[j], v))
  const e = (eta - ETA_LO) / (ETA_HI - ETA_LO)
  const v0 = sub(sol.legs[0].v1, bodyState(seq[0], sol.legs[0].t1).v), m0 = norm(v0)
  x.push(m0, ((Math.atan2(v0[1], v0[0]) / (2 * Math.PI)) + 1) % 1, (v0[2] / m0 + 1) / 2, e)
  for (let i = 1; i < sol.legs.length; i++) {
    const b = BODIES[seq[i]], vb = bodyState(seq[i], sol.legs[i].t1).v
    const vin = sub(sol.legs[i - 1].v2, vb), vout = sub(sol.legs[i].v1, vb)
    const vi = norm(vin), u = mul(vin, 1 / vi)
    const delta = Math.acos(Math.max(-1, Math.min(1, dot(u, vout) / norm(vout))))
    const rp = (1 / Math.sin(Math.max(1e-6, delta) / 2) - 1) * b.mu / (vi * vi)
    const rho = Math.max(0, Math.min(1, Math.log(Math.max(rp, 1e-9) / (b.radius * b.safe)) / RP_SPAN))
    const [e1, e2] = perpBasis(u)
    const beta = (Math.atan2(dot(vout, e2), dot(vout, e1)) + 2 * Math.PI) % (2 * Math.PI)
    x.push(rho, beta, e)
  }
  return x.map(clamp)
}

export function optimize(seq: BodyId[], inp: MgaInput, goal: 'mindv' | 'fastest', seed = 1, budget: DeBudget = {}): Solution | null {
  if (!inp.dsm) return optimizeCore(seq, inp, goal, seed, budget)
  return refineDsm(seq, inp, goal, seed, budget, optimize(seq, { ...inp, dsm: false }, goal, seed, budget))
}

/** Search the MGA-1DSM model (warm-started from the ballistic solution `plain`) and return the cheaper of the two. */
export function refineDsm(seq: BodyId[], inp: MgaInput, goal: 'mindv' | 'fastest', seed: number, budget: DeBudget, plain: Solution | null): Solution | null {
  const withDsm = optimizeCore(seq, { ...inp, dsm: true }, goal, seed, budget, plain)
  if (!plain) return withDsm
  if (!withDsm) return plain
  return score(withDsm, inp, goal) < score(plain, inp, goal) ? withDsm : plain
}

function score(s: Solution, inp: MgaInput, goal: 'mindv' | 'fastest') {
  const lim = s.limitExcess ? 20 + 50 * s.limitExcess : 0
  if (goal === 'mindv') return s.dv + lim
  return s.tof / DAY + (s.dv > inp.dvBudget ? 1e5 + 1e4 * (s.dv - inp.dvBudget) : 0) + (lim ? 1e5 + 1e4 * s.limitExcess! : 0)
}

function optimizeCore(seq: BodyId[], inp: MgaInput, goal: 'mindv' | 'fastest', seed: number, budget: DeBudget, seedSol?: Solution | null): Solution | null {
  const lo: number[] = [], hi: number[] = []
  const nL = seq.length - 1, revs = advRevs(inp)
  if (inp.mode === 'departure') { lo.push(inp.tRef); hi.push(inp.tRef + inp.windowDays * DAY) }
  for (let i = 0; i < nL; i++) { const [a, b] = tofBounds(seq[i], seq[i + 1], revs); lo.push(a); hi.push(b) }
  const nT = lo.length
  if (inp.dsm) {
    // |v∞| of the first leg: up to ~1.8× the Hohmann excess towards the first body (+2), clamped to a launcher-realistic 3–14 km/s
    const aA = BODIES[seq[0]].el[0], aB = BODIES[seq[1]].el[0]
    const vh = Math.abs(Math.sqrt(MU_SUN / (aA * AU)) * (Math.sqrt((2 * aB) / (aA + aB)) - 1))
    const vmax = Math.max(3, Math.min(14, 1.8 * vh + 2))
    lo.push(0.05, 0, 0, 0); hi.push(inp.maxVinfDep ? Math.min(vmax, inp.maxVinfDep) : vmax, 1, 1, 1)
    for (let i = 1; i < nL; i++) { lo.push(0, 0, 0); hi.push(1, 2 * Math.PI, 1) }
  }
  const dim = lo.length
  const build = (x: number[], polish = false) => {
    const ep = epochsFrom(x, seq, inp)
    return inp.dsm ? evaluateDsm(seq, ep, x.slice(nT), inp, polish) : evaluate(seq, ep, inp, polish)
  }
  const cost = (x: number[]) => {
    const s = build(x)
    if (!s) return 1e12
    // v∞ limits are soft constraints: a penalty steep enough that any compliant point beats a violating one,
    // yet still guiding the search towards the limit when none exists.
    return score(s, inp, goal)
  }
  const rnd = mulberry32(seed * 7919 + seq.length * 104729 + seq.join('').length)
  const np = budget.np ?? Math.min(60, Math.max(30, 15 * dim)), gens = budget.gens ?? Math.min(400, 120 * dim)
  const CR = budget.cr ?? 0.9
  const pop = Array.from({ length: np }, () => lo.map((l, j) => l + rnd() * (hi[j] - l)))
  if (inp.dsm && seedSol && seedSol.legs.length === nL) {
    // warm start: the best ballistic solution, re-expressed with the DSM at a few positions along each leg
    ;[0.5, 0.15, 0.85, 0.3, 0.7].forEach((eta, k) => { if (k < np) pop[k] = dsmSeed(seedSol, seq, inp, lo, hi, eta) })
    // …and a cloud of small perturbations of it (a random DSM position per leg); the rest of the population stays uniform
    const base0 = dsmSeed(seedSol, seq, inp, lo, hi, 0.5)
    for (let k = 5; k < Math.floor(np / 2); k++)
      pop[k] = base0.map((v, j) => Math.max(lo[j], Math.min(hi[j], v + (rnd() - 0.5) * 0.1 * (hi[j] - lo[j]))))
  }
  const fit = pop.map(cost)
  for (let g = 0; g < gens; g++) {
    const F = 0.5 + rnd() * 0.5
    for (let i = 0; i < np; i++) {
      let a, b, c
      do a = (rnd() * np) | 0; while (a === i)
      do b = (rnd() * np) | 0; while (b === i || b === a)
      do c = (rnd() * np) | 0; while (c === i || c === a || c === b)
      const jr = (rnd() * dim) | 0
      const trial = pop[i].map((x, j) => {
        if (j !== jr && rnd() > CR) return x
        const v = pop[a][j] + F * (pop[b][j] - pop[c][j])
        if (v < lo[j]) return lo[j] + rnd() * (x - lo[j])
        if (v > hi[j]) return hi[j] - rnd() * (hi[j] - x)
        return v
      })
      const ft = cost(trial)
      if (ft <= fit[i]) { pop[i] = trial; fit[i] = ft }
    }
  }
  let best = 0
  for (let i = 1; i < np; i++) if (fit[i] < fit[best]) best = i
  // Advanced models have narrow valleys (resonance windows, DSM geometry): finish with a local pattern search around the DE winner.
  const advanced = revs > 0 || !!inp.dsm || seq.some((b, i) => i > 0 && b === seq[i - 1])
  if (advanced) pop[best] = patternSearch(pop[best], fit[best], cost, lo, hi, 60 * dim)
  // multi-rev / resonant / DSM arcs are re-solved with differential correction so that the stored legs close to metres
  return build(pop[best], advanced) ?? build(pop[best])
}

/** Coordinate pattern search (compass search): step = 2% of each variable's range, halved whenever a sweep brings no improvement. */
function patternSearch(x0: number[], f0: number, cost: (x: number[]) => number, lo: number[], hi: number[], maxEvals: number) {
  let x = x0, f = f0, n = 0
  const step = lo.map((l, j) => 0.02 * (hi[j] - l))
  const tiny = lo.map((l, j) => 1e-7 * (hi[j] - l))
  while (n < maxEvals && step.some((st, j) => st > tiny[j])) {
    let improved = false
    for (let j = 0; j < x.length && n < maxEvals; j++)
      for (const sgn of [1, -1]) {
        const t = x.slice()
        t[j] = Math.max(lo[j], Math.min(hi[j], x[j] + sgn * step[j]))
        if (t[j] === x[j]) continue
        const ft = cost(t)
        n++
        if (ft < f) { x = t; f = ft; improved = true; break }
      }
    if (!improved) for (let j = 0; j < step.length; j++) step[j] *= 0.5
  }
  return x
}

const nVars = (inp: MgaInput, seq: BodyId[]) => seq.length - (inp.mode === 'departure' ? 0 : 1)
/** DE budget with multi-rev legs: capped so a phone finishes in reasonable time (no advanced option = the original budget). */
export function advancedBudget(inp: MgaInput, seq: BodyId[]): DeBudget {
  if (!advRevs(inp)) return {}
  const dim = nVars(inp, seq)
  return { np: Math.min(60, Math.max(30, 15 * dim)), gens: Math.min(300, 100 * dim) }
}
/** DE budget of the DSM search (13–16 variables for 3–4 legs). */
export function dsmBudget(inp: MgaInput, seq: BodyId[]): DeBudget {
  const dim = nVars(inp, seq) + dsmVarCount(seq.length - 1)
  return { np: Math.min(60, Math.max(32, 4 * dim)), gens: Math.min(500, 35 * dim) }
}
/** With DSMs only the best few ballistic routes are refined (the DSM search is ~10× more expensive per route). */
export const DSM_TOP = 3

export function runMga(inp: MgaInput, progress: (p: number, label: string) => void) {
  const seqs = sequences(inp)
  const passes = inp.mode === 'departure' && inp.objective === 'fastest' ? 2 : 1
  const nDsm = inp.dsm ? Math.min(DSM_TOP, seqs.length) : 0
  const total = (seqs.length + nDsm) * passes
  let done = 0
  type Entry = { seq: BodyId[]; s: Solution | null; f: Solution | null }
  const entries: Entry[] = []
  const nameOf = (seq: BodyId[]) => seq.map((b) => BODIES[b].name).join(' → ')
  for (const seq of seqs) {
    const name = nameOf(seq)
    progress(done / total, `Optimaliseren: ${name}`)
    const bud = advancedBudget(inp, seq)
    const base = { ...inp, dsm: false }
    const s = optimize(seq, base, 'mindv', 1, bud)
    done++
    let f: Solution | null = null
    if (passes === 2) {
      progress(done / total, `Snelste route zoeken: ${name}`)
      f = optimize(seq, base, 'fastest', 2, bud)
      done++
    }
    entries.push({ seq, s, f })
  }
  if (nDsm) {
    const rank = [...entries].filter((e) => e.s).sort((a, b) => a.s!.dv - b.s!.dv).slice(0, nDsm)
    for (const e of rank) {
      const name = nameOf(e.seq), bud = dsmBudget(inp, e.seq)
      progress(done / total, `Manoeuvre in de ruimte zoeken: ${name}`)
      e.s = refineDsm(e.seq, inp, 'mindv', 1, bud, e.s)
      done++
      if (passes === 2) {
        progress(done / total, `Snelste route + manoeuvre: ${name}`)
        e.f = refineDsm(e.seq, inp, 'fastest', 2, bud, e.f)
        done++
      }
    }
  }
  const solutions: Solution[] = []
  for (const e of entries) {
    if (e.s) solutions.push({ ...e.s, tag: 'min Δv' })
    if (e.f && e.f.feasible) solutions.push({ ...e.f, tag: 'snelst' })
  }
  solutions.sort((a, b) =>
    inp.objective === 'fastest' && inp.mode === 'departure'
      ? Number(b.feasible) - Number(a.feasible) || a.tof - b.tof
      : a.dv - b.dv,
  )
  progress(1, 'Klaar')
  return { solutions }
}

/** Heliocentric state of the craft at time t (before launch / after arrival it sits on the body). */
export function craftState(s: Solution, t: number): { r: Vec; v: Vec } {
  if (t <= s.tDep) return bodyState(s.seq[0], t)
  if (t >= s.tArr) return bodyState(s.seq[s.seq.length - 1], t)
  const leg = s.legs.find((l) => t <= l.t2) ?? s.legs[s.legs.length - 1]
  return legState(leg, t)
}
/** Heliocentric spacecraft position at time t along a solution. */
export const craftPosition = (s: Solution, t: number): Vec => craftState(s, t).r

/** Sampled path of every leg, with epochs, for drawing. */
export function samplePath(s: Solution, perLeg = 220) {
  const pts: Vec[] = [], ts: number[] = [], legIdx: number[] = []
  s.legs.forEach((l, k) => {
    for (let i = 0; i <= perLeg; i++) {
      const dt = ((l.t2 - l.t1) * i) / perLeg
      pts.push(i === 0 ? l.r1 : legState(l, l.t1 + dt).r)
      ts.push(l.t1 + dt)
      legIdx.push(k)
    }
  })
  return { pts, ts, legIdx }
}

/** Close-up window of flyby k: hyperbola geometry, drawing radius and half-duration (s). */
export function flybyWindow(sol: Solution, k: number) {
  const ev = sol.events[k], b = BODIES[ev.body]
  const g = flybyGeometry(ev.vinfIn!, ev.vinfOut!, b.mu, b.radius * b.safe)
  const rMax = Math.min(150 * b.radius, Math.max(30 * b.radius, 6 * g.rp))
  return { g, rMax, tWin: g.timeAt(rMax) }
}
