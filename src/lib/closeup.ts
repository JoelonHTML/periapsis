// Pure logic for the flyby close-up: when does the simulation clock *run across* a flyby window,
// where is the clock relative to it, and how do we cycle between flybys. No React/three here (node-testable).
import { DAY, add, bodyState, norm, type Vec } from './astro.ts'
import { flybyWindow, type FlightEvent, type Solution } from './mga.ts'

/** Never open a close-up automatically sooner than this after launch (clock still "just launched"). */
export const LAUNCH_MARGIN = 5 * DAY

/** Entered the window of the flyby at epoch `tc` (half-width `tWin`) by the clock RUNNING from t0 to t1?
 *  +1 = forward across the window start, −1 = backward across the window end, 0 = no. A time jump must never be fed
 *  in here: the caller passes the interval the clock integrated itself (t0 = value at frame start, after any jump). */
export function enteredWindow(t0: number, t1: number, tc: number, tWin: number): 1 | -1 | 0 {
  if (t0 < tc - tWin && t1 >= tc - tWin) return 1
  if (t0 > tc + tWin && t1 <= tc + tWin) return -1
  return 0
}

/** Left the window by running: +1 = past the end going forward, −1 = before the start going backward. */
export function leftWindow(t0: number, t1: number, tc: number, tWin: number): 1 | -1 | 0 {
  if (t0 <= tc + tWin && t1 > tc + tWin) return 1
  if (t0 >= tc - tWin && t1 < tc - tWin) return -1
  return 0
}

/** Where the clock stands relative to the flyby window; `offset` = t − tc in seconds. */
export function windowPhase(t: number, tc: number, tWin: number) {
  const offset = t - tc
  return { phase: offset < -tWin ? 'before' : offset > tWin ? 'after' : 'inside', offset } as const
}

/** Automatic close-up allowed at clock time t? (after launch + margin, flyby switched on) */
export const autoAllowed = (t: number, tDep: number, enabled: boolean) => enabled && t >= tDep + LAUNCH_MARGIN

/** Indices of the flybys of a solution. */
export const flybyIndices = (events: Pick<FlightEvent, 'kind'>[]) => events.flatMap((e, k) => (e.kind === 'flyby' ? [k] : []))

/** Next (dir=+1) or previous (−1) flyby index, cycling. Returns −1 when there is none. */
export function cycleFlyby(events: Pick<FlightEvent, 'kind'>[], k: number, dir: 1 | -1) {
  const all = flybyIndices(events)
  if (!all.length) return -1
  const i = all.indexOf(k)
  if (i < 0) return dir > 0 ? all[0] : all[all.length - 1]
  return all[(i + dir + all.length) % all.length]
}

/** Preset playback factors: 1× = the whole window in ~30 s. */
export const CLOSEUP_RATES = [0.25, 1, 4]
export const closeupSpeed = (tWin: number, rate: number) => (2 * tWin * rate) / 30

/** Heliocentric speed of the craft during flyby k at time t (planet velocity + hyperbolic velocity relative to the planet).
 *  Also returns the planet-relative position (km) and speed. */
export function flybyState(sol: Solution, k: number, t: number, win = flybyWindow(sol, k)) {
  const ev = sol.events[k], tRel = Math.max(-win.tWin, Math.min(win.tWin, t - ev.t)), h = Math.max(1, win.tWin * 1e-4)
  const rel = win.g.at(tRel)
  const a = win.g.at(tRel - h), b = win.g.at(tRel + h)
  const vRel: Vec = [(b[0] - a[0]) / (2 * h), (b[1] - a[1]) / (2 * h), (b[2] - a[2]) / (2 * h)]
  const vHelio = norm(add(bodyState(ev.body, ev.t).v, vRel))
  return { tRel, rel, r: norm(rel), vRel: norm(vRel), vHelio }
}
