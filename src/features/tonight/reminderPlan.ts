// When should a reminder fire? Pure logic (no Capacitor), shared by the UI and the tests.
export type Lead = 'eve' | 'hour'
export const HOUR_MS = 3600e3
const MIN_AHEAD = 30e3

/** Local 19:00 on the calendar day before the event (device time zone). */
export function eveningBefore(eventMs: number): number {
  const d = new Date(eventMs)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1, 19, 0, 0, 0).getTime()
}

/**
 * Fire time for a reminder, or null when the event is (almost) over.
 * 'eve' = 19:00 the evening before, 'hour' = one hour before. When the preferred moment has already passed but the event is still
 * more than an hour away the 1-hour lead is used; when it is closer than that the reminder fires in a minute.
 */
export function planReminder(eventMs: number, lead: Lead, nowMs: number): number | null {
  if (eventMs - nowMs < 2 * 60e3) return null
  const pref = lead === 'eve' ? eveningBefore(eventMs) : eventMs - HOUR_MS
  if (pref >= nowMs + MIN_AHEAD) return pref
  const hour = eventMs - HOUR_MS
  if (hour >= nowMs + MIN_AHEAD) return hour
  return nowMs + 60e3
}

/** Stable positive 31-bit notification id derived from the event id. */
export function notificationId(eventId: string): number {
  let h = 5381
  for (let i = 0; i < eventId.length; i++) h = ((h << 5) + h + eventId.charCodeAt(i)) | 0
  return (Math.abs(h) % 2147483646) + 1
}
