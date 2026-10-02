// Feature state of the "Melkweg" view (own store; the simulation clock of the rest of the app is not used here).
import { BODIES, C_KMS, CUSTOM_ID, bodyById, computePlan, galToXyz, type IonInput, type Model, type Plan, type V3 } from './galaxy.ts'
import { createStore } from './mini-store.ts'

export type CamMode = 'galaxy' | 'sun' | 'overview' | 'chase' | 'dest'

export const ION_PRESETS: Record<string, { label: string; ion: IonInput }> = {
  nstar: { label: 'NSTAR (Dawn) — 92 mN, 3 100 s', ion: { thrustN: 0.092, isp: 3100, powerW: 2300, propKg: 425, dryKg: 750 } },
  next: { label: 'NEXT — 236 mN, 4 100 s', ion: { thrustN: 0.236, isp: 4100, powerW: 6900, propKg: 500, dryKg: 1000 } },
  hypo: { label: 'Hypothetisch — 1 N, 10 000 s', ion: { thrustN: 1, isp: 10000, powerW: 70000, propKg: 5000, dryKg: 2000 } },
}

export interface GState {
  targetId: string
  custom: { d: number; l: number; b: number }
  model: Model
  vKms: number
  ionPreset: string // key of ION_PRESETS or 'custom'
  ion: IonInput
  aG: number
  rate: number // ly of craft travel per real second
  playing: boolean
  cam: CamMode
  camNonce: number // bump to re-apply the current camera mode
}

const hash = typeof location !== 'undefined' ? new URLSearchParams(location.hash.slice(1)) : new URLSearchParams()
const num = (k: string) => (hash.get(k) !== null && Number.isFinite(Number(hash.get(k))) ? Number(hash.get(k)) : null)

export const gstore = createStore<GState>({
  targetId: bodyById(hash.get('galtarget') ?? '') ? hash.get('galtarget')! : 'rim',
  custom: { d: 100, l: 90, b: 0 },
  model: (['ideal', 'ion', 'accel'] as const).find((m) => m === hash.get('galmodel')) ?? 'ideal',
  vKms: num('galkms') ?? (num('galbeta') !== null ? num('galbeta')! * C_KMS : C_KMS),
  ionPreset: 'nstar',
  ion: ION_PRESETS.nstar.ion,
  aG: num('galg') ?? 1,
  rate: num('galrate') ?? 1,
  playing: hash.get('galplay') === '1',
  cam: (['galaxy', 'sun', 'overview', 'chase', 'dest'] as const).find((m) => m === hash.get('galcam')) ?? 'galaxy',
  camNonce: 0,
})

/** Mutable flight state, written every frame by the 3D scene (no React re-render): distance travelled in ly. */
export const flight = { s: 0 }

export interface Target { id: string; name: string; d: number; l: number; b: number; xyz: V3; unit: V3 }
export function currentTarget(s = gstore.get()): Target {
  const b = s.targetId === CUSTOM_ID ? null : bodyById(s.targetId) ?? BODIES[0]
  const d = Math.max(b ? b.d : s.custom.d, 1e-3), l = b ? b.l : s.custom.l, lat = b ? b.b : s.custom.b
  const xyz = galToXyz(l, lat, d)
  return { id: b ? b.id : CUSTOM_ID, name: b ? b.name : 'Eigen bestemming', d, l, b: lat, xyz, unit: [xyz[0] / d, xyz[1] / d, xyz[2] / d] }
}

let key = '', cached: Plan | null = null
/** Plan for the current state (memoised on its inputs). */
export function currentPlan(): Plan {
  const s = gstore.get(), t = currentTarget(s)
  const k = JSON.stringify([t.d, s.model, s.vKms, s.ion, s.aG])
  if (k !== key || !cached) { key = k; cached = computePlan({ d: t.d, model: s.model, vKms: s.vKms, ion: s.ion, aG: s.aG }) }
  return cached
}

const pg = num('galprog')
if (pg !== null) flight.s = Math.min(Math.max(pg, 0), 1) * currentTarget().d

export const setCam = (cam: CamMode) => gstore.set((s) => ({ cam, camNonce: s.camNonce + 1 }))
export function setTarget(id: string) { flight.s = 0; gstore.set((s) => ({ targetId: id, playing: false, camNonce: s.camNonce + 1 })) }
export function resetFlight() { flight.s = 0; gstore.set((s) => ({ playing: false, camNonce: s.camNonce + 1 })) }

if (import.meta.env?.DEV && typeof window !== 'undefined') {
  Object.assign(window, { __orbitlab_galaxy: { gstore, flight, setCam, setTarget, resetFlight, plan: currentPlan, target: currentTarget } })
}
