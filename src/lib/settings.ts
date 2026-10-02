import { createStore } from './mini-store.ts'

const KEY = 'periapsis.settings.v1'

export type Lang = 'nl' | 'en' | 'el'
const detectLang = (): Lang => { const l = (globalThis.navigator?.language ?? 'nl').slice(0, 2).toLowerCase(); return l === 'el' ? 'el' : l === 'en' ? 'en' : 'nl' }

export interface Settings {
  showLabels: boolean
  /** true = planets at their real size, false = magnified (the store's `magnify` factor) */
  trueScale: boolean
  /** index into SPEEDS (store.ts) the clock starts at and returns to */
  speedIdx: number
  reduceMotion: boolean
  keepAwake: boolean
  haptics: boolean
  lang: Lang
}

export const SPEED_COUNT = 6 // = SPEEDS.length in store.ts (kept as a number so this module stays store-free and testable)

export const defaultSettings = (): Settings => ({
  showLabels: true,
  trueScale: true,
  speedIdx: 0,
  reduceMotion: !!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
  keepAwake: false,
  haptics: true,
  lang: detectLang(),
})

/** Merge untrusted stored JSON over the defaults, dropping anything of the wrong type or out of range. */
export function normalize(raw: unknown): Settings {
  const d = defaultSettings(), r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const bool = (k: 'showLabels' | 'trueScale' | 'reduceMotion' | 'keepAwake' | 'haptics') => (typeof r[k] === 'boolean' ? (r[k] as boolean) : d[k])
  const idx = Number.isInteger(r.speedIdx) && (r.speedIdx as number) >= 0 && (r.speedIdx as number) < SPEED_COUNT ? (r.speedIdx as number) : d.speedIdx
  return { showLabels: bool('showLabels'), trueScale: bool('trueScale'), speedIdx: idx, reduceMotion: bool('reduceMotion'), keepAwake: bool('keepAwake'), haptics: bool('haptics'), lang: r.lang === 'nl' || r.lang === 'en' || r.lang === 'el' ? r.lang : d.lang }
}

function read(): Settings {
  try { return normalize(JSON.parse(globalThis.localStorage?.getItem(KEY) ?? 'null')) } catch { return defaultSettings() }
}
function write(s: Settings) {
  try { globalThis.localStorage?.setItem(KEY, JSON.stringify(s)) } catch { /* private mode: settings just don't survive a restart */ }
}

export const settings = createStore<Settings>(read())
export const useSettings = settings.useStore

export function setSetting<K extends keyof Settings>(k: K, v: Settings[K]) {
  settings.set({ [k]: v } as Partial<Settings>)
  write(settings.get())
}
/** Forget everything saved (settings only; the tour/update flags are separate) and go back to the defaults. */
export function resetSettings() {
  try { globalThis.localStorage?.removeItem(KEY) } catch { /* ignore */ }
  settings.set(defaultSettings())
}
