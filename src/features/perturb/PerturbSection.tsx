// "Baanverstoringen": numerical propagation of the planned Earth orbit with switchable perturbation forces (Missies → Aardbaan).
import { useEffect, useMemo, useRef, useState } from 'react'
import { Play, Radio, Square } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { KV, Section, f } from '@/components/bits'
import { DAY, DEG, fmtDate, type EarthPlan } from '@/lib/astro'
import { useT } from '@/lib/i18n'
import { getCached } from '@/lib/net'
import { activeCraft, useApp } from '@/lib/store'
import { advance, createSimFromElements, defaultOpts, slope, type Forces, type Sample, type Sim } from './propagate'
import { parseFlux, type Flux } from './flux'
import './i18n'

const FORCE_KEYS = ['central', 'j2', 'j3', 'j4', 'drag', 'srp', 'sun', 'moon'] as const
const FLUX_URL = 'https://services.swpc.noaa.gov/json/f107_cm_flux.json'
const START: Forces = { central: true, j2: true, j3: true, j4: true, drag: true, srp: true, sun: true, moon: true }

interface Result { samples: Sample[]; decayDays: number | null; days: number; steps: number; secs: number; stopped: boolean; key: string }

type Pt = [number, number]
interface Line { pts: Pt[]; color: string; dash?: string; label: string }

/** Small SVG line chart: fixed viewBox, scales with the width of its container. */
function LineChart({ lines, yLabel, xMax }: { lines: Line[]; yLabel: string; xMax: number }) {
  const t = useT()
  const W = 340, H = 118, L = 40, R = 8, T = 8, B = 20
  const ys = lines.flatMap((l) => l.pts.map((p) => p[1])).filter(Number.isFinite)
  let lo = Math.min(...ys), hi = Math.max(...ys)
  if (!(hi - lo > 1e-9)) { lo -= 1; hi += 1 }
  const pad = (hi - lo) * 0.06; lo -= pad; hi += pad
  const X = (x: number) => L + (x / Math.max(xMax, 1e-9)) * (W - L - R)
  const Y = (y: number) => T + (1 - (y - lo) / (hi - lo)) * (H - T - B)
  const rng = hi - lo, dec = rng < 0.05 ? 4 : rng < 0.5 ? 3 : rng < 5 ? 2 : rng < 50 ? 1 : 0
  const fmt = (v: number) => v.toFixed(dec)
  const fmtX = (v: number) => (v >= 100 ? v.toFixed(0) : v.toFixed(1))
  return (
    <figure className="grid gap-1">
      <figcaption className="text-[11px] text-muted-foreground">{yLabel}</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={yLabel} className="block w-full rounded-md border border-white/10 bg-black/20">
        {[0, 0.5, 1].map((q) => {
          const v = lo + (hi - lo) * q
          return <g key={q}><line x1={L} x2={W - R} y1={Y(v)} y2={Y(v)} stroke="rgba(255,255,255,0.1)" /><text x={L - 4} y={Y(v) + 3} textAnchor="end" fontSize="9" fill="rgba(255,255,255,0.6)">{fmt(v)}</text></g>
        })}
        {[0, 0.5, 1].map((q) => <text key={q} x={X(xMax * q)} y={H - 6} textAnchor={q === 0 ? 'start' : q === 1 ? 'end' : 'middle'} fontSize="9" fill="rgba(255,255,255,0.6)">{fmtX(xMax * q)}</text>)}
        {lines.map((l) => (
          <polyline key={l.label} fill="none" stroke={l.color} strokeWidth="1.8" strokeDasharray={l.dash} strokeLinejoin="round"
            points={l.pts.map((p) => `${X(p[0]).toFixed(1)},${Y(p[1]).toFixed(1)}`).join(' ')} />
        ))}
      </svg>
      <div className="flex flex-wrap gap-x-3 text-[10.5px] text-muted-foreground">
        {lines.length > 1 && lines.map((l) => <span key={l.label} className="inline-flex items-center gap-1"><span className="inline-block h-0.5 w-3" style={{ background: l.color }} />{l.label}</span>)}
        <span className="ml-auto">{t('pert.axis')}</span>
      </div>
    </figure>
  )
}

function Num({ id, label, value, onChange, step = 1, min = 0 }: { id: string; label: string; value: number; onChange: (v: number) => void; step?: number; min?: number }) {
  return (
    <div className="grid gap-1">
      <Label htmlFor={id} className="text-xs text-muted-foreground">{label}</Label>
      <Input id={id} type="number" inputMode="decimal" value={Number.isFinite(value) ? value : ''} step={step} min={min} className="h-11"
        onChange={(e) => { const v = parseFloat(e.target.value); if (Number.isFinite(v)) onChange(v) }} />
    </div>
  )
}

export function PerturbSection({ plan }: { plan: EarthPlan }) {
  const t = useT()
  const craft = useApp(activeCraft)
  const [forces, setForces] = useState<Forces>(START)
  const [days, setDays] = useState(30)
  const [cr, setCr] = useState(1.3)
  const [f107, setF107] = useState(150)
  const [fluxMsg, setFluxMsg] = useState<string | null>(null)
  const [fluxBusy, setFluxBusy] = useState(false)
  const [progress, setProgress] = useState<number | null>(null)
  const [res, setRes] = useState<Result | null>(null)
  const timer = useRef<number | null>(null)
  const sim = useRef<Sim | null>(null)

  const key = useMemo(() => JSON.stringify([plan.a, plan.e, plan.iT, plan.O0, plan.w0, plan.t0, plan.mFinal, craft.cd, craft.area, forces, days, cr, f107]), [plan, craft.cd, craft.area, forces, days, cr, f107])
  const stop = () => { if (timer.current !== null) { clearTimeout(timer.current); timer.current = null } }
  useEffect(() => stop, [])

  async function liveFlux() {
    setFluxBusy(true); setFluxMsg(null)
    try {
      const r = await getCached<Flux>('swpc.f107', FLUX_URL, { maxAgeMs: 12 * 3600_000, parse: parseFlux })
      const date = (x: Flux | null, at: number | null) => (x?.time ?? (at ? new Date(at).toISOString() : '')).slice(0, 10)
      if (r.data) {
        setF107(Math.round(r.data.f107 * 10) / 10)
        setFluxMsg(t(r.error && r.fromCache ? 'pert.f107cache' : 'pert.f107ok', { v: f(r.data.f107, 1), d: date(r.data, r.fetchedAt) }))
      } else setFluxMsg(t('pert.f107err'))
    } catch { setFluxMsg(t('pert.f107err')) }
    setFluxBusy(false)
  }

  function run() {
    stop()
    const spanDays = Math.max(1, Math.min(730, Math.round(days)))
    const o = defaultOpts(spanDays, plan.period)
    const s = createSimFromElements(plan.t0, plan.a, plan.e, plan.iT, plan.O0, plan.w0, 0, forces, { cd: craft.cd, area: craft.area, mass: plan.mFinal, cr, f107 }, o)
    sim.current = s
    const k = key, started = Date.now()
    const finish = (stopped: boolean) => {
      const dayOf = (x: number) => x / DAY
      setRes({ samples: s.samples, decayDays: s.decayT === null ? null : dayOf(s.decayT), days: stopped ? dayOf(s.t - s.t0) : spanDays, steps: s.steps, secs: (Date.now() - started) / 1000, stopped, key: k })
      setProgress(null)
    }
    setProgress(0); setRes(null)
    const tick = () => {
      if (sim.current !== s) return
      advance(s, 14) // ~14 ms of work per slice keeps the UI responsive
      if (s.done) { timer.current = null; finish(false); return }
      setProgress((s.t - s.t0) / s.o.span)
      timer.current = window.setTimeout(tick, 0)
    }
    tick()
  }
  function cancel() {
    const s = sim.current
    stop(); sim.current = null
    if (s) setRes({ samples: s.samples, decayDays: null, days: (s.t - s.t0) / DAY, steps: s.steps, secs: 0, stopped: true, key })
    setProgress(null)
  }

  const running = progress !== null
  const stale = !!res && res.key !== key && !running
  const view = useMemo(() => {
    if (!res || res.samples.length < 2) return null
    const sm = res.samples, d = (s: Sample) => s.t / DAY
    const first = sm[0], last = sm[sm.length - 1]
    const rate = slope(sm.map((s) => s.t), sm.map((s) => s.raan)) * DAY // °/day
    const ana = (plan.rates.dO * DAY) / DEG
    const raan0 = first.raan - rate * (first.t / DAY)
    return {
      first, last, rate, ana,
      per: sm.map((s): Pt => [d(s), s.rp]), apo: sm.map((s): Pt => [d(s), s.ra]), inc: sm.map((s): Pt => [d(s), s.inc]),
      numO: sm.map((s): Pt => [d(s), s.raan - raan0]),
      anaO: [[0, 0], [res.days, ana * res.days]] as Pt[],
    }
  }, [res, plan.rates.dO])
  const equatorial = plan.iT < 0.5 * DEG || plan.iT > 179.5 * DEG

  return (
    <Section title={t('pert.title')}>
      <p className="text-[10.5px] text-muted-foreground">{t('pert.intro')}</p>
      <div className="grid gap-0.5">
        <div className="text-xs text-muted-foreground">{t('pert.forces')}</div>
        <div className="grid grid-cols-1 gap-x-3 min-[360px]:grid-cols-2">
          {FORCE_KEYS.map((k) => (
            <label key={k} className="flex min-h-11 cursor-pointer items-center justify-between gap-2 text-xs">
              <span>{t(`pert.f.${k}`)}</span>
              <Switch checked={forces[k]} onCheckedChange={(v) => setForces((p) => ({ ...p, [k]: v }))} aria-label={t(`pert.f.${k}`)} />
            </label>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Num id="pert-days" label={`${t('pert.span')} (${t('pert.days')})`} value={days} onChange={(v) => setDays(Math.max(1, Math.min(730, v)))} />
        <Num id="pert-cr" label={t('pert.cr')} value={cr} step={0.1} onChange={(v) => setCr(Math.max(0, v))} />
        <Num id="pert-f107" label={t('pert.f107')} value={f107} onChange={(v) => setF107(Math.max(50, Math.min(400, v)))} />
        <div className="grid content-end">
          <Button variant="outline" className="h-11 whitespace-normal text-xs leading-tight" disabled={fluxBusy} onClick={liveFlux}>
            <Radio />{fluxBusy ? t('pert.f107busy') : t('pert.f107live')}
          </Button>
        </div>
      </div>
      {fluxMsg && <p className="text-[10.5px] text-muted-foreground" role="status">{fluxMsg}</p>}
      <p className="text-[10.5px] text-muted-foreground">{t('pert.craft', { m: f(plan.mFinal, 0), cd: craft.cd, a: craft.area })}</p>
      {running
        ? <Button variant="outline" className="h-11" onClick={cancel}><Square />{t('pert.stop')} · {t('pert.running', { p: Math.round((progress ?? 0) * 100) })}</Button>
        : <Button className="h-11" onClick={run}><Play />{t('pert.run')}</Button>}
      {running && <div className="h-1.5 overflow-hidden rounded bg-white/10"><div className="h-full bg-emerald-400" style={{ width: `${Math.round((progress ?? 0) * 100)}%` }} /></div>}

      {res && view && (
        <div className="grid gap-2" aria-live="polite">
          <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{t('pert.results')}</div>
          {stale && <p className="text-[10.5px] text-amber-400">{t('pert.stale')}</p>}
          {res.stopped && <p className="text-[10.5px] text-amber-400">{t('pert.stopped', { d: f(res.days, 1) })}</p>}
          <KV k={t('pert.decay')} strong v={res.decayDays === null
            ? t('pert.nodecay', { d: f(res.days, 0) })
            : t('pert.decay.at', { date: fmtDate(plan.t0 + res.decayDays * DAY), d: f(res.decayDays, 1) })} />
          <KV k={t('pert.k.alt')} v={`${f(view.last.rp, 1)} / ${f(view.last.ra, 1)} km`} />
          <KV k={t('pert.k.inc')} v={`${f(view.first.inc, 3)}° → ${f(view.last.inc, 3)}°`} />
          {!equatorial && <>
            <KV k={t('pert.k.rate')} v={`${f(view.rate, 4)} ${t('pert.perday')}`} />
            <KV k={t('pert.k.ana')} v={`${f(view.ana, 4)} ${t('pert.perday')}`} />
            <KV k={t('pert.k.diff')} v={`${f(view.rate - view.ana, 4)} ${t('pert.perday')}${Math.abs(view.ana) > 1e-9 ? ` (${f(((view.rate - view.ana) / Math.abs(view.ana)) * 100, 1)} %)` : ''}`} />
          </>}
          <LineChart xMax={res.days} yLabel={t('pert.alt')} lines={[{ pts: view.apo, color: '#fbbf24', label: t('pert.apogee') }, { pts: view.per, color: '#38bdf8', label: t('pert.perigee') }]} />
          <LineChart xMax={res.days} yLabel={t('pert.inc')} lines={[{ pts: view.inc, color: '#4ade80', label: t('pert.inc') }]} />
          {equatorial
            ? <p className="text-[10.5px] text-muted-foreground">{t('pert.eq')}</p>
            : <LineChart xMax={res.days} yLabel={t('pert.raan')} lines={[{ pts: view.numO, color: '#f472b6', label: t('pert.numeric') }, { pts: view.anaO, color: '#ffffff', dash: '4 3', label: t('pert.analytic') }]} />}
          <p className="text-[10.5px] text-muted-foreground">{t('pert.steps', { n: res.steps, s: f(res.secs, 1) })}</p>
        </div>
      )}
      <p className="text-[10.5px] text-muted-foreground">{t('pert.note')}</p>
    </Section>
  )
}
