// The JS-computed part of the notifications: sky events, visible ISS passes and the daily "tonight" summary for the next ~10 days.
// Pure (no Capacitor, no storage) so it runs under node --test. The result is scheduled by sync.ts: Android local notifications, or a timer queue on Windows.
import { compassIdx, skyNight, solarNoon, type NightInfo, type Site } from '../tonight/sky.ts'
import { buildEvents, localView, lunarVisibility, solarVisibility, type SkyEvent } from '../tonight/events.ts'
import { dateTime, localISO, parseISO, shiftISO, timeStr } from '../tonight/fmt.ts'
import { eventTitle, tr } from '../tonight/eventTitle.ts'
import { notificationId, planReminder } from '../tonight/reminderPlan.ts'
import { findPasses, type Pass } from '../satellites/passes.ts'
import { satrecOf, type SatRecord } from '../satellites/tle.ts'
import { LABELS } from '../widgets/texts.ts'
import { NOTIF, type L } from './texts.ts'
import type { AlertSettings } from './settings.ts'

export const HORIZON_DAYS = 10
/** Android keeps pending alarms cheaply but a long list is noise: never schedule more than this many from here (the agenda bell reminders are separate). */
export const MAX_SCHEDULED = 50
const DAY = 86400000, MIN = 60e3
const MIN_AHEAD = 30e3

export interface Planned {
  /** stable text key (category + date), the notification id is derived from it */
  key: string
  id: number
  at: number
  title: string
  body: string
  /** where a tap goes: periapsis://open/<mode>/<tab> */
  link: string
  /** the moment the notification is about; used to drop it when quiet hours would push it past the event */
  eventMs: number
}

const tx = (lang: L, k: string, v: Record<string, string | number> = {}) => {
  let s = NOTIF[lang][k] ?? NOTIF.nl[k] ?? k
  for (const n in v) s = s.replaceAll(`{${n}}`, String(v[n]))
  return s
}

const hm = (s: string) => { const [h, m] = s.split(':').map(Number); return h * 60 + m }
/** Is this instant inside the (overnight) quiet period? Device-local clock. */
export function inQuiet(q: AlertSettings['quiet'], ms: number): boolean {
  if (!q.on) return false
  const a = hm(q.from), b = hm(q.to)
  if (a === b) return false
  const d = new Date(ms), m = d.getHours() * 60 + d.getMinutes()
  return a < b ? m >= a && m < b : m >= a || m < b
}
/** First moment >= ms that is not quiet. */
export function afterQuiet(q: AlertSettings['quiet'], ms: number): number {
  if (!inQuiet(q, ms)) return ms
  const d = new Date(ms), b = hm(q.to)
  const end = new Date(d.getFullYear(), d.getMonth(), d.getDate(), Math.floor(b / 60), b % 60, 0, 0).getTime()
  return end > ms ? end : end + DAY
}

const atLocal = (iso: string, hhmm: string) => { const { y, m, d } = parseISO(iso); const [h, mi] = hhmm.split(':').map(Number); return new Date(y, m - 1, d, h, mi, 0, 0).getTime() }
const nightOf = (site: Site, iso: string): NightInfo => {
  const a = parseISO(iso), b = parseISO(shiftISO(iso, 1))
  return skyNight(site, solarNoon(a.y, a.m, a.d, site.lon), solarNoon(b.y, b.m, b.d, site.lon))
}

export interface PlanInput { s: AlertSettings; site: Site; now: number; lang: L; iss?: SatRecord | null }

/** Sky events the user may care about, filtered by the per-kind switches (`all` = ignore the switches, for the summary). */
function pickEvents(s: AlertSettings, site: Site, now: number, all: boolean): SkyEvent[] {
  const k = s.sky
  return buildEvents(now, 1).filter((e) => {
    if (e.ms <= now || e.ms > now + HORIZON_DAYS * DAY) return false
    switch (e.kind) {
      case 'meteor': return all || k.meteor
      case 'solar': return (all || k.eclipse) && solarVisibility(e.eclipse!, site).visible
      case 'lunar': return (all || k.eclipse) && lunarVisibility(e.eclipse!, site).state !== 'none'
      case 'conj': return (all || k.conj) && localView(e, site)?.state === 'ok'
      case 'moon': return (all || k.moon) && (e.phase === 'full' || e.phase === 'new')
      case 'opp': return all || k.opp
      default: return false
    }
  })
}

export function buildPlan(inp: PlanInput): Planned[] {
  const { s, site, now, lang } = inp
  const out: Omit<Planned, 'id'>[] = []
  const push = (key: string, at: number, eventMs: number, title: string, body: string, link: string) => {
    const t = afterQuiet(s.quiet, at)
    if (t >= eventMs || t < now + MIN_AHEAD) return // quiet hours would push it past the moment itself (or it is already over)
    out.push({ key, at: t, eventMs, title, body, link })
  }
  const dir = (az: number) => tr(lang, `sky.dir.${compassIdx(az)}`)

  // visible ISS passes in the window (also used by the summary)
  const sr = inp.iss ? satrecOf(inp.iss) : null
  const passes: Pass[] = !sr ? [] : findPasses(sr, site, now, HORIZON_DAYS, 10).filter((p) => p.visible && p.setMs > now)

  if (s.sky.on) {
    for (const ev of pickEvents(s, site, now, false)) {
      const at = planReminder(ev.ms, 'eve', now)
      if (at != null) push(`ev:${ev.id}`, at, ev.ms, eventTitle(lang, ev), dateTime(ev.ms, lang), 'periapsis://open/sky/events')
    }
    if (s.sky.iss) {
      const bestPerDay = new Map<string, Pass>()
      for (const p of passes) { const d = localISO(p.riseMs), b = bestPerDay.get(d); if (!b || p.maxEl > b.maxEl) bestPerDay.set(d, p) }
      for (const [d, p] of bestPerDay) {
        const at = Math.max(p.riseMs - 10 * MIN, now + MIN_AHEAD)
        if (p.riseMs - at < 2 * MIN) continue
        push(`iss:${d}`, at, p.riseMs, tx(lang, 'iss_title', { min: Math.round((p.riseMs - at) / MIN) }),
          tx(lang, 'iss_body', { from: dir(p.riseAz), to: dir(p.setAz), el: Math.round(p.maxEl), time: timeStr(p.maxMs, lang) }), 'periapsis://open/explore/passes')
      }
    }
  }

  const slots: { name: 'morning' | 'evening'; time: string }[] = []
  if (s.summary.morning) slots.push({ name: 'morning', time: s.summary.morningTime })
  if (s.summary.evening) slots.push({ name: 'evening', time: s.summary.eveningTime })
  if (slots.length) {
    const events = pickEvents(s, site, now, true)
    for (let i = 0; i < HORIZON_DAYS; i++) {
      const iso = shiftISO(localISO(now), i)
      const due = slots.filter((x) => atLocal(iso, x.time) >= now + MIN_AHEAD)
      if (!due.length) continue
      const n = nightOf(site, iso)
      const start = n.sunset ?? n.start, end = n.sunrise ?? n.end
      const parts: string[] = []
      const pl = n.planets.filter((p) => p.visible).sort((a, b) => a.mag - b.mag).slice(0, 4).map((p) => tr(lang, `sky.p.${p.id}`))
      parts.push(pl.length ? pl.join(', ') : tx(lang, 'sum_none'))
      parts.push(`${LABELS[lang][`phase${n.moon.idx}`]} ${Math.round(n.moon.illum * 100)}%`)
      const pass = passes.filter((p) => p.riseMs >= start - 3600e3 && p.riseMs <= end).sort((a, b) => b.maxEl - a.maxEl)[0]
      if (pass) parts.push(tx(lang, 'sum_iss', { time: timeStr(pass.maxMs, lang), el: Math.round(pass.maxEl) }))
      for (const e of events) if (e.ms >= start - 3600e3 && e.ms <= end) parts.push(eventTitle(lang, e))
      for (const x of due) push(`sum:${x.name}:${iso}`, atLocal(iso, x.time), end, tx(lang, 'sum_title'), parts.join(' · '), 'periapsis://open/sky/tonight')
    }
  }

  out.sort((a, b) => a.at - b.at)
  const used = new Set<number>()
  return out.slice(0, MAX_SCHEDULED).map((o) => {
    let id = notificationId('alerts:' + o.key)
    while (used.has(id)) id = (id % 2147483646) + 1
    used.add(id)
    return { ...o, id }
  })
}
