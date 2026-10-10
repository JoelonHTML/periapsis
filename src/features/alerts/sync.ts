// Runtime glue for notifications. Three worlds:
//  - Android app: the native worker (plugin PeriapsisAlerts) does the space-weather + launch checks; JS schedules the computed sky/ISS/summary notifications
//    through @capacitor/local-notifications.
//  - Windows app: the Electron main process polls (desktop/alerts-logic.cjs); JS keeps a timer queue for the computed notifications and asks main to show them.
//  - Browser: only the permission/test button works (Notification API while the page is open).
import { Capacitor, registerPlugin } from '@capacitor/core'
import { App } from '@capacitor/app'
import { LocalNotifications } from '@capacitor/local-notifications'
import { observer } from '@/lib/observer'
import { settings } from '@/lib/settings'
import { desktop } from '@/lib/desktop'
import { openMode } from '@/lib/ui-store'
import { createStore } from '@/lib/mini-store'
import { readCache } from '../satellites/data'
import { parseDeepLink } from '../widgets/links'
import { alerts, anyOn, buildConfig } from './settings'
import { buildPlan, type Planned } from './plan'
import { NOTIF } from './texts'

interface Native {
  configure(o: { json: string }): Promise<void>
  checkNow(o?: { test?: boolean }): Promise<void>
  status(): Promise<{ scheduled: boolean; lastRun: number | null; lastError: string | null; notificationsAllowed: boolean }>
  requestPermission(): Promise<{ granted: boolean }>
}
const native = registerPlugin<Native>('PeriapsisAlerts')
export const nativeAvailable = () => { try { return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('PeriapsisAlerts') } catch { return false } }
const isNative = () => Capacitor.isNativePlatform()

export interface AlertsStatus { perm: 'unknown' | 'granted' | 'denied' | 'unsupported'; lastRun: number | null; lastError: string | null; scheduled: number }
export const alertsStatus = createStore<AlertsStatus>({ perm: 'unknown', lastRun: null, lastError: null, scheduled: 0 })

const SCHED_KEY = 'periapsis.alerts.sched.v1'
const readIds = (): number[] => { try { const a = JSON.parse(localStorage.getItem(SCHED_KEY) ?? '[]'); return Array.isArray(a) ? a.filter(Number.isInteger) : [] } catch { return [] } }
const writeIds = (ids: number[]) => { try { localStorage.setItem(SCHED_KEY, JSON.stringify(ids)) } catch { /* ignore */ } }

const lang = () => settings.get().lang
const site = () => { const o = observer.get(); return { lat: o.lat, lon: o.lon, name: o.name || undefined } }

/** Permission + native background-check status -> alertsStatus. Never prompts. */
export async function refreshStatus(): Promise<void> {
  try {
    if (isNative()) {
      if (nativeAvailable()) {
        const st = await native.status()
        alertsStatus.set({ perm: st.notificationsAllowed ? 'granted' : 'denied', lastRun: st.lastRun, lastError: st.lastError })
      } else {
        const p = await LocalNotifications.checkPermissions()
        alertsStatus.set({ perm: p.display === 'granted' ? 'granted' : 'denied' })
      }
    } else if (desktop()?.alertsStatus) {
      const st = await desktop()!.alertsStatus!()
      alertsStatus.set({ perm: 'granted', lastRun: st.lastRun, lastError: st.lastError })
    } else {
      alertsStatus.set({ perm: typeof Notification === 'undefined' ? 'unsupported' : Notification.permission === 'granted' ? 'granted' : Notification.permission === 'denied' ? 'denied' : 'unknown' })
    }
  } catch { /* leave as is */ }
}

/** Ask for the notification permission (system prompt on Android 13+ / browser). Resolves whether it is granted. */
export async function requestPermission(): Promise<boolean> {
  try {
    let ok = false
    if (isNative()) {
      const p = await LocalNotifications.requestPermissions()
      ok = p.display === 'granted'
      if (nativeAvailable()) ok = (await native.requestPermission()).granted || ok
    } else if (desktop()?.alertsStatus) ok = true
    else if (typeof Notification !== 'undefined') ok = (await Notification.requestPermission()) === 'granted'
    await refreshStatus()
    if (ok) scheduleAlerts(0)
    return ok
  } catch { return false }
}

/** A notification right now, through whichever path this platform has. */
export async function testNotification(): Promise<boolean> {
  const t = NOTIF[lang()]
  try {
    if (isNative()) {
      if (!(await requestPermission())) return false
      if (nativeAvailable()) { await native.configure({ json: JSON.stringify(buildConfig(alerts.get().s, lang(), site())) }); await native.checkNow({ test: true }); return true }
      await ensureChannel()
      await LocalNotifications.schedule({ notifications: [{ id: 2000000001, title: t.test_title, body: t.test_body, schedule: { at: new Date(Date.now() + 2000), allowWhileIdle: true }, channelId: 'sky', extra: { link: 'periapsis://open/sky/live' } }] })
      return true
    }
    const d = desktop()
    if (d?.notify) return await d.notify({ title: t.test_title, body: t.test_body, link: 'periapsis://open/sky/live' })
    if (typeof Notification !== 'undefined' && (await Notification.requestPermission()) === 'granted') { new Notification(t.test_title, { body: t.test_body }); return true }
  } catch { /* fall through */ }
  return false
}

let channelDone = false
async function ensureChannel() {
  if (channelDone) return
  try { await LocalNotifications.createChannel({ id: 'sky', name: NOTIF[lang()].channel_sky, importance: 3, visibility: 1 }); channelDone = true } catch { /* iOS / old plugin */ }
}

// ---- computed notifications (sky events, ISS, summary)
const timers = new Map<number, ReturnType<typeof setTimeout>>()
let seq = 0

function planNow(): Planned[] {
  const s = alerts.get().s, o = observer.get()
  if (!s.sky.on && !s.summary.morning && !s.summary.evening) return []
  const iss = readCache(localStorage, 'stations')?.sats.find((x) => x.norad === 25544) ?? null
  return buildPlan({ s, site: { lat: o.lat, lon: o.lon, altM: o.altM }, now: Date.now(), lang: lang(), iss })
}

async function applyNative(plan: Planned[]) {
  const old = readIds()
  if (old.length) { try { await LocalNotifications.cancel({ notifications: old.map((id) => ({ id })) }) } catch { /* gone */ } }
  writeIds([])
  if (!plan.length) return
  const p = await LocalNotifications.checkPermissions()
  if (p.display !== 'granted') return
  await ensureChannel()
  await LocalNotifications.schedule({ notifications: plan.map((x) => ({ id: x.id, title: x.title, body: x.body, schedule: { at: new Date(x.at), allowWhileIdle: true }, channelId: 'sky', extra: { link: x.link } })) })
  writeIds(plan.map((x) => x.id))
}

function applyDesktop(plan: Planned[]) {
  for (const t of timers.values()) clearTimeout(t)
  timers.clear()
  const d = desktop()
  if (!d?.notify) return
  for (const x of plan) {
    const wait = x.at - Date.now()
    if (wait < 0 || wait > 2 ** 31 - 1) continue
    timers.set(x.id, setTimeout(() => { timers.delete(x.id); void d.notify!({ title: x.title, body: x.body, link: x.link }) }, wait))
  }
}

/** Recompute and (re)schedule everything; also pushes the config to the native worker / desktop poller. */
export async function syncAlerts(): Promise<void> {
  const s = alerts.get().s, id = ++seq
  try {
    const plan = anyOn(s) ? planNow() : []
    if (id !== seq) return // a newer change superseded this run
    alertsStatus.set({ scheduled: plan.length })
    if (isNative()) {
      await applyNative(plan)
      if (nativeAvailable()) await native.configure({ json: JSON.stringify(buildConfig(s, lang(), site())) })
    } else if (desktop()?.alertsConfig) {
      applyDesktop(plan)
      await desktop()!.alertsConfig!({ config: buildConfig(s, lang(), site()), trayOn: anyOn(s), autostart: s.autostart })
    }
    await refreshStatus()
  } catch { /* best effort: the next change or start retries */ }
}

let timer: ReturnType<typeof setTimeout> | undefined
/** Debounced + deferred to idle time (the pass search is a few hundred ms of work). */
export function scheduleAlerts(delay = 1500) {
  if (!isNative() && !desktop()?.alertsConfig) return
  clearTimeout(timer)
  timer = setTimeout(() => {
    const run = () => { void syncAlerts() }
    const ric = (globalThis as { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => void }).requestIdleCallback
    if (ric) ric(run, { timeout: 5000 }); else run()
  }, delay)
}

export async function checkNow(): Promise<void> {
  try {
    if (nativeAvailable()) await native.checkNow()
    else await desktop()?.alertsCheckNow?.()
  } catch { /* shown through status */ }
  await refreshStatus()
}

function openLink(link: string | null | undefined) {
  const l = parseDeepLink(link)
  if (l) openMode(l.mode, l.tab)
}

/** Called once at startup. */
export function initAlerts() {
  const d = desktop()
  if (d?.onNavigate) d.onNavigate(openLink)
  if (!isNative() && !d?.alertsConfig) return
  scheduleAlerts(3000)
  setInterval(() => scheduleAlerts(0), 6 * 3600_000) // a long-running tray app keeps its 10-day horizon rolling
  let l = lang()
  settings.subscribe(() => { if (lang() !== l) { l = lang(); scheduleAlerts() } })
  observer.subscribe(() => scheduleAlerts())
  alerts.subscribe(() => scheduleAlerts())
  if (isNative()) {
    void LocalNotifications.addListener('localNotificationActionPerformed', (e) => openLink((e.notification.extra as { link?: string } | undefined)?.link)).catch(() => {})
    void App.addListener('appStateChange', (s) => { if (s.isActive) { scheduleAlerts(500); void refreshStatus() } }).catch(() => {})
  }
}
