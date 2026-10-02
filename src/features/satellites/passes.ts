// Pass finder: when does a satellite rise above the observer's horizon, and is the pass visible to the naked eye?
import type { SatRec } from './sgp4.ts'
import { isSunlit, lookAt, sunAt, sunElevation, temeAt, type Observer } from './orbit.ts'

export interface Pass {
  riseMs: number; maxMs: number; setMs: number
  riseAz: number; maxAz: number; setAz: number; maxEl: number
  /** Sunlit satellite, Sun below -6° (nautical twilight or darker) and satellite above 10° at some moment of the pass. */
  visible: boolean
  /** Already up at the start of the window, or still up at its end. */
  ongoing: boolean
}
export const VISIBLE_MIN_EL = 10
export const VISIBLE_SUN_MAX = -6

const elAt = (sr: SatRec, o: Observer, ms: number) => { const s = temeAt(sr, ms); return s ? lookAt(o, s.r, ms) : null }

/** Horizon crossing between lo and hi (one below, one above the horizon), to ~0.5 s. */
function bisect(sr: SatRec, o: Observer, lo: number, hi: number): number {
  const lowBelow = (elAt(sr, o, lo)?.el ?? -90) < 0
  for (let i = 0; i < 16 && hi - lo > 500; i++) {
    const mid = (lo + hi) / 2, e = elAt(sr, o, mid)?.el ?? -90
    if ((e < 0) === lowBelow) lo = mid; else hi = mid
  }
  return (lo + hi) / 2
}

/** Passes with maximum elevation >= minEl (deg) between startMs and startMs + days. 20 s scan + bisection. */
export function findPasses(sr: SatRec, o: Observer, startMs: number, days: number, minEl = 0): Pass[] {
  const STEP = 20000, end = startMs + days * 86400000
  const out: Pass[] = []
  let prev = elAt(sr, o, startMs)
  let t = startMs
  let riseMs = prev && prev.el >= 0 ? startMs : NaN
  let ongoing = riseMs === startMs
  const finish = (setMs: number, isOngoing: boolean) => {
    let a = riseMs, b = setMs // culmination: golden-section search over [rise, set]
    const f = (x: number) => elAt(sr, o, x)?.el ?? -90
    const g = (Math.sqrt(5) - 1) / 2
    for (let i = 0; i < 24 && b - a > 1000; i++) {
      const c = b - g * (b - a), d = a + g * (b - a)
      if (f(c) > f(d)) b = d; else a = c
    }
    const maxMs = (a + b) / 2, mx = elAt(sr, o, maxMs)
    if (!mx || mx.el < minEl) return
    const ri = elAt(sr, o, riseMs), se = elAt(sr, o, setMs)
    let visible = false
    for (let x = riseMs; x <= setMs; x += 10000) {
      const s = temeAt(sr, x)
      if (!s || lookAt(o, s.r, x).el < VISIBLE_MIN_EL) continue
      if (isSunlit(s.r, sunAt(x)) && sunElevation(o, x) < VISIBLE_SUN_MAX) { visible = true; break }
    }
    out.push({ riseMs, maxMs, setMs, riseAz: ri?.az ?? mx.az, maxAz: mx.az, setAz: se?.az ?? mx.az, maxEl: mx.el, visible, ongoing: isOngoing })
  }
  while (t < end) {
    const nt = Math.min(t + STEP, end), cur = elAt(sr, o, nt)
    if (prev && cur) {
      if (prev.el < 0 && cur.el >= 0) { riseMs = bisect(sr, o, t, nt); ongoing = false }
      else if (prev.el >= 0 && cur.el < 0 && Number.isFinite(riseMs)) { finish(bisect(sr, o, t, nt), ongoing); riseMs = NaN; ongoing = false }
    }
    prev = cur; t = nt
  }
  if (Number.isFinite(riseMs)) finish(end, true)
  return out
}
