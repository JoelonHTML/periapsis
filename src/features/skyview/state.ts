// Shared state of the Sky view: filter layers (persisted), camera, selection, AR status. Panel and Stage both read it.
import { createStore } from '../../lib/mini-store.ts'
import type { Obj } from './scene.ts'
import { loadFovCal, type CamStatus } from './camera.ts'

export interface Layers {
  stars: boolean; starNames: boolean; lines: boolean; conNames: boolean
  planets: boolean; moon: boolean; sun: boolean
  sats: boolean; satsSunlitOnly: boolean
  mw: boolean; dso: boolean
  gridAz: boolean; gridEq: boolean; ecliptic: boolean
  ground: boolean; cardinals: boolean
  /** daylight sky colour + stars fading in the daytime; off = always a dark sky */
  atmosphere: boolean
  /** faintest star magnitude drawn */
  magLim: number
}
export const DEFAULT_LAYERS: Layers = {
  stars: true, starNames: true, lines: true, conNames: true, planets: true, moon: true, sun: true, sats: true, satsSunlitOnly: false,
  mw: true, dso: true, gridAz: false, gridEq: false, ecliptic: false, ground: true, cardinals: true, atmosphere: true, magLim: 6,
}
const KEY = 'periapsis.skyview.layers.v1'
function load(): Layers {
  try {
    const o = JSON.parse(globalThis.localStorage?.getItem(KEY) ?? 'null')
    if (o && typeof o === 'object') {
      const out = { ...DEFAULT_LAYERS }
      for (const k of Object.keys(DEFAULT_LAYERS) as (keyof Layers)[]) if (typeof o[k] === typeof DEFAULT_LAYERS[k]) (out as Record<string, unknown>)[k] = o[k]
      out.magLim = Math.min(6.5, Math.max(2, out.magLim))
      return out
    }
  } catch { /* ignore */ }
  return DEFAULT_LAYERS
}
export const layers = createStore<Layers>(load())
export const useLayers = layers.useStore
export function setLayer<K extends keyof Layers>(k: K, v: Layers[K]) {
  layers.set({ [k]: v } as Partial<Layers>)
  try { globalThis.localStorage?.setItem(KEY, JSON.stringify(layers.get())) } catch { /* ignore */ }
}

export type ArStatus = 'off' | 'asking' | 'on' | 'denied' | 'nosensor'
export const FOV_MIN = 20, FOV_MAX = 120
const coarse = !!globalThis.matchMedia?.('(pointer: coarse)').matches
/** Camera (az/alt of the view centre, fov of the shorter screen side), selection and AR. Read every frame by the Stage. */
export const view = createStore({
  az: 180, alt: 35, fov: coarse ? 75 : 95,
  sel: null as Obj | null,
  ar: 'off' as ArStatus,
  /** rear camera behind the sky in AR */
  cam: 'off' as CamStatus,
  /** user calibration of the camera field of view (factor on tan(FOV/2)); persists */
  fovCal: loadFovCal(),
  /** the FOV the AR overlay is drawn with (deg, horizontal x vertical of the screen), for the calibration read-out */
  camFov: { h: 0, v: 0 },
  /** a hint line over the sky (AR calibration, "below the horizon", ...) */
  hint: '' as string,
})
export const useView = view.useStore
