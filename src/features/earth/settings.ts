// Persisted Earth layer settings ('periapsis.earth.v1'). Only the user's own choices are stored, so the tier defaults keep applying
// to everything they did not touch.
import { createStore } from '../../lib/mini-store.ts'
import type { Layers, Quality } from './tier.ts'

export const EARTH_KEY = 'periapsis.earth.v1'
export type DetailMode = 'auto' | 'on' | 'off'
export type EarthSettings = { quality: Quality; custom: Partial<Layers>; detail: DetailMode }
const LAYER_KEYS: (keyof Layers)[] = ['clouds', 'nightLights', 'atmosphere', 'coast', 'borders', 'cities']
const QUALITIES: Quality[] = ['auto', 'low', 'mid', 'high']

export function parseSettings(raw: string | null | undefined): EarthSettings {
  const out: EarthSettings = { quality: 'auto', custom: {}, detail: 'auto' }
  if (!raw) return out
  try {
    const o = JSON.parse(raw)
    if (QUALITIES.includes(o?.quality)) out.quality = o.quality
    if (o?.detail === 'on' || o?.detail === 'off') out.detail = o.detail
    for (const k of LAYER_KEYS) if (typeof o?.custom?.[k] === 'boolean') out.custom[k] = o.custom[k]
  } catch { /* corrupt entry: defaults */ }
  return out
}

function readStorage(): string | null {
  try { return globalThis.localStorage?.getItem(EARTH_KEY) ?? null } catch { return null }
}

export const earthSettings = createStore<EarthSettings>(parseSettings(readStorage()))

function save(s: EarthSettings) {
  try { globalThis.localStorage?.setItem(EARTH_KEY, JSON.stringify(s)) } catch { /* private mode / quota */ }
}

export function setLayer(k: keyof Layers, v: boolean) {
  earthSettings.set((s) => ({ custom: { ...s.custom, [k]: v } }))
  save(earthSettings.get())
}
export function setQuality(quality: Quality) {
  earthSettings.set({ quality })
  save(earthSettings.get())
}
export function setDetail(detail: DetailMode) {
  earthSettings.set({ detail })
  save(earthSettings.get())
}
