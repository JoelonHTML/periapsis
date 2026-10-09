// Shared state of the Sky view: filter layers (persisted), camera, selection, AR status. Panel and Stage both read it.
import { createStore } from '../../lib/mini-store.ts'
import type { Obj } from './scene.ts'

export interface Layers {
  stars: boolean; starNames: boolean; lines: boolean; conNames: boolean; conBounds: boolean
  planets: boolean; moon: boolean; sun: boolean; jovMoons: boolean; dwarfs: boolean
  sats: boolean; satsSunlitOnly: boolean
  mw: boolean; dso: boolean; dsoNames: boolean; showers: boolean
  gridAz: boolean; gridEq: boolean; gridGal: boolean; ecliptic: boolean; equator: boolean; meridian: boolean
  ground: boolean; cardinals: boolean
  /** daylight sky colour + stars fading in the daytime; off = always a dark sky (also ignores light pollution and the Moon) */
  atmosphere: boolean
  /** true altitudes become apparent altitudes (Saemundsson refraction) and low stars are dimmed by extinction */
  refraction: boolean
  /** Bortle dark-sky class 1 (remote) .. 9 (inner city): limits the visible magnitude and brightens the sky near the horizon */
  bortle: number
  /** faintest star magnitude drawn with the naked eye (zooming in adds depth, up to the catalogue's 8) */
  magLim: number
}
export const DEFAULT_LAYERS: Layers = {
  stars: true, starNames: true, lines: true, conNames: true, conBounds: false, planets: true, moon: true, sun: true, jovMoons: true, dwarfs: true, sats: true, satsSunlitOnly: false,
  mw: true, dso: true, dsoNames: true, showers: true, gridAz: false, gridEq: false, gridGal: false, ecliptic: false, equator: false, meridian: false,
  ground: true, cardinals: true, atmosphere: true, refraction: true, bortle: 3, magLim: 7,
}
const KEY = 'periapsis.skyview.layers.v2'
function load(): Layers {
  try {
    const o = JSON.parse(globalThis.localStorage?.getItem(KEY) ?? 'null')
    if (o && typeof o === 'object') {
      const out = { ...DEFAULT_LAYERS }
      for (const k of Object.keys(DEFAULT_LAYERS) as (keyof Layers)[]) if (typeof o[k] === typeof DEFAULT_LAYERS[k]) (out as Record<string, unknown>)[k] = o[k]
      out.magLim = Math.min(8, Math.max(2, out.magLim))
      out.bortle = Math.min(9, Math.max(1, Math.round(out.bortle)))
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
/** Down to half a degree: Jupiter with its moons, the Orion nebula, a double star. */
export const FOV_MIN = 0.5, FOV_MAX = 120
const coarse = !!globalThis.matchMedia?.('(pointer: coarse)').matches
/** Camera (az/alt of the view centre, fov of the shorter screen side), selection and AR. Read every frame by the Stage. */
export const view = createStore({
  az: 180, alt: 35, fov: coarse ? 75 : 95,
  sel: null as Obj | null,
  ar: 'off' as ArStatus,
  /** heading fine-tune in AR (deg, positive = clockwise); persists */
  arYaw: (() => { try { return Number(globalThis.localStorage?.getItem('periapsis.skyview.yaw.v1')) || 0 } catch { return 0 } })(),
  /** a hint line over the sky (AR calibration, "below the horizon", ...) */
  hint: '' as string,
})
export const useView = view.useStore
export const saveYaw = () => { try { globalThis.localStorage?.setItem('periapsis.skyview.yaw.v1', String(view.get().arYaw)) } catch { /* ignore */ } }
