// Reminders for agenda events via @capacitor/local-notifications (Android app). On the web nothing can be scheduled while the page is closed.
// Scheduling is deliberately inexact (`allowWhileIdle`): Android 12+ may deny exact alarms and a reminder a few minutes late is fine.
import { Capacitor } from '@capacitor/core'
import { LocalNotifications } from '@capacitor/local-notifications'
import { createStore } from '../../lib/mini-store.ts'
import { notificationId, planReminder, type Lead } from './reminderPlan.ts'

const KEY = 'periapsis.sky.reminders.v1'
const LEAD_KEY = 'periapsis.sky.lead.v1'

export interface Reminder { id: string; nid: number; at: number; eventMs: number; title: string }

function load(): Reminder[] {
  try {
    const a = JSON.parse(globalThis.localStorage?.getItem(KEY) ?? '[]')
    if (Array.isArray(a)) return a.filter((r) => r && typeof r.id === 'string' && Number.isFinite(r.nid) && Number.isFinite(r.at) && r.at > Date.now())
  } catch { /* ignore */ }
  return []
}
export const reminders = createStore<{ items: Reminder[]; lead: Lead }>({
  items: load(),
  lead: (() => { try { return globalThis.localStorage?.getItem(LEAD_KEY) === 'hour' ? 'hour' : 'eve' } catch { return 'eve' } })(),
})
export const useReminders = reminders.useStore
const persist = () => { try { globalThis.localStorage?.setItem(KEY, JSON.stringify(reminders.get().items)) } catch { /* ignore */ } }
export function setLead(lead: Lead) {
  reminders.set({ lead })
  try { globalThis.localStorage?.setItem(LEAD_KEY, lead) } catch { /* ignore */ }
}
export const remindersWork = () => Capacitor.isNativePlatform()

export type ReminderResult = 'ok' | 'web' | 'denied' | 'past' | 'error'

/** Schedule a reminder for an event (asks for the notification permission on first use). */
export async function addReminder(ev: { id: string; ms: number }, title: string, body: string): Promise<ReminderResult> {
  if (!remindersWork()) return 'web'
  const at = planReminder(ev.ms, reminders.get().lead, Date.now())
  if (at == null) return 'past'
  try {
    let p = await LocalNotifications.checkPermissions()
    if (p.display !== 'granted') p = await LocalNotifications.requestPermissions()
    if (p.display !== 'granted') return 'denied'
    const nid = notificationId(ev.id)
    await LocalNotifications.schedule({
      notifications: [{ id: nid, title, body, schedule: { at: new Date(at), allowWhileIdle: true }, extra: { eventId: ev.id } }],
    })
    reminders.set((s) => ({ items: [...s.items.filter((r) => r.id !== ev.id), { id: ev.id, nid, at, eventMs: ev.ms, title }] }))
    persist()
    return 'ok'
  } catch {
    return 'error'
  }
}

export async function removeReminder(id: string): Promise<void> {
  const r = reminders.get().items.find((x) => x.id === id)
  reminders.set((s) => ({ items: s.items.filter((x) => x.id !== id) }))
  persist()
  if (!r || !remindersWork()) return
  try { await LocalNotifications.cancel({ notifications: [{ id: r.nid }] }) } catch { /* already gone */ }
}

/** Drop stored reminders that Android no longer has pending (fired, cleared by the OS or app data). */
export async function syncReminders(): Promise<void> {
  const now = Date.now()
  let items = reminders.get().items.filter((r) => r.at > now)
  if (remindersWork()) {
    try {
      const pending = new Set((await LocalNotifications.getPending()).notifications.map((n) => n.id))
      items = items.filter((r) => pending.has(r.nid))
    } catch { /* keep the stored list */ }
  }
  if (items.length !== reminders.get().items.length) { reminders.set({ items }); persist() }
}
