// Porkchop plot Earth → planet: ballistic Lambert solutions (heliocentric, 2-body, 0 revolutions, prograde) over a grid of
// departure date × time of flight. Same model as the optimiser in src/lib/mga.ts (Standish elements, departDv/arrivalDv),
// so the numbers of a grid cell match a direct (no flyby) route.
import { AU, BODIES, MU_SUN, RE, bodyState, departDv, lambert, norm, sub, type BodyId } from '../../lib/astro.ts'
import { arrivalDv, tofBounds, type ArrivalKind } from '../../lib/mga.ts'

export interface PorkchopParams { target: BodyId; parkAlt: number; arrival: ArrivalKind; capAlt: number; capEcc: number }
export interface PcPoint {
  tDep: number // s since J2000
  tof: number // s
  c3: number // departure C3 = v∞² (km²/s²)
  vinfDep: number // km/s
  vinfArr: number // km/s
  dvDep: number // km/s from the circular parking orbit
  dvArr: number // km/s capture (0 for a pure flyby)
  dv: number // dvDep + dvArr
}
export type Metric = 'c3' | 'dv'

export function evalPoint(p: PorkchopParams, tDep: number, tof: number): PcPoint | null {
  const a = bodyState('earth', tDep), b = bodyState(p.target, tDep + tof)
  const l = lambert(a.r, b.r, tof, MU_SUN)
  if (!l) return null
  const vinfDep = norm(sub(l.v1, a.v)), vinfArr = norm(sub(l.v2, b.v))
  const dvDep = departDv(vinfDep, RE + p.parkAlt), dvArr = arrivalDv(vinfArr, p.target, p)
  const dv = dvDep + dvArr
  if (!Number.isFinite(dv) || !Number.isFinite(vinfArr)) return null
  return { tDep, tof, c3: vinfDep * vinfDep, vinfDep, vinfArr, dvDep, dvArr, dv }
}

const period = (aAu: number) => 2 * Math.PI * Math.sqrt((aAu * AU) ** 3 / MU_SUN)
/** Synodic period Earth–target (s). */
export const synodic = (target: BodyId) => 1 / Math.abs(1 / period(BODIES.earth.el[0]) - 1 / period(BODIES[target].el[0]))
/** Hohmann transfer time Earth → target (s). */
export const hohmannTof = (target: BodyId) => {
  const a = ((BODIES.earth.el[0] + BODIES[target].el[0]) / 2) * AU
  return Math.PI * Math.sqrt(a ** 3 / MU_SUN)
}

export interface GridSpec { t0: number; t1: number; tof0: number; tof1: number; nx: number; ny: number }
export interface Grid { spec: GridSpec; c3: Float32Array; vinfArr: Float32Array; dv: Float32Array; rowsDone: number }

/** Window of ±1.1 synodic periods around `centre` (departure epoch), time of flight 0.4–1.6 × the Hohmann time. */
export function makeSpec(target: BodyId, centre: number, nx = 140, ny = 64): GridSpec {
  const half = 1.1 * synodic(target), th = hohmannTof(target)
  const [lo, hi] = tofBounds('earth', target) // keep inside what the optimiser searches
  return { t0: centre - half, t1: centre + half, tof0: Math.max(lo, 0.4 * th), tof1: Math.min(hi, 1.6 * th), nx, ny }
}
/** Centre of the default window: the given departure date, or (arrival mode) the arrival date minus a Hohmann flight. */
export const defaultCentre = (target: BodyId, mode: 'departure' | 'arrival', date: number) => (mode === 'departure' ? date : date - hohmannTof(target))

export const nodeT = (s: GridSpec, i: number) => s.t0 + ((s.t1 - s.t0) * i) / (s.nx - 1)
export const nodeTof = (s: GridSpec, j: number) => s.tof0 + ((s.tof1 - s.tof0) * j) / (s.ny - 1)

export function newGrid(spec: GridSpec): Grid {
  const n = spec.nx * spec.ny
  return { spec, c3: new Float32Array(n).fill(NaN), vinfArr: new Float32Array(n).fill(NaN), dv: new Float32Array(n).fill(NaN), rowsDone: 0 }
}
/** Fill rows [j0, j1) of the grid (row j = one time of flight). */
export function computeRows(g: Grid, p: PorkchopParams, j0: number, j1: number) {
  const s = g.spec
  for (let j = j0; j < Math.min(j1, s.ny); j++) {
    const tof = nodeTof(s, j)
    for (let i = 0; i < s.nx; i++) {
      const q = evalPoint(p, nodeT(s, i), tof)
      if (q) { const k = j * s.nx + i; g.c3[k] = q.c3; g.vinfArr[k] = q.vinfArr; g.dv[k] = q.dv }
    }
    g.rowsDone = Math.max(g.rowsDone, j + 1)
  }
}
export function computeAll(spec: GridSpec, p: PorkchopParams): Grid {
  const g = newGrid(spec)
  computeRows(g, p, 0, spec.ny)
  return g
}

export function finiteStats(a: Float32Array) {
  const v: number[] = []
  for (let i = 0; i < a.length; i++) if (Number.isFinite(a[i])) v.push(a[i])
  v.sort((x, y) => x - y)
  if (!v.length) return { min: NaN, max: NaN, q: (_x: number) => NaN }
  return { min: v[0], max: v[v.length - 1], q: (x: number) => v[Math.min(v.length - 1, Math.floor(x * v.length))] }
}

/** Grid node with the lowest value of `metric`. */
export function gridMin(g: Grid, metric: Metric, bounds?: { t0: number; t1: number }) {
  const a = g[metric], s = g.spec
  let best = -1
  for (let k = 0; k < a.length; k++) {
    if (bounds) { const t = nodeT(s, k % s.nx); if (t < bounds.t0 || t > bounds.t1) continue }
    if (Number.isFinite(a[k]) && (best < 0 || a[k] < a[best])) best = k
  }
  if (best < 0) return null
  const i = best % s.nx, j = Math.floor(best / s.nx)
  return { i, j, tDep: nodeT(s, i), tof: nodeTof(s, j), value: a[best] }
}

/** Continuous pattern-search refinement of the minimum, starting at the best grid node. */
export function refineMin(g: Grid, p: PorkchopParams, metric: Metric, bounds?: { t0: number; t1: number }): PcPoint | null {
  const m = gridMin(g, metric, bounds)
  if (!m) return null
  const s = g.spec
  let best = evalPoint(p, m.tDep, m.tof)
  if (!best) return null
  let dt = (s.t1 - s.t0) / (s.nx - 1), df = (s.tof1 - s.tof0) / (s.ny - 1)
  for (let it = 0; it < 60 && dt > 60; it++) {
    let improved = false
    for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
      const tof = best.tof + b * df, td = best.tDep + a * dt
      if (tof < s.tof0 || tof > s.tof1 || td < (bounds?.t0 ?? s.t0) || td > (bounds?.t1 ?? s.t1)) continue
      const q = evalPoint(p, td, tof)
      if (q && q[metric] < best[metric]) { best = q; improved = true }
    }
    if (!improved) { dt /= 2; df /= 2 }
  }
  return best
}

/** "Nice" contour levels (1, 2, 2.5, 5 × 10^k) between lo and hi, roughly n of them. */
export function niceLevels(lo: number, hi: number, n = 7): number[] {
  if (!(hi > lo)) return []
  const raw = (hi - lo) / n, e = Math.pow(10, Math.floor(Math.log10(raw)))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * e).find((s) => s >= raw) ?? raw
  const out: number[] = []
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(+v.toFixed(6))
  return out
}
