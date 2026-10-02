// Multiple-gravity-assist (MGA) trajectory search, EMTG-style but simplified:
// ballistic Lambert legs between bodies, powered flybys (no deep-space manoeuvres),
// global search with Differential Evolution per flyby sequence.
import {
  AU, BODIES, DAY, MU_SUN, RE, bodyState, captureDv, departDv, flybyDv, flybyGeometry, lambert, norm, propagate, sub,
  type BodyId, type Vec,
} from './astro.ts'

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
}
export interface FlightEvent {
  kind: 'launch' | 'flyby' | 'arrival'
  body: BodyId
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
export interface Leg { from: BodyId; to: BodyId; t1: number; t2: number; r1: Vec; v1: Vec; r2: Vec; v2: Vec }
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

export function evaluate(seq: BodyId[], epochs: number[], inp: MgaInput): Solution | null {
  const states = seq.map((b, i) => bodyState(b, epochs[i]))
  const legs: Leg[] = []
  for (let i = 0; i < seq.length - 1; i++) {
    const l = lambert(states[i].r, states[i + 1].r, epochs[i + 1] - epochs[i], MU_SUN)
    if (!l) return null
    legs.push({ from: seq[i], to: seq[i + 1], t1: epochs[i], t2: epochs[i + 1], r1: states[i].r, v1: l.v1, r2: states[i + 1].r, v2: l.v2 })
  }
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
  const last = seq.length - 1
  const vinfA = norm(sub(legs[last - 1].v2, states[last].v))
  events.push({ kind: 'arrival', body: seq[last], t: epochs[last], vinf: vinfA, dv: arrivalDv(vinfA, seq[last], inp), vHelioIn: norm(legs[last - 1].v2) })
  const dv = events.reduce((s, e) => s + e.dv, 0)
  const limitExcess = (inp.maxVinfDep ? Math.max(0, vinf0 - inp.maxVinfDep) : 0) + (inp.maxVinfArr ? Math.max(0, vinfA - inp.maxVinfArr) : 0)
  return {
    seq, legs, events, dv, tof: epochs[last] - epochs[0], tDep: epochs[0], tArr: epochs[last],
    feasible: dv <= inp.dvBudget && limitExcess === 0, limitExcess, tag: '',
    arrival: { kind: inp.arrival, body: seq[last], rp: BODIES[seq[last]].radius + inp.capAlt, e: inp.arrival === 'circle' ? 0 : inp.capEcc },
  }
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
  return must ? out.filter((q) => q.slice(1, -1).includes(must)) : out
}

export function tofBounds(a: BodyId, b: BodyId): [number, number] {
  const aT = ((BODIES[a].el[0] + BODIES[b].el[0]) / 2) * AU
  const th = Math.PI * Math.sqrt(aT ** 3 / MU_SUN)
  return [Math.max(20 * DAY, 0.12 * th), 1.6 * th]
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

/** Differential Evolution (rand/1/bin, dithered F) over [departure epoch?, leg TOFs]. */
export function optimize(seq: BodyId[], inp: MgaInput, goal: 'mindv' | 'fastest', seed = 1) {
  const lo: number[] = [], hi: number[] = []
  if (inp.mode === 'departure') { lo.push(inp.tRef); hi.push(inp.tRef + inp.windowDays * DAY) }
  for (let i = 0; i < seq.length - 1; i++) { const [a, b] = tofBounds(seq[i], seq[i + 1]); lo.push(a); hi.push(b) }
  const dim = lo.length
  const cost = (x: number[]) => {
    const s = evaluate(seq, epochsFrom(x, seq, inp), inp)
    if (!s) return 1e12
    // v∞ limits are soft constraints: a penalty steep enough that any compliant point beats a violating one,
    // yet still guiding the search towards the limit when none exists.
    const lim = s.limitExcess ? 20 + 50 * s.limitExcess : 0
    if (goal === 'mindv') return s.dv + lim
    return s.tof / DAY + (s.dv > inp.dvBudget ? 1e5 + 1e4 * (s.dv - inp.dvBudget) : 0) + (lim ? 1e5 + 1e4 * s.limitExcess! : 0)
  }
  const rnd = mulberry32(seed * 7919 + seq.length * 104729 + seq.join('').length)
  const np = Math.min(60, Math.max(30, 15 * dim)), gens = Math.min(400, 120 * dim)
  const pop = Array.from({ length: np }, () => lo.map((l, j) => l + rnd() * (hi[j] - l)))
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
        if (j !== jr && rnd() > 0.9) return x
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
  return evaluate(seq, epochsFrom(pop[best], seq, inp), inp)
}

export function runMga(inp: MgaInput, progress: (p: number, label: string) => void) {
  const seqs = sequences(inp)
  const passes = inp.mode === 'departure' && inp.objective === 'fastest' ? 2 : 1
  const total = seqs.length * passes
  let done = 0
  const solutions: Solution[] = []
  for (const seq of seqs) {
    const name = seq.map((b) => BODIES[b].name).join(' → ')
    progress(done / total, `Optimaliseren: ${name}`)
    const s = optimize(seq, inp, 'mindv')
    done++
    if (s) solutions.push({ ...s, tag: 'min Δv' })
    if (passes === 2) {
      progress(done / total, `Snelste route zoeken: ${name}`)
      const f = optimize(seq, inp, 'fastest', 2)
      done++
      if (f && f.feasible) solutions.push({ ...f, tag: 'snelst' })
    }
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
  return propagate(leg.r1, leg.v1, t - leg.t1, MU_SUN)
}
/** Heliocentric spacecraft position at time t along a solution. */
export const craftPosition = (s: Solution, t: number): Vec => craftState(s, t).r

/** Sampled path of every leg, with epochs, for drawing. */
export function samplePath(s: Solution, perLeg = 220) {
  const pts: Vec[] = [], ts: number[] = [], legIdx: number[] = []
  s.legs.forEach((l, k) => {
    for (let i = 0; i <= perLeg; i++) {
      const dt = ((l.t2 - l.t1) * i) / perLeg
      pts.push(i === 0 ? l.r1 : propagate(l.r1, l.v1, dt, MU_SUN).r)
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
