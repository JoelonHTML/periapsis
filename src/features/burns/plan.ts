// Pure logic of the manoeuvre planner: burn builders, route import, propellant chain, persistence, timeline scale.
// Units: km, s, km/s (Δv is stored in km/s everywhere; the UI shows m/s), kg, N, J2000 seconds for times.
import { MU_EARTH, MU_MOON, RE, R_MOON, BODIES, dvBudget, propellantFor } from '../../lib/astro.ts'
import { G0_MS, combinedChange, ellipseFromRadii, hohmannFull, orbitPeriod, planeChange, semiMajorFromPeriod, vCirc } from '../../lib/calc.ts'
import type { FlightEvent } from '../../lib/mga.ts'

export type CentralId = 'earth' | 'moon' | 'mars'
export const CENTRAL_IDS: CentralId[] = ['earth', 'moon', 'mars']
export const centralOf = (id: CentralId) =>
  id === 'earth' ? { mu: MU_EARTH, radius: RE } : id === 'moon' ? { mu: MU_MOON, radius: R_MOON } : { mu: BODIES.mars.mu, radius: BODIES.mars.radius }

export type Dir = 'prograde' | 'retrograde' | 'normal' | 'radial'
export const DIRS: Dir[] = ['prograde', 'retrograde', 'normal', 'radial']

export interface Burn {
  id: string
  name: string
  t: number // J2000 seconds
  dv: number // km/s
  dir: Dir | null
  body: CentralId | null
  period: number | null // s, period of the orbit the burn is performed on (for the finite-burn check); null when unknown
  src: 'user' | 'route'
}
export interface Plan { burns: Burn[]; thrust: number | null }
export const emptyPlan = (): Plan => ({ burns: [], thrust: null })

// ---------- Burn builders ----------
export type Spec =
  | { type: 'hohmann'; body: CentralId; alt1: number; alt2: number }
  | { type: 'circ'; body: CentralId; rpAlt: number; raAlt: number; at: 'apo' | 'peri' }
  | { type: 'plane'; body: CentralId; alt: number; di: number }
  | { type: 'combined'; body: CentralId; alt1: number; alt2: number; di: number }
  | { type: 'phasing'; body: CentralId; alt: number; phase: number; revs: number }
  | { type: 'custom'; body: CentralId; dvMs: number; dir: Dir }

/** A burn before it gets an id and a stored name; the UI translates nameKey with nameVars. */
export interface Draft { nameKey: string; vars: Record<string, string | number>; dt: number; dv: number; dir: Dir | null; period: number | null }
export type Built = { ok: true; drafts: Draft[]; notes: string[] } | { ok: false; error: string }

const fin = (...x: number[]) => x.every((v) => Number.isFinite(v))
const km = (x: number) => Math.round(x).toLocaleString('en-US').replace(/,/g, ' ')

export function buildBurns(s: Spec): Built {
  const c = centralOf(s.body)
  const R = (alt: number) => c.radius + alt
  const bad = (error: string): Built => ({ ok: false, error })
  const notes: string[] = []
  switch (s.type) {
    case 'hohmann': {
      if (!fin(s.alt1, s.alt2) || s.alt1 <= 0 || s.alt2 <= 0) return bad('burn.err.alt')
      if (s.alt1 === s.alt2) return bad('burn.err.same')
      const r1 = R(s.alt1), r2 = R(s.alt2), h = hohmannFull(c.mu, r1, r2), up = r2 > r1
      const dir: Dir = up ? 'prograde' : 'retrograde'
      const v = { a: km(s.alt1), b: km(s.alt2) }
      return { ok: true, notes, drafts: [
        { nameKey: 'burn.n.hohmann1', vars: v, dt: 0, dv: h.dv1, dir, period: h.T1 },
        { nameKey: 'burn.n.hohmann2', vars: v, dt: h.tof, dv: h.dv2, dir, period: orbitPeriod(c.mu, h.a) },
      ] }
    }
    case 'circ': {
      if (!fin(s.rpAlt, s.raAlt) || s.rpAlt <= 0 || s.raAlt <= 0) return bad('burn.err.alt')
      const lo = Math.min(s.rpAlt, s.raAlt), hi = Math.max(s.rpAlt, s.raAlt)
      const e = ellipseFromRadii(c.mu, R(lo), R(hi))
      if (lo === hi) return bad('burn.err.circular')
      const atApo = s.at === 'apo'
      const dv = atApo ? Math.abs(vCirc(c.mu, R(hi)) - e.va) : Math.abs(e.vp - vCirc(c.mu, R(lo)))
      return { ok: true, notes, drafts: [{ nameKey: atApo ? 'burn.n.circApo' : 'burn.n.circPeri', vars: { a: km(atApo ? hi : lo) }, dt: 0, dv, dir: atApo ? 'prograde' : 'retrograde', period: e.T }] }
    }
    case 'plane': {
      if (!fin(s.alt, s.di) || s.alt <= 0) return bad('burn.err.alt')
      if (!(s.di > 0) || s.di > 180) return bad('burn.err.inc')
      const r = R(s.alt)
      return { ok: true, notes, drafts: [{ nameKey: 'burn.n.plane', vars: { i: +s.di.toFixed(2), a: km(s.alt) }, dt: 0, dv: planeChange(vCirc(c.mu, r), (s.di * Math.PI) / 180), dir: 'normal', period: orbitPeriod(c.mu, r) }] }
    }
    case 'combined': {
      if (!fin(s.alt1, s.alt2, s.di) || s.alt1 <= 0 || s.alt2 <= 0) return bad('burn.err.alt')
      if (s.alt1 === s.alt2) return bad('burn.err.same')
      if (!(s.di > 0) || s.di > 180) return bad('burn.err.inc')
      const r1 = R(s.alt1), r2 = R(s.alt2), h = hohmannFull(c.mu, r1, r2), di = (s.di * Math.PI) / 180, up = r2 > r1
      // The plane change is done at the transfer apoapsis (the slowest point, where it is cheapest): the far end when raising, the start when lowering.
      const dv1 = up ? h.dv1 : combinedChange(h.vc1, h.vt1, di)
      const dv2 = up ? combinedChange(h.vt2, h.vc2, di) : h.dv2
      const dir: Dir = up ? 'prograde' : 'retrograde'
      const v = { a: km(s.alt1), b: km(s.alt2), i: +s.di.toFixed(2) }
      return { ok: true, notes, drafts: [
        { nameKey: up ? 'burn.n.hohmann1' : 'burn.n.combined', vars: v, dt: 0, dv: dv1, dir, period: h.T1 },
        { nameKey: up ? 'burn.n.combined' : 'burn.n.hohmann2', vars: v, dt: h.tof, dv: dv2, dir, period: orbitPeriod(c.mu, h.a) },
      ] }
    }
    case 'phasing': {
      if (!fin(s.alt, s.phase, s.revs) || s.alt <= 0) return bad('burn.err.alt')
      const n = Math.round(s.revs)
      if (n < 1 || n > 100) return bad('burn.err.revs')
      if (s.phase === 0 || Math.abs(s.phase) >= 360 * n) return bad('burn.err.phase')
      const r = R(s.alt), T = orbitPeriod(c.mu, r)
      // The target is `phase` degrees ahead. In n revolutions of the phasing orbit it flies n·Tp/T·360°, we must fly 360·n: 360 n = phase + 360 n Tp/T.
      const Tp = T * (1 - s.phase / (360 * n))
      const ap = semiMajorFromPeriod(c.mu, Tp)
      const rOther = 2 * ap - r // the other apsis of the phasing orbit
      if (rOther <= c.radius) return bad('burn.err.phasePeri')
      const dv = Math.abs(Math.sqrt(c.mu * (2 / r - 1 / ap)) - vCirc(c.mu, r))
      const faster = Tp < T
      const v = { p: +s.phase.toFixed(1), n }
      if (rOther < c.radius + 100 && faster) notes.push('burn.note.phaseLow')
      return { ok: true, notes, drafts: [
        { nameKey: 'burn.n.phase1', vars: v, dt: 0, dv, dir: faster ? 'retrograde' : 'prograde', period: T },
        { nameKey: 'burn.n.phase2', vars: v, dt: n * Tp, dv, dir: faster ? 'prograde' : 'retrograde', period: Tp },
      ] }
    }
    case 'custom': {
      if (!fin(s.dvMs) || !(s.dvMs > 0)) return bad('burn.err.dv')
      return { ok: true, notes, drafts: [{ nameKey: 'burn.n.custom', vars: {}, dt: 0, dv: s.dvMs / 1000, dir: s.dir, period: null }] }
    }
  }
}

let idN = 0
export const newId = () => `b${Date.now().toString(36)}${(idN++).toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`

/** Turn drafts into stored burns at start time t0 (J2000 s). `translate` gives the display name. */
export function draftsToBurns(drafts: Draft[], t0: number, body: CentralId, translate: (key: string, vars: Record<string, string | number>) => string): Burn[] {
  return drafts.map((d) => ({ id: newId(), name: translate(d.nameKey, d.vars), t: t0 + d.dt, dv: d.dv, dir: d.dir, body, period: d.period, src: 'user' as const }))
}

/** Departure / flyby / capture burns of a route. Events without Δv (free gravity assists) are not burns. Replaces earlier imports. */
export function importRoute(plan: Plan, events: Pick<FlightEvent, 'kind' | 'body' | 't' | 'dv'>[], name: (e: Pick<FlightEvent, 'kind' | 'body'>) => string): Plan {
  const burns = events.filter((e) => e.dv > 0).map((e): Burn => ({
    id: newId(), name: name(e), t: e.t, dv: e.dv, dir: e.kind === 'flyby' ? null : e.kind === 'launch' ? 'prograde' : 'retrograde',
    body: null, period: null, src: 'route',
  }))
  return { ...plan, burns: [...plan.burns.filter((b) => b.src !== 'route'), ...burns] }
}

export const sortBurns = (burns: Burn[]) => burns.map((b, i) => [b, i] as const).sort((a, b) => a[0].t - b[0].t || a[1] - b[1]).map((x) => x[0])
export const totalDv = (burns: Burn[]) => burns.reduce((a, b) => a + b.dv, 0)

// ---------- Propellant chain ----------
export interface Craft3 { dry: number; prop: number; isp: number }
export interface Step {
  burn: Burn
  mBefore: number; mAfter: number // kg
  prop: number // kg burned in this step (all that is left for a burn that cannot be completed)
  cumProp: number // kg burned including this step
  propLeft: number // kg after this step
  dvLeft: number // km/s the remaining propellant can still deliver
  ok: boolean
  shortDv: number // km/s that is missing (0 when ok)
  shortProp: number // kg of propellant missing (0 when ok)
  duration: number | null // s, constant thrust: Δm / (F/(Isp g0)); null without thrust
  ratio: number | null // duration / orbital period of the orbit of the burn; null when either is unknown
}
export interface Chain { steps: Step[]; firstFail: number; totalDv: number; totalProp: number; budget: number; mFinal: number; propLeft: number; valid: boolean }

/** Burns in date order, Tsiolkovsky m_after = m_before·e^(−Δv/(Isp g0)). The first burn that needs more propellant than is left burns the
 *  rest of the tank and is flagged; every later burn is flagged as unfunded (no mass change). */
export function propellantChain(sorted: Burn[], craft: Craft3, thrust: number | null): Chain {
  const { dry, prop, isp } = craft
  const valid = dry > 0 && prop >= 0 && isp > 0 && Number.isFinite(dry + prop + isp)
  const steps: Step[] = []
  let m = dry + prop, left = prop, cum = 0, firstFail = -1
  const budget = valid ? dvBudget(dry, prop, isp) : 0
  sorted.forEach((burn, i) => {
    const mBefore = m
    let used = 0, ok = true, shortDv = 0, shortProp = 0
    if (!valid) { ok = false; shortDv = burn.dv }
    else if (firstFail >= 0) { ok = false; shortDv = burn.dv; shortProp = propellantFor(Math.max(m, dry), burn.dv, isp) }
    else {
      const need = propellantFor(m, burn.dv, isp)
      if (need <= left * (1 + 1e-12) + 1e-9) used = Math.min(need, left)
      else { ok = false; used = left; shortProp = need - left; shortDv = burn.dv - dvBudget(dry, left, isp) }
    }
    if (!ok && firstFail < 0) firstFail = i
    m -= used; left -= used; cum += used
    const duration = thrust && thrust > 0 && valid ? used / (thrust / (isp * G0_MS)) : null
    steps.push({
      burn, mBefore, mAfter: m, prop: used, cumProp: cum, propLeft: left, dvLeft: valid ? dvBudget(dry, Math.max(0, left), isp) : 0,
      ok, shortDv, shortProp, duration, ratio: duration !== null && burn.period ? duration / burn.period : null,
    })
  })
  return { steps, firstFail, totalDv: totalDv(sorted), totalProp: cum, budget, mFinal: m, propLeft: left, valid }
}

/** Finite-burn rule of thumb used for the warning (no loss number is computed): a burn lasting more than this fraction of the orbit is no longer impulsive. */
export const LONG_BURN_RATIO = 0.1
export const burnIsLong = (s: Step) => s.ratio !== null && s.ratio > LONG_BURN_RATIO

// ---------- Persistence ----------
export const STORAGE_KEY = 'periapsis.burns.v1'
export const MAX_BURNS = 200
const isDir = (x: unknown): x is Dir => typeof x === 'string' && (DIRS as string[]).includes(x)
const num = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x)

export function parseBurn(x: unknown): Burn | null {
  if (!x || typeof x !== 'object') return null
  const o = x as Record<string, unknown>
  if (typeof o.id !== 'string' || !o.id || typeof o.name !== 'string' || !num(o.t) || !num(o.dv) || o.dv < 0 || o.dv > 1000) return null
  if (Math.abs(o.t) > 1e11) return null
  const dir = o.dir === null || o.dir === undefined ? null : isDir(o.dir) ? o.dir : undefined
  if (dir === undefined) return null
  const body = o.body === null || o.body === undefined ? null : (CENTRAL_IDS as unknown[]).includes(o.body) ? (o.body as CentralId) : undefined
  if (body === undefined) return null
  const period = o.period === null || o.period === undefined ? null : num(o.period) && o.period > 0 ? o.period : undefined
  if (period === undefined) return null
  return { id: o.id.slice(0, 40), name: o.name.slice(0, 80), t: o.t, dv: o.dv, dir, body, period, src: o.src === 'route' ? 'route' : 'user' }
}

export function parsePlan(raw: string | null | undefined): Plan {
  if (!raw) return emptyPlan()
  try {
    const o = JSON.parse(raw) as Record<string, unknown>
    if (!o || typeof o !== 'object' || o.v !== 1 || !Array.isArray(o.burns)) return emptyPlan()
    const seen = new Set<string>()
    const burns: Burn[] = []
    for (const x of o.burns.slice(0, MAX_BURNS)) {
      const b = parseBurn(x)
      if (b && !seen.has(b.id)) { seen.add(b.id); burns.push(b) }
    }
    return { burns, thrust: num(o.thrust) && o.thrust > 0 ? o.thrust : null }
  } catch { return emptyPlan() }
}
export const serializePlan = (p: Plan) => JSON.stringify({ v: 1, burns: p.burns, thrust: p.thrust })

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
const ls = (): Store | null => { try { return globalThis.localStorage ?? null } catch { return null } }
export function loadPlan(storage: Store | null = ls()): Plan {
  try { return parsePlan(storage?.getItem(STORAGE_KEY)) } catch { return emptyPlan() }
}
export function savePlan(p: Plan, storage: Store | null = ls()) {
  try { if (p.burns.length === 0 && p.thrust === null) storage?.removeItem(STORAGE_KEY); else storage?.setItem(STORAGE_KEY, serializePlan(p)) } catch { /* private mode / quota */ }
}

// ---------- Timeline scale ----------
export interface TimeScale { t0: number; t1: number; x: (t: number) => number; ticks: number[] }
/** Linear time → x mapping over [pad, width − pad]; a zero-length span is centred and widened to one day. */
export function timeScale(times: number[], width: number, pad = 18, nTicks = 4): TimeScale {
  let t0 = Math.min(...times), t1 = Math.max(...times)
  if (!times.length || !Number.isFinite(t0)) { t0 = 0; t1 = 86400 }
  if (t1 - t0 < 3600) { const c = (t0 + t1) / 2; t0 = c - 43200; t1 = c + 43200 }
  const x = (t: number) => pad + ((t - t0) / (t1 - t0)) * (width - 2 * pad)
  return { t0, t1, x, ticks: Array.from({ length: nTicks }, (_, i) => t0 + ((t1 - t0) * i) / (nTicks - 1)) }
}
