// Notification settings (localStorage `periapsis.alerts.v1`) and the config JSON for the native worker / desktop poller (contract v1). Pure apart from the store.
import { createStore } from '../../lib/mini-store.ts'
import { NOTIF, type L } from './texts.ts'

export const KEY = 'periapsis.alerts.v1'

/**
 * Opt-in defaults: EVERYTHING is off until the user switches a category on. When a category is switched on its sub-options already hold these sensible values:
 * storm from G2 (Kp 6), aurora chance >= 30 % at my place, storm watches on, flares/CME/radio off (noisy), sky: all kinds on, launches 60 min ahead,
 * summary evening 19:00 (morning 08:00 off), quiet hours 23:00-07:00 but off.
 */
export interface AlertSettings {
  v: 1
  spaceweather: { on: boolean; kpMin: number; aurora: boolean; auroraMin: number; flareMin: 'off' | 'M' | 'X'; cme: boolean; radio: boolean; watches: boolean }
  sky: { on: boolean; iss: boolean; meteor: boolean; eclipse: boolean; conj: boolean; moon: boolean; opp: boolean }
  launches: { on: boolean; leadMin: 15 | 30 | 60 | 120 }
  summary: { morning: boolean; morningTime: string; evening: boolean; eveningTime: string }
  quiet: { on: boolean; from: string; to: string }
  /** Windows only: start Periapsis with Windows (opt-in). */
  autostart: boolean
}
export const defaults = (): AlertSettings => ({
  v: 1,
  spaceweather: { on: false, kpMin: 6, aurora: true, auroraMin: 30, flareMin: 'off', cme: false, radio: false, watches: true },
  sky: { on: false, iss: true, meteor: true, eclipse: true, conj: true, moon: true, opp: true },
  launches: { on: false, leadMin: 60 },
  summary: { morning: false, morningTime: '08:00', evening: false, eveningTime: '19:00' },
  quiet: { on: false, from: '23:00', to: '07:00' },
  autostart: false,
})

const bool = (x: unknown, d: boolean) => (typeof x === 'boolean' ? x : d)
const time = (x: unknown, d: string) => (typeof x === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(x) ? x : d)
const pick = <T,>(x: unknown, ok: readonly T[], d: T): T => (ok.includes(x as T) ? (x as T) : d)
const rec = (x: unknown): Record<string, unknown> => (x && typeof x === 'object' ? (x as Record<string, unknown>) : {})

/** Tolerant reader: unknown / missing / out-of-range fields fall back to the defaults. */
export function normalize(raw: unknown): AlertSettings {
  const d = defaults(), r = rec(raw), sw = rec(r.spaceweather), sk = rec(r.sky), la = rec(r.launches), su = rec(r.summary), q = rec(r.quiet)
  return {
    v: 1,
    spaceweather: {
      on: bool(sw.on, d.spaceweather.on), kpMin: pick(sw.kpMin, [5, 6, 7, 8, 9], d.spaceweather.kpMin), aurora: bool(sw.aurora, d.spaceweather.aurora),
      auroraMin: pick(sw.auroraMin, [10, 20, 30, 50, 70], d.spaceweather.auroraMin), flareMin: pick(sw.flareMin, ['off', 'M', 'X'] as const, d.spaceweather.flareMin),
      cme: bool(sw.cme, d.spaceweather.cme), radio: bool(sw.radio, d.spaceweather.radio), watches: bool(sw.watches, d.spaceweather.watches),
    },
    sky: {
      on: bool(sk.on, d.sky.on), iss: bool(sk.iss, d.sky.iss), meteor: bool(sk.meteor, d.sky.meteor), eclipse: bool(sk.eclipse, d.sky.eclipse),
      conj: bool(sk.conj, d.sky.conj), moon: bool(sk.moon, d.sky.moon), opp: bool(sk.opp, d.sky.opp),
    },
    launches: { on: bool(la.on, false), leadMin: pick(la.leadMin, [15, 30, 60, 120] as const, 60) },
    summary: { morning: bool(su.morning, false), morningTime: time(su.morningTime, d.summary.morningTime), evening: bool(su.evening, false), eveningTime: time(su.eveningTime, d.summary.eveningTime) },
    quiet: { on: bool(q.on, false), from: time(q.from, d.quiet.from), to: time(q.to, d.quiet.to) },
    autostart: bool(r.autostart, false),
  }
}

const read = (): AlertSettings => { try { return normalize(JSON.parse(globalThis.localStorage?.getItem(KEY) ?? 'null')) } catch { return defaults() } }
export const alerts = createStore<{ s: AlertSettings }>({ s: read() })
export const useAlerts = <S,>(sel: (s: AlertSettings) => S): S => alerts.useStore((x) => sel(x.s))
export function updateAlerts(patch: (s: AlertSettings) => AlertSettings) {
  const s = normalize(patch(alerts.get().s))
  alerts.set({ s })
  try { globalThis.localStorage?.setItem(KEY, JSON.stringify(s)) } catch { /* ignore */ }
}

/** Does anything need to run in the background (tray / worker)? */
export const anyOn = (s: AlertSettings) => s.spaceweather.on || s.sky.on || s.launches.on || s.summary.morning || s.summary.evening

export interface Config {
  v: 1; lang: L
  site: { lat: number; lon: number; name?: string } | null
  spaceweather: { on: boolean; kpMin: number; aurora: boolean; auroraMin: number; flareMin: 'M' | 'X' | 'off'; cme: boolean; radio: boolean; watches: boolean }
  launches: { on: boolean; leadMin: number }
  quiet: { on: boolean; from: string; to: string }
  texts: Record<string, string>
}
/** The JSON handed to the native worker (configure) and the Windows poller. `site` is only sent when an aurora check needs it (or always: the observer is not secret). */
export function buildConfig(s: AlertSettings, lang: L, site: { lat: number; lon: number; name?: string } | null): Config {
  return {
    v: 1, lang,
    site: site ? { lat: Math.round(site.lat * 1000) / 1000, lon: Math.round(site.lon * 1000) / 1000, ...(site.name ? { name: site.name } : {}) } : null,
    spaceweather: { ...s.spaceweather },
    launches: { on: s.launches.on, leadMin: s.launches.leadMin },
    quiet: { ...s.quiet },
    texts: NOTIF[lang],
  }
}
