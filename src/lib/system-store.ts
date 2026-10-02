// Feature state of the planet-system view (central body, camera, one editable spacecraft orbit per body + manoeuvre log).
import { createStore } from './mini-store.ts'
import { activeCraft, clock, patchActiveCraft, selectedSolution, setSpeedNow, store as app } from './store.ts'
import {
  appendPlan, initialOrbit, sysR, toOrb,
  type OrbAlt, type Plan, type Seg, type SysId,
} from './system.ts'

export type CamKind = 'system' | 'planet' | 'craft' | 'moon'
export interface LogEntry { t: number; n: 1 | 2; name: string; dv: number; kg: number; after: string }
export interface TargetOrbit { rpAlt: number; raAlt: number; incDeg: number }
export interface Ship {
  id: number
  base: OrbAlt // the orbit the ship started in (editable)
  tp: number // epoch of periapsis passage of `base`
  src: 'mission' | 'default' | 'custom'
  solRef: unknown // mission solution the orbit came from
  segs: Seg[] // timeline: base orbit → (transfer → new orbit)*
  target: TargetOrbit // what "Baan aanpassen" aims for
  log: LogEntry[]
  spent: number // propellant (kg) spent by the manoeuvres of THIS system
}
export interface SystemState {
  body: SysId
  labels: boolean
  orbits: boolean
  follow: 'none' | 'craft' | string // 'moon:<id>' while the camera tracks a moon
  cam: { nonce: number; kind: CamKind; moon?: string }
  ships: Record<string, Ship>
}

export const SHIP_ID = 1 // one ship for now; the state is keyed by body + ship id so more can be added
export const shipKey = (body: SysId, id = SHIP_ID) => `${body}:${id}`

export const sys = createStore<SystemState>({
  body: 'mars', labels: true, orbits: true, follow: 'none', cam: { nonce: 0, kind: 'system' }, ships: {},
})

export function setBody(body: SysId) {
  sys.set((s) => ({ body, follow: 'none', cam: { nonce: s.cam.nonce + 1, kind: 'system' } }))
}
export function goCam(kind: CamKind, moon?: string) {
  sys.set((s) => ({ follow: kind === 'moon' ? `moon:${moon}` : 'none', cam: { nonce: s.cam.nonce + 1, kind, moon } }))
}
export function setFollowCraft(on: boolean) {
  sys.set((s) => ({ follow: on ? 'craft' : 'none', cam: on ? { nonce: s.cam.nonce + 1, kind: 'craft' as CamKind, moon: 'chase' } : s.cam }))
}

const segsOf = (alt: OrbAlt, tp: number, body: SysId): Seg[] => [{ t0: -Infinity, t1: Infinity, orb: toOrb(alt, sysR(body), tp), kind: 'orbit' }]
const targetOf = (a: OrbAlt): TargetOrbit => ({ rpAlt: a.rpAlt, raAlt: a.raAlt, incDeg: a.incDeg })

function freshShip(body: SysId, old?: Ship): Ship {
  const sol = selectedSolution(app.get())
  const init = initialOrbit(body, sol, clock.t)
  return {
    id: SHIP_ID, base: init.alt, tp: init.tp, src: init.src, solRef: sol, segs: segsOf(init.alt, init.tp, body),
    target: targetOf(init.alt), log: [], spent: old?.spent ?? 0,
  }
}

const put = (body: SysId, ship: Ship) => sys.set((s) => ({ ships: { ...s.ships, [shipKey(body)]: ship } }))
const upd = (body: SysId, f: (s: Ship) => Ship) => {
  const cur = sys.get().ships[shipKey(body)]
  if (cur) put(body, f(cur))
}

/** Creates the ship of a body, or re-initialises it from the (new) mission as long as the user has not edited or manoeuvred it. */
export function ensureShip(body: SysId) {
  const cur = sys.get().ships[shipKey(body)]
  if (!cur) return put(body, freshShip(body))
  if (cur.src === 'custom' || cur.segs.length > 1) return
  const sol = selectedSolution(app.get()), init = initialOrbit(body, sol, clock.t)
  if (cur.src !== init.src || (init.src === 'mission' && cur.solRef !== sol)) put(body, freshShip(body, cur))
}

/** Direct edit of the starting orbit (no propellant): resets the timeline to this single orbit. */
export function editBase(body: SysId, patch: Partial<OrbAlt>) {
  upd(body, (s) => {
    const base = { ...s.base, ...patch }
    return { ...s, base, src: 'custom', segs: segsOf(base, s.tp, body), target: s.segs.length > 1 ? s.target : targetOf(base) }
  })
}
export function editTarget(body: SysId, patch: Partial<TargetOrbit>) {
  upd(body, (s) => ({ ...s, target: { ...s.target, ...patch } }))
}
/** Back to the mission's (or default) orbit, clears the timeline and log. Propellant is NOT restored (see restoreFuel). */
export function resetShip(body: SysId) {
  put(body, freshShip(body, sys.get().ships[shipKey(body)]))
}
/** Gives back the propellant that this system's manoeuvres used. */
export function restoreFuel(body: SysId) {
  const sh = sys.get().ships[shipKey(body)]
  if (!sh || sh.spent <= 0) return
  patchActiveCraft({ prop: activeCraft(app.get()).prop + sh.spent })
  upd(body, (s) => ({ ...s, spent: 0 }))
}

const fmtOrb = (o: { rp: number; ra: number; i: number }, R: number) =>
  `${Math.round(o.rp - R)} × ${Math.round(o.ra - R)} km, i = ${((o.i * 180) / Math.PI).toFixed(1)}°`

/** Executes a planned manoeuvre: extends the timeline, logs the burns and takes the propellant out of the active craft. */
export function applyPlan(body: SysId, plan: Plan): boolean {
  const craft = activeCraft(app.get()), sh = sys.get().ships[shipKey(body)]
  if (!sh || plan.same || plan.kg > craft.prop + 1e-9) return false
  const R = sysR(body)
  const entries: LogEntry[] = plan.burns.map((b) => ({ t: b.t, n: b.n, name: b.name, dv: b.dv, kg: b.kg, after: fmtOrb(b.after, R) }))
  patchActiveCraft({ prop: Math.max(0, craft.prop - plan.kg) })
  upd(body, (s) => ({ ...s, segs: appendPlan(s.segs, plan), log: [...s.log, ...entries], spent: s.spent + plan.kg }))
  // show it: speed the clock up so the two burns happen within ~25 s of real time (never slower than 60×)
  const span = Math.max(1, plan.tb2 - clock.t)
  setSpeedNow(Math.max(60, span / 25))
  clock.paused = false
  return true
}

/** The orbit the next manoeuvre starts from: the last segment of the timeline. */
export const currentSeg = (sh: Ship) => sh.segs[sh.segs.length - 1]

// Dev hook for scripted screenshots: #js=__sys.setBody('jupiter')
if (import.meta.env?.DEV && typeof window !== 'undefined') Object.assign(window, { __sys: { sys, setBody, goCam, setFollowCraft, editBase, editTarget, applyPlan, resetShip, restoreFuel, ensureShip } })
