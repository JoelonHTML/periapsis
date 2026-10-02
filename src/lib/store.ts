import { useSyncExternalStore } from 'react'
import { toJ2000, type BodyId, type MoonPlan, type OrbitTarget } from './astro.ts'
import { closeupSpeed } from './closeup.ts'
import { flybyWindow, type Solution } from './mga.ts'
import { AU, BODIES } from './astro.ts'

export type View = 'solar' | 'earth' | 'earthmoon' | 'flyby' | 'system' | 'galaxy'
export interface Craft { dry: number; prop: number; isp: number; cd: number; area: number }

/** One spacecraft of the fleet. The ACTIVE ship lives in the flat State fields (craft, target, solutions, selected, moon);
 *  `ships[active]` is only a stale snapshot, so always read the whole fleet through `allShips(state)`. */
export interface Ship { id: number; name: string; color: string; craft: Craft; target: BodyId | 'moon'; solutions: Solution[]; selected: number; moon: MoonPlan | null }
export const MAX_SHIPS = 8
export const SHIP_COLORS = ['#fde047', '#38bdf8', '#f472b6', '#4ade80', '#fb923c', '#c084fc', '#f87171', '#2dd4bf']

export interface State {
  view: View
  trueScale: boolean
  magnify: number
  showLabels: boolean
  showBelt: boolean
  showLagrange: boolean
  follow: string
  craft: Craft
  siteIdx: number // -1 = custom
  customLat: number
  customLon: number
  orbitPreset: string
  orbit: OrbitTarget
  target: BodyId | 'moon'
  solutions: Solution[]
  selected: number
  flybyIdx: number // index into selected solution's events
  moon: MoonPlan | null
  simActive: boolean
  autoCloseup: boolean
  startT: number
  ships: Ship[]
  active: number // index into ships
  closeupOff: string[] // closeupKey()s of flybys whose automatic close-up is switched off
  camFit: number // solar-view camera framing radius in scene units (0 = default)
  closeupAuto: boolean // current close-up was opened by the simulation itself (it closes itself again at the window end)
  closeupRate: number // playback factor of the close-up (1 = whole window in ~30 s)
  flybyCam: { mode: 'wide' | 'close' | 'sun'; n: number } // close-up camera preset (n bumps to re-apply the same preset)
  emCam: { mode: 'moon' | 'l12'; n: number } // Earth–Moon view framing: the Moon's orbit, or wide enough for Sun–Earth L1/L2
  returnClock: { target: number; paused: boolean } | null // clock speed to restore when the close-up ends
}

const listeners = new Set<() => void>()
let state: State = {
  view: 'solar', trueScale: true, magnify: 60, showLabels: true, showBelt: true, showLagrange: true, follow: 'none',
  craft: { dry: 1200, prop: 1800, isp: 320, cd: 2.2, area: 4 },
  siteIdx: 0, customLat: 52.0, customLon: 4.4,
  orbitPreset: 'iss', orbit: { rpAlt: 420, raAlt: 420, incDeg: 51.64, parkAlt: 200, wDeg: null },
  target: 'jupiter', solutions: [], selected: -1, flybyIdx: -1, moon: null,
  simActive: false, autoCloseup: true, startT: toJ2000(Date.now()), camFit: 0,
  ships: [{ id: 1, name: 'Ruimtevaartuig 1', color: SHIP_COLORS[0], craft: { dry: 1200, prop: 1800, isp: 320, cd: 2.2, area: 4 }, target: 'jupiter', solutions: [], selected: -1, moon: null }],
  active: 0, closeupOff: [],
  closeupAuto: false, closeupRate: 1, flybyCam: { mode: 'close', n: 0 }, emCam: { mode: 'moon', n: 0 }, returnClock: null,
}
export const store = {
  get: () => state,
  set(patch: Partial<State> | ((s: State) => Partial<State>)) {
    const prev = state
    state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) }
    // Whatever closes the close-up (back button, new route, ship switch, view switcher) gives the clock its old speed back.
    if (prev.view === 'flyby' && state.view !== 'flyby' && state.returnClock) {
      clock.target = state.returnClock.target
      clock.paused = state.returnClock.paused
      state = { ...state, returnClock: null, closeupAuto: false }
    }
    listeners.forEach((l) => l())
  },
  subscribe(l: () => void) {
    listeners.add(l)
    return () => { listeners.delete(l) }
  },
}
export const useApp = <T,>(sel: (s: State) => T) => useSyncExternalStore(store.subscribe, () => sel(state))
/** The craft (mass, Isp, Cd, area) of the active spacecraft. Other features read/modify it only through these two. */
export const activeCraft = (s: State) => s.craft
export function patchActiveCraft(p: Partial<Craft>) { store.set((s) => ({ craft: { ...s.craft, ...p } })) }
const snapshot = (s: State): Ship => ({ ...s.ships[s.active], craft: s.craft, target: s.target, solutions: s.solutions, selected: s.selected, moon: s.moon })
/** The whole fleet, with the active ship's live (flat) fields merged in. */
export const allShips = (s: State): Ship[] => s.ships.map((sh, i) => (i === s.active ? snapshot(s) : sh))
const load = (sh: Ship) => ({ craft: sh.craft, target: sh.target, solutions: sh.solutions, selected: sh.selected, moon: sh.moon, flybyIdx: -1, simActive: false })
export function selectShip(i: number) {
  store.set((s) => {
    if (i === s.active || !s.ships[i]) return {}
    const ships = allShips(s)
    return { ships, active: i, ...load(ships[i]), view: s.view === 'flyby' ? 'solar' : s.view }
  })
}
export function addShip() {
  store.set((s) => {
    const ships = allShips(s), id = Math.max(0, ...ships.map((x) => x.id)) + 1
    if (ships.length >= MAX_SHIPS) return {}
    const n: Ship = { id, name: `Ruimtevaartuig ${id}`, color: SHIP_COLORS[(id - 1) % SHIP_COLORS.length], craft: { ...s.craft }, target: s.target, solutions: [], selected: -1, moon: null }
    return { ships: [...ships, n], active: ships.length, ...load(n), view: s.view === 'flyby' ? 'solar' : s.view }
  })
}
export function removeShip(i: number) {
  store.set((s) => {
    const ships = allShips(s)
    if (ships.length < 2 || !ships[i]) return {}
    ships.splice(i, 1)
    const active = i < s.active ? s.active - 1 : Math.min(s.active, ships.length - 1)
    return { ships, active, ...load(ships[active]), view: s.view === 'flyby' ? 'solar' : s.view }
  })
}
export function renameShip(i: number, name: string) {
  store.set((s) => ({ ships: allShips(s).map((x, k) => (k === i ? { ...x, name } : x)) }))
}

export const closeupKey = (sol: Solution, k: number) => `${sol.seq.join('-')}:${Math.round(sol.tDep / 86400)}:${k}`
export const closeupEnabled = (s: State, sol: Solution, k: number) => !s.closeupOff.includes(closeupKey(sol, k))
export function toggleCloseup(sol: Solution, k: number) {
  const key = closeupKey(sol, k)
  store.set((s) => ({ closeupOff: s.closeupOff.includes(key) ? s.closeupOff.filter((x) => x !== key) : [...s.closeupOff, key] }))
}

export const selectedSolution = (s: State) => (s.selected >= 0 ? s.solutions[s.selected] ?? null : null)

// ---------- Simulation clock (mutable, read every frame; never triggers React renders) ----------
export const SPEEDS = [
  { s: 1, label: 'Realtime' },
  { s: 60, label: '1 min/s' },
  { s: 3600, label: '1 uur/s' },
  { s: 86400, label: '1 dag/s' },
  { s: 2629800, label: '1 maand/s' },
  { s: 31557600, label: '1 jaar/s' },
]
const toLevel = (s: number) => Math.sign(s) * Math.log10(1 + Math.abs(s))
const fromLevel = (l: number) => Math.sign(l) * (10 ** Math.abs(l) - 1)
const now = toJ2000(Date.now())

export const clock = { t: now, start: now, target: 1, level: toLevel(1), paused: false } // always starts in real time

/** Smoothly ramps the speed in log-space so switching minute→hour→day→month→year accelerates visibly. */
export function tickClock(dtReal: number) {
  const goal = clock.paused ? 0 : toLevel(clock.target)
  clock.level += (goal - clock.level) * (1 - Math.exp(-dtReal / 0.35))
  clock.t += fromLevel(clock.level) * dtReal
}
export const currentSpeed = () => fromLevel(clock.level)
export function jumpTo(t: number) { clock.t = t }
/** Change speed without the smooth ramp (used when entering a flyby close-up). */
export function setSpeedNow(s: number) { clock.target = s; clock.level = toLevel(s) }
export function fmtSpeed(s: number) {
  const a = Math.abs(s), sign = s < 0 ? '−' : ''
  if (a < 0.05) return 'gepauzeerd'
  const u = (x: number) => a < x * 0.999
  if (u(60)) return `${sign}${a.toFixed(a < 10 ? 1 : 0)} s/s`
  if (u(3600)) return `${sign}${(a / 60).toFixed(1)} min/s`
  if (u(86400)) return `${sign}${(a / 3600).toFixed(1)} uur/s`
  if (u(2629800)) return `${sign}${(a / 86400).toFixed(1)} dag/s`
  if (u(31557600)) return `${sign}${(a / 2629800).toFixed(1)} maand/s`
  return `${sign}${(a / 31557600).toFixed(1)} jaar/s`
}

export const shipSolution = (sh: Pick<Ship, 'solutions' | 'selected'>) => (sh.selected >= 0 ? sh.solutions[sh.selected] ?? null : null)

/** Opens the close-up of flyby k at the start of its window (dir = 1) or at its end (dir = −1, clock running backwards)
 *  and sets the playback speed so the pass takes ~30 s at rate 1. The speed that was active before is restored when the
 *  close-up ends. `auto` = opened by the simulation (closes itself at the window end instead of pausing there). */
export function openCloseup(sol: Solution, k: number, opts: { dir?: 1 | -1; auto?: boolean } = {}) {
  const { dir = 1, auto = false } = opts, { tWin } = flybyWindow(sol, k)
  const s = store.get()
  store.set({
    view: 'flyby', flybyIdx: k, closeupAuto: auto,
    returnClock: s.view === 'flyby' && s.returnClock ? s.returnClock : { target: clock.target, paused: clock.paused },
  })
  jumpTo(sol.events[k].t - dir * tWin)
  setSpeedNow(dir * closeupSpeed(tWin, s.closeupRate))
  clock.paused = false
}

/** Playback factor of the open close-up (keeps the running direction). */
export function setCloseupRate(sol: Solution, k: number, rate: number) {
  store.set({ closeupRate: rate })
  setSpeedNow((Math.sign(clock.target) || 1) * closeupSpeed(flybyWindow(sol, k).tWin, rate))
}

/** Back to the solar system; the clock gets its previous speed back (see store.set). */
export function closeCloseup() { store.set({ view: 'solar' }) }

/** Scene-unit radius (1 unit = 10⁶ km) that frames a whole route. */
export const fitRoute = (s: Solution) => Math.max(...s.seq.map((b) => BODIES[b].el[0])) * AU * 1e-6 * 1.15
