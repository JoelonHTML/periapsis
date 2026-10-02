import { useEffect, useMemo, useRef, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { Share } from '@capacitor/share'
import { ChevronLeft, ChevronRight, Download, Target } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { DAY, fmtDate } from '../../lib/astro.ts'
import type { BodyId } from '../../lib/astro.ts'
import type { ArrivalKind, Solution } from '../../lib/mga.ts'
import { useT } from '@/lib/i18n'
import { selectedSolution, useApp } from '@/lib/store'
import { KV, Section, f } from '@/components/bits'
import './i18n'
import { arrivalReadout, departureReadout } from './angles.ts'
import { toCsv, toOem } from './export.ts'
import { drawPlot, pxToPoint } from './plotdraw.ts'
import { computeRows, defaultCentre, evalPoint, makeSpec, newGrid, refineMin, synodic, type Grid, type Metric, type PcPoint, type PorkchopParams } from './porkchop.ts'

export interface PorkchopSectionProps {
  /** Mission settings (module-level store in Mission.tsx). */
  mode: 'departure' | 'arrival'
  date: string // YYYY-MM-DD
  parkAlt: number
  arrival: ArrivalKind
  capAlt: number
  capEcc: number
  /** Put a departure date (YYYY-MM-DD) and a search window (days) into the mission settings. */
  onUseDate: (iso: string, windowDays: number) => void
}

const dateJ2000 = (iso: string) => (Date.parse(iso + 'T00:00:00Z') - Date.UTC(2000, 0, 1, 12)) / 1000
const sel = (tDep: number, tof: number) => ({ tDep, tof })

export function PorkchopSection(props: PorkchopSectionProps) {
  const t = useT()
  const target = useApp((s) => s.target)
  const sol = useApp(selectedSolution)
  if (target === 'moon') return <><Separator /><Section title={t('pc.title')}><p className="text-xs text-muted-foreground">{t('pc.moon')}</p></Section></>
  return (
    <>
      <Separator />
      <Plot key={target} {...props} target={target} />
      <Separator />
      <Readouts sol={sol} parkAlt={props.parkAlt} />
      <Separator />
      <ExportBox sol={sol} />
    </>
  )
}

function Plot(p: PorkchopSectionProps & { target: BodyId }) {
  const t = useT()
  const { target, mode, date, parkAlt, arrival, capAlt, capEcc, onUseDate } = p
  const [metric, setMetric] = useState<Metric>('c3')
  const [shift, setShift] = useState(0) // in synodic periods
  const [grid, setGrid] = useState<Grid | null>(null)
  const [tick, setTick] = useState(0)
  const [mins, setMins] = useState<{ c3: PcPoint | null; dv: PcPoint | null } | null>(null)
  const [pick, setPick] = useState<{ tDep: number; tof: number } | null>(null)
  const [note, setNote] = useState('')
  const [W, setW] = useState(340)
  const wrap = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)

  // window centre: follows the mission date, except when the date was just set from this plot (then the window stays put)
  const [centre, setCentre] = useState(() => defaultCentre(target, mode, dateJ2000(date)))
  const own = useRef<string | null>(null)
  useEffect(() => {
    if (own.current === date) return
    own.current = null
    setCentre(defaultCentre(target, mode, dateJ2000(date))); setShift(0)
  }, [target, mode, date])
  const params = useMemo<PorkchopParams>(() => ({ target, parkAlt, arrival, capAlt, capEcc }), [target, parkAlt, arrival, capAlt, capEcc])
  const spec = useMemo(() => makeSpec(target, centre + shift * synodic(target)), [target, centre, shift])

  // compute the grid in small batches so the UI stays responsive
  useEffect(() => {
    const g = newGrid(spec)
    let dead = false, timer = 0
    setGrid(g); setMins(null); setPick(null); setNote(''); setTick((n) => n + 1)
    const step = () => {
      if (dead) return
      computeRows(g, params, g.rowsDone, g.rowsDone + 5)
      setTick((n) => n + 1)
      if (g.rowsDone < spec.ny) { timer = window.setTimeout(step, 0); return }
      const c = (spec.t0 + spec.t1) / 2, b = { t0: c - 0.5 * synodic(params.target), t1: c + 0.5 * synodic(params.target) } // the opportunity this window is centred on
      const m = { c3: refineMin(g, params, 'c3', b), dv: refineMin(g, params, 'dv', b) }
      setMins(m)
      const first = m.c3
      if (first) setPick(sel(first.tDep, first.tof))
    }
    timer = window.setTimeout(step, 30)
    return () => { dead = true; window.clearTimeout(timer) }
  }, [spec, params])

  useEffect(() => {
    const el = wrap.current
    if (!el) return
    const ro = new ResizeObserver(() => setW(Math.max(240, Math.floor(el.clientWidth))))
    ro.observe(el); setW(Math.max(240, Math.floor(el.clientWidth)))
    return () => ro.disconnect()
  }, [])

  const H = Math.round(Math.min(340, W * 0.85))
  const done = !!grid && grid.rowsDone >= spec.ny
  const min = mins?.[metric] ?? null
  useEffect(() => {
    if (!canvas.current || !grid) return
    drawPlot(canvas.current, grid, W, H, { metric, labels: { x: t('pc.xaxis'), y: t('pc.yaxis') }, sel: pick, min: done ? min : null })
  }, [grid, tick, metric, W, H, pick, min, done, t])

  const point = useMemo(() => (pick ? evalPoint(params, pick.tDep, pick.tof) : null), [pick, params])
  const onTap = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!grid) return
    const r = e.currentTarget.getBoundingClientRect()
    const q = pxToPoint(spec, W, H, e.clientX - r.left, e.clientY - r.top)
    if (q) { setPick(q); setNote('') }
  }
  const body = t('pc.body.' + target)
  const range = `${fmtDate(spec.t0).slice(0, 7)} → ${fmtDate(spec.t1).slice(0, 7)}`
  const WINDOW = 30

  return (
    <Section title={t('pc.title')}>
      <p className="text-[11px] text-muted-foreground">{t('pc.intro', { body, alt: parkAlt })}</p>
      <div className="grid gap-1">
        <span className="text-xs text-muted-foreground">{t('pc.metric')}</span>
        <ToggleGroup type="single" variant="outline" value={metric} onValueChange={(v) => v && setMetric(v as Metric)} className="grid w-full grid-cols-2 gap-1">
          <ToggleGroupItem value="c3" className="h-11 text-xs">{t('pc.metric.c3')}</ToggleGroupItem>
          <ToggleGroupItem value="dv" className="h-11 text-xs">{t('pc.metric.dv')}</ToggleGroupItem>
        </ToggleGroup>
      </div>
      <div ref={wrap} className="w-full min-w-0">
        <canvas ref={canvas} role="img" aria-label={t('pc.aria')} onClick={onTap} className="block max-w-full cursor-crosshair rounded-md bg-muted/30" style={{ width: W, height: H }} />
      </div>
      <div className="flex items-center gap-2">
        <Button variant="outline" className="h-11 flex-1 px-2 text-xs" onClick={() => setShift((s) => s - 1)}><ChevronLeft /> {t('pc.prev')}</Button>
        <Button variant="outline" className="h-11 flex-1 px-2 text-xs" onClick={() => setShift((s) => s + 1)}>{t('pc.next')} <ChevronRight /></Button>
      </div>
      <p className="text-[10.5px] text-muted-foreground">
        {done ? t('pc.window', { a: range.split(' → ')[0], b: range.split(' → ')[1] }) : t('pc.computing', { p: Math.round(((grid?.rowsDone ?? 0) / spec.ny) * 100) })}
        {' · '}{t('pc.legend')}
      </p>

      {done && min && (
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="min-w-0">{t('pc.min', { m: metric === 'c3' ? 'C3' : 'Δv', v: metric === 'c3' ? `${f(min.c3, 1)} km²/s² · ${fmtDate(min.tDep)}` : `${f(min.dv, 2)} km/s · ${fmtDate(min.tDep)}` })}</span>
          <Button size="sm" variant="outline" className="h-11 shrink-0 px-3 text-xs" onClick={() => { setPick(sel(min.tDep, min.tof)); setNote('') }}><Target /> {t('pc.pickMin')}</Button>
        </div>
      )}

      <div className="rounded-lg border bg-muted/30 p-2">
        <div className="text-xs font-medium">{t('pc.point')}</div>
        {!pick && <p className="py-1 text-xs text-muted-foreground">{t('pc.tap')}</p>}
        {pick && !point && <p className="py-1 text-xs text-amber-400">{t('pc.none')}</p>}
        {point && (
          <>
            <KV k={t('pc.depart')} v={fmtDate(point.tDep)} />
            <KV k={t('pc.arrive')} v={fmtDate(point.tDep + point.tof)} />
            <KV k={t('pc.tof')} v={t('pc.days', { n: Math.round(point.tof / DAY) })} />
            <KV k={t('pc.c3')} v={`${f(point.c3, 2)} km²/s²`} strong={metric === 'c3'} />
            <KV k={t('pc.vinfDep')} v={`${f(point.vinfDep, 2)} km/s`} />
            <KV k={t('pc.vinfArr')} v={`${f(point.vinfArr, 2)} km/s`} />
            <KV k={t('pc.dvDep', { alt: parkAlt })} v={`${f(point.dvDep, 3)} km/s`} />
            <KV k={t('pc.dvArr')} v={`${f(point.dvArr, 3)} km/s`} />
            <KV k={t('pc.dvTot')} v={`${f(point.dv, 3)} km/s`} strong={metric === 'dv'} />
            <Button className="mt-2 h-11 w-full" onClick={() => { const d = fmtDate(point.tDep); own.current = d; onUseDate(d, WINDOW); setNote(t('pc.used', { d, w: WINDOW })) }}>{t('pc.use')}</Button>
            {note && <p role="status" className="mt-1.5 text-xs text-emerald-400">{note}</p>}
          </>
        )}
      </div>
    </Section>
  )
}

function Readouts({ sol, parkAlt }: { sol: Solution | null; parkAlt: number }) {
  const t = useT()
  const r = useMemo(() => (sol ? departureReadout(sol, parkAlt) : null), [sol, parkAlt])
  const a = useMemo(() => (sol ? arrivalReadout(sol) : null), [sol])
  if (!sol || !r || !a) return <Section title={t('pc.ret.title')}><p className="text-xs text-muted-foreground">{t('pc.ret.none')}</p></Section>
  const to = t('pc.body.' + r.to)
  const sgn = (x: number, d = 1) => (x >= 0 ? '+' : '−') + Math.abs(x).toFixed(d)
  const Hint = ({ children }: { children: string }) => <p className="pb-1 text-[10.5px] leading-snug text-muted-foreground">{children}</p>
  return (
    <Section title={t('pc.ret.title')}>
      <div className="rounded-lg border bg-muted/30 p-2">
        <div className="pb-1 text-xs font-medium">{t('pc.ret.leg', { body: to, d: fmtDate(r.t) })}</div>
        <KV k={t('pc.ret.phase')} v={`${sgn(r.phase)}°`} strong />
        <Hint>{t('pc.ret.phase.h', { body: to })}</Hint>
        <KV k={t('pc.ret.vinf')} v={`${f(r.vinf, 3)} km/s · ${f(r.c3, 2)} km²/s²`} />
        <KV k={t('pc.ret.ra')} v={`${f(r.ra, 1)}°`} />
        <KV k={t('pc.ret.dec')} v={`${sgn(r.dec)}°`} />
        <Hint>{t('pc.ret.radec.h')}</Hint>
        <KV k={t('pc.ret.prog')} v={`${f(r.angleToPrograde, 1)}°`} />
        <Hint>{t('pc.ret.prog.h')}</Hint>
        <KV k={t('pc.ret.inpl')} v={`${sgn(r.inPlane)}°`} />
        <Hint>{t('pc.ret.inpl.h')}</Hint>
        <KV k={t('pc.ret.out')} v={`${sgn(r.outOfPlane)}°`} />
        <Hint>{t('pc.ret.out.h')}</Hint>
        <KV k={t('pc.ret.eject')} v={`${f(r.ejection, 1)}°`} strong />
        <Hint>{t('pc.ret.eject.h', { e: f(r.eccentricity, 3), nu: f(r.asymptoteAnomaly, 1), alt: parkAlt })}</Hint>
      </div>
      <div className="rounded-lg border bg-muted/30 p-2">
        <div className="pb-1 text-xs font-medium">{t('pc.ret.arr', { body: t('pc.body.' + a.body), d: fmtDate(a.t) })}</div>
        <KV k={t('pc.ret.arrvinf')} v={`${f(a.vinf, 3)} km/s · ${f(a.c3, 2)} km²/s²`} strong />
        <KV k={t('pc.ret.arrdir')} v={`${f(a.ra, 1)}° / ${sgn(a.dec)}°`} />
        <KV k={t('pc.ret.sun')} v={`${f(a.vHelio, 2)} km/s`} />
      </div>
      <p className="text-[10.5px] leading-snug text-muted-foreground">{t('pc.ret.frames')}</p>
    </Section>
  )
}

/** Browser: file download. Android (Capacitor): share sheet with the file content as text. */
async function deliver(name: string, mime: string, text: string): Promise<'saved' | 'shared'> {
  if (Capacitor.isNativePlatform()) {
    await Share.share({ title: name, text })
    return 'shared'
  }
  const url = URL.createObjectURL(new Blob([text], { type: mime }))
  const a = document.createElement('a')
  a.href = url; a.download = name
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
  return 'saved'
}

function ExportBox({ sol }: { sol: Solution | null }) {
  const t = useT()
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  if (!sol) return <Section title={t('pc.exp.title')}><p className="text-xs text-muted-foreground">{t('pc.exp.none')}</p></Section>
  const base = `periapsis-${sol.seq.join('-')}-${fmtDate(sol.tDep)}`
  const step = Capacitor.isNativePlatform() ? 5 : 2 // keep the share-sheet payload small
  const go = async (kind: 'csv' | 'oem') => {
    const name = `${base}.${kind === 'csv' ? 'csv' : 'oem'}`
    try {
      const how = await deliver(name, kind === 'csv' ? 'text/csv' : 'text/plain', kind === 'csv' ? toCsv(sol, step) : toOem(sol, new Date(), step))
      setMsg({ ok: true, text: t(how === 'saved' ? 'pc.exp.saved' : 'pc.exp.shared', { f: name }) })
    } catch (e) {
      if (!(e instanceof Error && /cancel/i.test(e.message))) setMsg({ ok: false, text: t('pc.exp.fail') })
    }
  }
  return (
    <Section title={t('pc.exp.title')}>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" className="h-11" onClick={() => go('csv')}><Download /> {t('pc.exp.csv')}</Button>
        <Button variant="outline" className="h-11" onClick={() => go('oem')}><Download /> {t('pc.exp.oem')}</Button>
      </div>
      {msg && <p role="status" className={msg.ok ? 'text-xs text-emerald-400' : 'text-xs text-red-400'}>{msg.text}</p>}
      <p className="text-[10.5px] leading-snug text-muted-foreground">{t('pc.exp.note')}</p>
    </Section>
  )
}
