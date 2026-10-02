import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Bell, BellRing, CalendarDays, Eclipse, Orbit, Sparkles, Sun } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useT } from '@/lib/i18n'
import { LocationBar, useLang, useSite } from './ui'
import { SHOWERS, buildEvents, localView, lunarVisibility, solarVisibility, type LocalView, type LunarVis, type SkyEvent, type SolarVis } from './events.ts'
import { dateTime, monthYear, num, timeStr, weekdayShort, type L } from './fmt.ts'
import { addReminder, reminders, remindersWork, removeReminder, setLead, syncReminders, useReminders } from './reminders.ts'
import { moonPath } from './moonPath.ts'

const SEL = 'border-sky-400/70 bg-sky-500/15 text-sky-100 hover:bg-sky-500/20 dark:border-sky-400/70 dark:bg-sky-500/20 dark:hover:bg-sky-500/25'
type Filter = 'all' | 'moon' | 'planets' | 'eclipse' | 'meteor' | 'season'
const FILTERS: Filter[] = ['all', 'moon', 'planets', 'eclipse', 'meteor', 'season']
const KIND_OF: Record<SkyEvent['kind'], Filter> = { moon: 'moon', conj: 'planets', opp: 'planets', elong: 'planets', solar: 'eclipse', lunar: 'eclipse', meteor: 'meteor', season: 'season' }

// The scan takes a few hundred ms on a phone: do it once per hour-aligned start and keep the result.
const cache = new Map<number, SkyEvent[]>()
function eventsNow(): SkyEvent[] {
  const start = Math.floor(Date.now() / 3600e3) * 3600e3
  let e = cache.get(start)
  if (!e) { cache.clear(); e = buildEvents(start, 12); cache.set(start, e) }
  return e
}

type Local = { v: LocalView } | { s: SolarVis } | { l: LunarVis }

interface Desc { title: string; lines: string[]; warn?: string; icon: ReactNode }

function MiniMoon({ elong }: { elong: number }) {
  const { d, mirror } = moonPath(elong, 8, false)
  return (
    <svg width="18" height="18" viewBox="-9 -9 18 18" aria-hidden className="shrink-0">
      <circle r="8" fill="#161d30" stroke="#5b6785" strokeWidth=".8" />
      <path d={d} fill="#ece8d8" transform={mirror ? 'scale(-1 1)' : undefined} />
    </svg>
  )
}

function describe(ev: SkyEvent, loc: Local | undefined, t: ReturnType<typeof useT>, lang: L): Desc {
  const time = timeStr(ev.ms, lang)
  const nm = (id: string) => t(`sky.p.${id}`)
  const sky = (evening?: boolean) => t(evening ? 'sky.sky.eve' : 'sky.sky.morn')
  const cls = 'size-[18px] shrink-0'
  switch (ev.kind) {
    case 'moon': {
      const el = { new: 0, first: 90, full: 180, last: 270 }[ev.phase!]
      return { title: t(`sky.ev.moon.${ev.phase}`), lines: [time], icon: <MiniMoon elong={el} /> }
    }
    case 'season':
      return { title: t(`sky.ev.${ev.season}`), lines: [`${time} · ${t(`sky.ev.${ev.season}.d`)}`], icon: <CalendarDays className={`${cls} text-emerald-300`} /> }
    case 'conj': {
      const lv = loc && 'v' in loc ? loc.v : null
      const here = lv ? ` · ${t(`sky.loc.${lv.state}`)}` : ''
      return { title: t('sky.ev.conj', { a: nm(ev.a!), b: nm(ev.b!) }), lines: [`${time} · ${t('sky.ev.conj.d', { sep: num(ev.sep!, 1, lang), sky: sky(ev.evening) })}${here}`], icon: <Orbit className={`${cls} text-sky-300`} /> }
    }
    case 'opp':
      return { title: t('sky.ev.opp', { p: nm(ev.a!) }), lines: [`${time} · ${t('sky.ev.opp.d', { m: num(ev.mag!, 1, lang), d: num(ev.value!, 2, lang) })}`], icon: <Orbit className={`${cls} text-amber-300`} /> }
    case 'elong':
      return { title: t(ev.evening ? 'sky.ev.elongE' : 'sky.ev.elongW', { p: nm(ev.a!) }), lines: [`${time} · ${t('sky.ev.elong.d', { deg: num(ev.value!, 0, lang), sky: sky(ev.evening), m: num(ev.mag!, 1, lang) })}`], icon: <Orbit className={`${cls} text-orange-300`} /> }
    case 'meteor': {
      const sh = SHOWERS.find((s) => s.id === ev.shower)!
      const pct = Math.round((ev.illum ?? 0) * 100)
      const q = t((ev.illum ?? 0) < 0.25 ? 'sky.moonq.good' : (ev.illum ?? 0) < 0.6 ? 'sky.moonq.mid' : 'sky.moonq.bad')
      return {
        title: t(`sky.sh.${ev.shower}`),
        lines: [`${time} · ${t('sky.ev.meteor.d', { zhr: sh.zhr, v: sh.speed, con: t(`sky.con.${sh.con}`) })}`, t('sky.ev.meteor.moon', { pct, q })],
        icon: <Sparkles className={`${cls} text-fuchsia-300`} />,
      }
    }
    case 'solar': {
      const e = ev.eclipse!
      const lines = [`${time}${e.mag != null ? ` · ${t('sky.ecl.mag', { m: num(e.mag, 2, lang) })}` : ''}`]
      let warn: string | undefined
      if (loc && 's' in loc) {
        const s = loc.s
        if (!s.visible) lines.push(t('sky.ecl.solarNone'))
        else {
          lines.push(t(s.mag >= 1 ? 'sky.ecl.solarTotal' : 'sky.ecl.solarVis', { obsc: num(Math.min(100, s.obsc * 100), 0, lang), t: timeStr(s.ms, lang), alt: num(s.sunAlt, 0, lang) }))
          if (s.cutOff) lines.push(t('sky.ecl.cut'))
          warn = t('sky.ecl.solarSafety')
        }
      }
      return { title: t(`sky.ev.solar.${e.kind}`), lines, warn, icon: <Sun className={`${cls} text-yellow-300`} /> }
    }
    case 'lunar': {
      const e = ev.eclipse!
      const lines = [`${time}${e.mag != null && e.kind !== 'penumbral' ? ` · ${t('sky.ecl.mag', { m: num(e.mag, 2, lang) })}` : ''}`]
      if (e.kind === 'total') lines.push(t('sky.ecl.dur', { tot: Math.round(2 * (e.halfTotal ?? 0)), part: Math.round(2 * (e.halfPartial ?? 0)) }))
      else if (e.kind === 'partial') lines.push(t('sky.ecl.durPart', { part: Math.round(2 * (e.halfPartial ?? 0)) }))
      else lines.push(t('sky.ecl.penFaint'))
      if (loc && 'l' in loc) {
        const l = loc.l
        if (l.state === 'visible') lines.push(t('sky.ecl.lunarVis', { alt: num(l.moonAlt, 0, lang) }) + (l.sunAlt > -6 ? t('sky.ecl.lunarLight') : ''))
        else lines.push(t(l.state === 'partial' ? 'sky.ecl.lunarPart' : 'sky.ecl.lunarNone'))
      }
      return { title: t(`sky.ev.lunar.${e.kind}`), lines, icon: <Eclipse className={`${cls} text-rose-300`} /> }
    }
  }
}

function EventRow({ ev, d, has, onBell, lang }: { ev: SkyEvent; d: Desc; has: boolean; onBell: () => void; lang: L }) {
  const t = useT()
  return (
    <div className="flex items-start gap-2 border-t border-border/50 py-2">
      <div className="w-11 shrink-0 pt-0.5 text-center leading-tight">
        <div className="text-lg font-semibold tabular-nums">{new Date(ev.ms).getDate()}</div>
        <div className="text-[10px] uppercase text-muted-foreground">{weekdayShort(ev.ms, lang)}</div>
      </div>
      <div className="min-w-0 flex-1 pt-1">
        <div className="flex items-center gap-1.5 text-sm font-medium">{d.icon}<span className="min-w-0">{d.title}</span></div>
        {d.lines.map((l, i) => <p key={i} className="mt-0.5 text-xs text-muted-foreground">{l}</p>)}
        {d.warn && <p className="mt-0.5 text-[11px] text-amber-300/90">{d.warn}</p>}
      </div>
      <Button type="button" variant={has ? 'secondary' : 'ghost'} className="size-11 shrink-0" aria-pressed={has} aria-label={t(has ? 'sky.rem.cancel' : 'sky.rem.set')} onClick={onBell}>
        {has ? <BellRing className="size-5 text-amber-300" /> : <Bell className="size-5" />}
      </Button>
    </div>
  )
}

export function EventsPanel() {
  const t = useT()
  const lang = useLang()
  const site = useSite()
  const [events, setEvents] = useState<SkyEvent[] | null>(null)
  const [filter, setFilter] = useState<Filter>('all')
  const [msg, setMsg] = useState<{ text: string; tone: 'ok' | 'warn' } | null>(null)
  const items = useReminders((s) => s.items)
  const lead = useReminders((s) => s.lead)

  useEffect(() => {
    const id = setTimeout(() => setEvents(eventsNow()), 30)
    void syncReminders()
    return () => clearTimeout(id)
  }, [])
  useEffect(() => {
    if (!msg) return
    const id = setTimeout(() => setMsg(null), 7000)
    return () => clearTimeout(id)
  }, [msg])

  // Local circumstances (cheap): conjunctions, oppositions, elongations and the eclipses
  const locals = useMemo(() => {
    const m = new Map<string, Local>()
    for (const ev of events ?? []) {
      if (ev.kind === 'solar') m.set(ev.id, { s: solarVisibility(ev.eclipse!, site) })
      else if (ev.kind === 'lunar') m.set(ev.id, { l: lunarVisibility(ev.eclipse!, site) })
      else if (ev.kind === 'conj') { const v = localView(ev, site); if (v) m.set(ev.id, { v }) }
    }
    return m
  }, [events, site])

  const shown = useMemo(() => (events ?? []).filter((e) => filter === 'all' || KIND_OF[e.kind] === filter), [events, filter])
  const groups = useMemo(() => {
    const g: { key: string; label: string; rows: SkyEvent[] }[] = []
    for (const e of shown) {
      const label = monthYear(e.ms, lang)
      if (!g.length || g[g.length - 1].label !== label) g.push({ key: label + e.ms, label, rows: [] })
      g[g.length - 1].rows.push(e)
    }
    return g
  }, [shown, lang])

  const bell = async (ev: SkyEvent, d: Desc) => {
    if (items.some((r) => r.id === ev.id)) {
      await removeReminder(ev.id)
      setMsg({ text: t('sky.rem.removed'), tone: 'ok' })
      return
    }
    const r = await addReminder(ev, d.title, `${dateTime(ev.ms, lang)} · ${d.lines[0]}`)
    if (r === 'ok') {
      const at = reminders.get().items.find((x) => x.id === ev.id)?.at ?? ev.ms
      setMsg({ text: t('sky.rem.ok', { t: dateTime(at, lang) }), tone: 'ok' })
    } else setMsg({ text: t(`sky.rem.${r}`), tone: 'warn' })
  }

  return (
    <div className="grid gap-4">
      <LocationBar />
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold">{t('sky.ev.title')}</h2>
        {items.length > 0 && <span className="text-xs text-muted-foreground">{t('sky.rem.count', { n: items.length })}</span>}
      </div>

      <div className="grid gap-1.5">
        <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{t('sky.lead')}</div>
        <div className="grid grid-cols-2 gap-1.5">
          {(['eve', 'hour'] as const).map((l) => (
            <Button key={l} type="button" variant="outline" aria-pressed={lead === l} className={`h-11 whitespace-normal px-2 text-xs ${lead === l ? SEL : ''}`} onClick={() => setLead(l)}>{t(`sky.lead.${l}`)}</Button>
          ))}
        </div>
        {!remindersWork() && <p className="text-[11px] text-muted-foreground">{t('sky.rem.web')}</p>}
      </div>

      <div className="flex flex-wrap gap-1.5" role="group">
        {FILTERS.map((f) => (
          <Button key={f} type="button" variant="outline" aria-pressed={filter === f} className={`h-11 rounded-full px-3.5 text-xs ${filter === f ? SEL : ''}`} onClick={() => setFilter(f)}>{t(`sky.f.${f}`)}</Button>
        ))}
      </div>

      {events == null && <p className="text-sm text-muted-foreground">{t('sky.ev.loading')}</p>}
      {events != null && shown.length === 0 && <p className="text-sm text-muted-foreground">{t('sky.ev.empty')}</p>}
      {groups.map((g) => (
        <section key={g.key} className="grid">
          <h3 className="pb-1 pt-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{g.label}</h3>
          {g.rows.map((ev) => {
            const d = describe(ev, locals.get(ev.id), t, lang)
            return <EventRow key={ev.id} ev={ev} d={d} lang={lang} has={items.some((r) => r.id === ev.id)} onBell={() => void bell(ev, d)} />
          })}
        </section>
      ))}

      <p className="text-[11px] leading-relaxed text-muted-foreground">{t('sky.ev.note')}</p>
      {(filter === 'all' || filter === 'meteor') && <p className="text-[11px] leading-relaxed text-muted-foreground">{t('sky.sh.src')}</p>}

      {msg && (
        <div role="status" aria-live="polite" className={`sticky bottom-2 z-10 rounded-lg border px-3 py-2.5 text-sm shadow-lg backdrop-blur ${msg.tone === 'ok' ? 'border-emerald-500/40 bg-emerald-950/80 text-emerald-100' : 'border-amber-500/40 bg-amber-950/80 text-amber-100'}`}>
          {msg.text}
        </div>
      )}
    </div>
  )
}
