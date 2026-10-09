// Runtime glue for the Android home-screen widgets: builds the snapshot lazily and hands it to the native plugin; handles widget deep links.
// Everything here is a no-op outside the native app.
import { Capacitor, registerPlugin } from '@capacitor/core'
import { App } from '@capacitor/app'
import { observer } from '@/lib/observer'
import { settings } from '@/lib/settings'
import { openMode } from '@/lib/ui-store'
import { createStore } from '@/lib/mini-store'
import { readCache } from '../satellites/data'
import type { Launch } from '../live/launches'
import type { KpRow } from '../live/spaceweather'
import { buildSnapshot, DEFAULT_ALPHA } from './snapshot'
import { parseDeepLink } from './links'

interface Plugin {
  update(o: { json: string }): Promise<void>
  requestPin(o: { kind: string }): Promise<{ ok: boolean }>
  isSupported(): Promise<{ pin: boolean }>
}
const plugin = registerPlugin<Plugin>('PeriapsisWidgets')
export const widgetsAvailable = () => { try { return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('PeriapsisWidgets') } catch { return false } }

/** Widget kinds, in the order they are offered. */
export const WIDGET_KINDS = ['planets', 'moon', 'sun', 'tonight', 'events', 'iss', 'launch', 'kp'] as const

const KEY = 'periapsis.widgets.v1'
const loadAlpha = () => { try { const a = JSON.parse(localStorage.getItem(KEY) ?? '{}').alpha; return typeof a === 'number' && a >= 0 && a <= 1 ? a : DEFAULT_ALPHA } catch { return DEFAULT_ALPHA } }
export const widgetPrefs = createStore({ alpha: loadAlpha() })
export function setWidgetAlpha(alpha: number) {
  widgetPrefs.set({ alpha })
  try { localStorage.setItem(KEY, JSON.stringify({ alpha })) } catch { /* ignore */ }
}

const cachedNet = <T>(key: string): T | null => { try { return JSON.parse(localStorage.getItem('periapsis.net.' + key) ?? 'null')?.v ?? null } catch { return null } }

export function pinWidget(kind: string): Promise<boolean> { return plugin.requestPin({ kind }).then((r) => !!r.ok, () => false) }
export function pinSupported(): Promise<boolean> { return plugin.isSupported().then((r) => !!r.pin, () => false) }

/** Build and push the snapshot now (only when the native plugin exists). Resolves false when nothing was sent. */
export async function syncWidgets(): Promise<boolean> {
  if (!widgetsAvailable()) return false
  try {
    const o = observer.get()
    const launches = cachedNet<Launch[]>('live.launches'), kp = cachedNet<KpRow[]>('live.kp')
    const iss = readCache(localStorage, 'stations')?.sats.find((s) => s.norad === 25544) ?? null
    const snap = buildSnapshot({
      site: { lat: o.lat, lon: o.lon, altM: o.altM, name: o.name || null }, now: Date.now(), lang: settings.get().lang, alpha: widgetPrefs.get().alpha,
      iss, launches: Array.isArray(launches) ? launches : null, kp: Array.isArray(kp) ? kp : null,
    })
    await plugin.update({ json: JSON.stringify(snap) })
    return true
  } catch { return false }
}

let timer: ReturnType<typeof setTimeout> | undefined
/** Debounced + deferred to idle time so the main thread is never blocked while the user interacts. */
export function scheduleSync(delay = 1500) {
  if (!widgetsAvailable()) return
  clearTimeout(timer)
  timer = setTimeout(() => {
    const run = () => { void syncWidgets() }
    const ric = (globalThis as { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => void }).requestIdleCallback
    if (ric) ric(run, { timeout: 5000 }); else run()
  }, delay)
}

function openLink(url: string | null | undefined) {
  const l = parseDeepLink(url)
  if (l) openMode(l.mode, l.tab)
}

/** Called once at startup. */
export function initWidgets() {
  if (!Capacitor.isNativePlatform()) return
  void App.getLaunchUrl().then((r) => openLink(r?.url)).catch(() => {})
  void App.addListener('appUrlOpen', (e) => openLink(e.url)).catch(() => {})
  if (!widgetsAvailable()) return
  scheduleSync(3000)
  void App.addListener('appStateChange', (s) => { if (s.isActive) scheduleSync(500) }).catch(() => {})
  setInterval(() => scheduleSync(0), 30 * 60_000)
  let lang = settings.get().lang
  settings.subscribe(() => { const l = settings.get().lang; if (l !== lang) { lang = l; scheduleSync() } })
  observer.subscribe(() => scheduleSync())
  widgetPrefs.subscribe(() => scheduleSync(800))
}
