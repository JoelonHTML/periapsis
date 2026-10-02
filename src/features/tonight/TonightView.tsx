import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Moon as MoonIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Slider } from '@/components/ui/slider'
import { Section } from '@/components/bits'
import { BODIES, toMs } from '@/lib/astro'
import { clock } from '@/lib/store'
import { useT } from '@/lib/i18n'
import { LocationBar, Pill, TimeOf, useLang, useSite } from './ui'
import { compassIdx, moonPhaseAt, skyAt, skyNight, solarNoon, type NightInfo, type PlanetTonight, type Site } from './sky.ts'
import { nextPhase } from './lunation.ts'
import { moonPath } from './moonPath.ts'
import { dayLong, dayShort, localISO, noonOf, num, parseISO, shiftISO, timeStr } from './fmt.ts'

const MIN = 60000

/** The night that "tonight" refers to: today's, unless last night is still going on (it is before sunrise). */
function tonightISO(site: Site, now = Date.now()): string {
  const today = localISO(now), yest = shiftISO(today, -1)
  const y = parseISO(yest), d = parseISO(today)
  const n = skyNight(site, solarNoon(y.y, y.m, y.d, site.lon), solarNoon(d.y, d.m, d.d, site.lon))
  return n.sunrise != null && now < n.sunrise ? yest : today
}

const nightOf = (site: Site, iso: string): NightInfo => {
  const a = parseISO(iso), b = parseISO(shiftISO(iso, 1))
  return skyNight(site, solarNoon(a.y, a.m, a.d, site.lon), solarNoon(b.y, b.m, b.d, site.lon))
}

// ---------- Moon disc ----------
function MoonDisc({ elong, south, size = 64 }: { elong: number; south: boolean; size?: number }) {
  const r = size / 2 - 2
  const { d, mirror } = moonPath(elong, r, south)
  return (
    <svg width={size} height={size} viewBox={`${-size / 2} ${-size / 2} ${size} ${size}`} aria-hidden className="shrink-0">
      <circle r={r} fill="#161d30" stroke="#3a4560" strokeWidth="1" />
      <path d={d} fill="#ece8d8" transform={mirror ? 'scale(-1 1)' : undefined} />
    </svg>
  )
}

// ---------- Sky dome ----------
const SKY_COLORS: [number, [number, number, number]][] = [[-18, [8, 12, 28]], [-12, [14, 22, 50]], [-6, [24, 40, 84]], [0, [48, 82, 138]], [10, [70, 120, 180]]]
function skyColor(sunAlt: number) {
  const a = Math.max(-18, Math.min(10, sunAlt))
  for (let i = 1; i < SKY_COLORS.length; i++) {
    if (a <= SKY_COLORS[i][0]) {
      const [a0, c0] = SKY_COLORS[i - 1], [a1, c1] = SKY_COLORS[i], f = (a - a0) / (a1 - a0)
      return `rgb(${c0.map((v, k) => Math.round(v + (c1[k] - v) * f)).join(',')})`
    }
  }
  return 'rgb(70,120,180)'
}

function Dome({ night, ms, site }: { night: NightInfo; ms: number; site: Site }) {
  const t = useT()
  const lang = useLang()
  const items = useMemo(() => skyAt(site, ms), [site, ms])
  const phase = useMemo(() => moonPhaseAt(ms), [ms])
  const sunAlt = items.find((i) => i.id === 'sun')!.alt
  const C = 150, R = 124
  const pt = (alt: number, az: number) => { const r = ((90 - alt) / 90) * R, a = (az * Math.PI) / 180; return [C - r * Math.sin(a), C - r * Math.cos(a)] as const }
  const mag = (id: string) => night.planets.find((p) => p.id === id)?.mag ?? 0
  const name = (id: string) => t(`sky.p.${id}`)
  const dirs: [number, number][] = [[0, 0], [90, 4], [180, 8], [270, 12]]
  return (
    <div className="grid gap-2">
      <svg viewBox="0 0 300 300" role="img" aria-label={t('sky.aria.dome')} className="mx-auto block aspect-square w-full max-w-[340px]">
        <circle cx={C} cy={C} r={R} fill={skyColor(sunAlt)} stroke="#4b5a7d" strokeWidth="1.5" style={{ transition: 'fill .3s' }} />
        {[30, 60].map((a) => <circle key={a} cx={C} cy={C} r={((90 - a) / 90) * R} fill="none" stroke="#7d8fb8" strokeOpacity=".3" strokeDasharray="2 4" />)}
        <path d={`M${C - R} ${C}H${C + R}M${C} ${C - R}V${C + R}`} stroke="#7d8fb8" strokeOpacity=".18" />
        {[30, 60].map((a) => <text key={a} x={C + 3} y={C - ((90 - a) / 90) * R - 2} fontSize="8" fill="#9fb0d6" fillOpacity=".7">{a}°</text>)}
        {dirs.map(([az, i]) => { const [x, y] = pt(-9.5, az); return <text key={az} x={x} y={y + 4} fontSize="12" fontWeight="600" textAnchor="middle" fill={az === 0 ? '#fca5a5' : '#cbd5e1'}>{t(`sky.dir.${i}`)}</text> })}
        {items.filter((i) => i.alt > 0).map((i) => {
          const [x, y] = pt(i.alt, i.az)
          if (i.id === 'sun') return <g key="sun"><circle cx={x} cy={y} r="13" fill="#fcd34d" fillOpacity=".25" /><circle cx={x} cy={y} r="7" fill="#fcd34d" /><text x={x + 11} y={y + 4} fontSize="10" fill="#fde68a">{name('sun')}</text></g>
          if (i.id === 'moon') {
            const { d, mirror } = moonPath(phase.elong, 7, site.lat < 0)
            return <g key="moon" transform={`translate(${x} ${y})`}><circle r="7" fill="#161d30" stroke="#8b96b3" strokeWidth=".8" /><path d={d} fill="#ece8d8" transform={mirror ? 'scale(-1 1)' : undefined} /><text x="11" y="4" fontSize="10" fill="#e5e7eb">{name('moon')}</text></g>
          }
          const col = BODIES[i.id as 'mercury']?.color ?? '#fff'
          const r = Math.max(2.2, Math.min(6.5, 4.2 - mag(i.id) * 0.45))
          return <g key={i.id}><circle cx={x} cy={y} r={r} fill={col} /><text x={x + r + 3} y={y + 3.5} fontSize="10" fill="#e5e7eb">{name(i.id)}</text></g>
        })}
      </svg>
      <div className="flex flex-wrap gap-1.5">
        {items.map((i) => {
          const up = i.alt > 0
          const col = i.id === 'sun' ? '#fcd34d' : i.id === 'moon' ? '#ece8d8' : BODIES[i.id as 'mercury']?.color ?? '#fff'
          return (
            <span key={i.id} className={`inline-flex items-center gap-1.5 rounded-full border border-border px-2 py-1 text-[11px] ${up ? '' : 'opacity-45'}`}>
              <span className="size-2 rounded-full" style={{ background: col }} />
              {name(i.id)}
              <span className="tabular-nums text-muted-foreground">{up ? `${num(i.alt, 0, lang)}° ${t(`sky.dir.${compassIdx(i.az)}`)}` : '↓'}</span>
            </span>
          )
        })}
      </div>
    </div>
  )
}

// ---------- Sun & twilight ----------
function SunTable({ n, day }: { n: NightInfo; day: string }) {
  const t = useT()
  const rows: [string, [number | null, number | null]][] = [
    ['sky.row.sun', [n.sunset, n.sunrise]], ['sky.row.civil', n.civil], ['sky.row.naut', n.nautical], ['sky.row.astro', n.astro],
  ]
  return (
    <div className="grid gap-1.5">
      <div className="grid grid-cols-[1fr_4.5rem_4.5rem] gap-x-2 text-xs">
        <span />
        <span className="text-right text-[11px] uppercase tracking-wider text-muted-foreground">{t('sky.evening')}</span>
        <span className="text-right text-[11px] uppercase tracking-wider text-muted-foreground">{t('sky.morning')}</span>
        {rows.map(([k, [a, b]]) => (
          <div key={k} className="contents">
            <span className="border-t border-border/50 py-1.5 text-muted-foreground">{t(k)}</span>
            <span className="border-t border-border/50 py-1.5 text-right"><TimeOf ms={a} day={day} /></span>
            <span className="border-t border-border/50 py-1.5 text-right"><TimeOf ms={b} day={day} /></span>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-muted-foreground">{t('sky.twi.h')}</p>
      {(n.sunset == null || n.sunrise == null) && <p className="text-xs text-amber-300">{t('sky.noSet')}</p>}
      {n.sunset != null && n.astro[0] == null && <p className="text-xs text-amber-300">{t('sky.noDark')}</p>}
    </div>
  )
}

// ---------- Moon ----------
function MoonBlock({ n, day, site }: { n: NightInfo; day: string; site: Site }) {
  const t = useT()
  const lang = useLang()
  const m = n.moon
  const nextNew = useMemo(() => nextPhase('new', n.mid), [n.mid])
  const nextFull = useMemo(() => nextPhase('full', n.mid), [n.mid])
  return (
    <div className="flex items-start gap-3">
      <MoonDisc elong={m.elong} south={site.lat < 0} />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{t(`sky.phase.${m.idx}`)}</div>
        <div className="grid">
          <KVs k={t('sky.illum')} v={`${num(m.illum * 100, 0, lang)}%`} />
          <KVs k={t('sky.moonrise')} v={<TimeOf ms={n.moonrise} day={day} />} />
          <KVs k={t('sky.moonset')} v={<TimeOf ms={n.moonset} day={day} />} />
          <KVs k={t('sky.dist')} v={`${num(Math.round(m.distKm / 100) * 100, 0, lang)} km`} />
          <KVs k={t('sky.nextNew')} v={dayShort(nextNew, lang)} />
          <KVs k={t('sky.nextFull')} v={dayShort(nextFull, lang)} />
        </div>
      </div>
    </div>
  )
}
function KVs({ k, v }: { k: string; v: React.ReactNode }) {
  return <div className="flex items-baseline justify-between gap-3 py-0.5 text-xs"><span className="text-muted-foreground">{k}</span><span className="text-right tabular-nums">{v}</span></div>
}

// ---------- Planets ----------
function PlanetCard({ p, day }: { p: PlanetTonight; day: string }) {
  const t = useT()
  const lang = useLang()
  const col = BODIES[p.id].color
  const faint = p.aid !== 'eye'
  return (
    <div className={`grid gap-1 rounded-lg border border-border bg-card/40 p-3 ${p.visible ? '' : 'opacity-80'}`}>
      <div className="flex items-center gap-2">
        <span className="size-3 shrink-0 rounded-full" style={{ background: col }} />
        <span className="flex-1 text-sm font-medium">{t(`sky.p.${p.id}`)}</span>
        {faint && <Pill tone="info">{t('sky.aid.optic')}</Pill>}
        <Pill tone={p.visible ? 'ok' : 'muted'}>{t(p.visible ? 'sky.vis.yes' : 'sky.vis.no')}</Pill>
      </div>
      {p.visible && p.best ? (
        <div className="grid">
          <KVs k={t('sky.best')} v={<TimeOf ms={p.best.ms} day={day} />} />
          <KVs k={`${t('sky.alt')} · ${t('sky.az')}`} v={`${num(p.best.alt, 0, lang)}° · ${t(`sky.dir.${compassIdx(p.best.az)}`)} (${num(p.best.az, 0, lang)}°)`} />
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">{t(`sky.why.${p.why ?? 'below'}`)}</p>
      )}
      <div className="grid">
        <KVs k={t('sky.rise')} v={<TimeOf ms={p.rise} day={day} />} />
        <KVs k={t('sky.set')} v={<TimeOf ms={p.set} day={day} />} />
        <KVs k={t('sky.mag')} v={num(p.mag, 1, lang)} />
        <KVs k={t('sky.elong')} v={`${num(p.elong, 0, lang)}° ${t(p.east ? 'sky.elong.e' : 'sky.elong.w')}`} />
        {(p.id === 'mercury' || p.id === 'venus' || p.id === 'mars') && <KVs k={t('sky.lit')} v={`${num(p.illum * 100, 0, lang)}%`} />}
        <KVs k={t('sky.dist.au')} v={`${num(p.distAU, 2, lang)} AU`} />
      </div>
    </div>
  )
}

// ---------- Panel ----------
export function TonightPanel() {
  const t = useT()
  const lang = useLang()
  const site = useSite()
  const [picked, setDate] = useState<string | null>(null) // null = "tonight" for the current place
  const autoDate = useMemo(() => tonightISO(site), [site])
  const date = picked ?? autoDate
  const night = useMemo(() => nightOf(site, date), [site, date])
  const [custom, setCustom] = useState<{ key: string; ms: number } | null>(null)

  const lo = (night.sunset ?? night.start) - 30 * MIN, hi = (night.sunrise ?? night.end) + 30 * MIN
  const key = `${date}|${site.lat}|${site.lon}`
  const [now] = useState(() => Date.now())
  const auto = now >= lo && now <= hi ? Math.round(now / (5 * MIN)) * 5 * MIN : Math.min((night.sunset ?? night.start) + 120 * MIN, night.mid)
  const domeMs = custom && custom.key === key ? custom.ms : auto

  const simMs = toMs(clock.t)
  const simDiffers = Math.abs(simMs - now) > 12 * 3600e3 && localISO(simMs) !== date
  const ordered = useMemo(() => [...night.planets.filter((p) => p.visible), ...night.planets.filter((p) => !p.visible)], [night])

  return (
    <div className="grid gap-5">
      <LocationBar />

      <div className="grid gap-2">
        <div className="flex items-center gap-1.5">
          <Button type="button" variant="outline" className="size-11 shrink-0" aria-label={t('sky.prev')} onClick={() => setDate(shiftISO(date, -1))}><ChevronLeft className="size-5" /></Button>
          <Input type="date" aria-label={t('sky.date')} className="h-11 min-w-0 flex-1 text-center" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
          <Button type="button" variant="outline" className="size-11 shrink-0" aria-label={t('sky.next')} onClick={() => setDate(shiftISO(date, 1))}><ChevronRight className="size-5" /></Button>
          <Button type="button" variant="secondary" className="h-11 shrink-0 px-3" onClick={() => setDate(null)}>{t('sky.tonight')}</Button>
        </div>
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><MoonIcon className="size-3.5" />{t('sky.night', { a: dayLong(noonOf(date), lang), b: dayLong(noonOf(shiftISO(date, 1)), lang) })}</p>
        {simDiffers && (
          <Button type="button" variant="ghost" className="h-11 justify-start px-2 text-xs text-sky-300" onClick={() => setDate(localISO(simMs))}>
            {t('sky.simDate', { d: dayShort(simMs, lang) })}
          </Button>
        )}
      </div>

      <Section title={t('sky.dome')}>
        <Dome night={night} ms={domeMs} site={site} />
        <div className="flex items-center gap-3">
          <span className="w-16 shrink-0 text-lg font-semibold tabular-nums">{timeStr(domeMs, lang)}</span>
          <div className="flex min-h-11 flex-1 items-center">
            <Slider aria-label={t('sky.time')} min={0} max={Math.max(5, Math.round((hi - lo) / MIN))} step={5} value={[Math.round((domeMs - lo) / MIN)]}
              onValueChange={(v) => setCustom({ key, ms: lo + v[0] * MIN })} />
          </div>
          <Button type="button" variant="outline" className="h-11 shrink-0 px-3" onClick={() => setCustom({ key, ms: Math.round(Date.now() / (5 * MIN)) * 5 * MIN })}>{t('sky.now')}</Button>
        </div>
        <p className="text-[11px] text-muted-foreground">{t('sky.dome.h')}</p>
      </Section>

      <Section title={t('sky.planets')}>
        <div className="grid gap-2">{ordered.map((p) => <PlanetCard key={p.id} p={p} day={date} />)}</div>
      </Section>

      <Section title={t('sky.sun')}><SunTable n={night} day={date} /></Section>
      <Section title={t('sky.moon')}><MoonBlock n={night} day={date} site={site} /></Section>

      <p className="text-[11px] leading-relaxed text-muted-foreground">{t('sky.notes')}</p>
    </div>
  )
}

