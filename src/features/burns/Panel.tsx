// Tab 'burns' (Manoeuvres): a burn list with dates, Δv per manoeuvre type, propellant chain and an SVG timeline.
// All numbers come from plan.ts (which reuses src/lib/astro.ts and calc.ts); this file is only UI.
import { AlertTriangle, Crosshair, FileInput, Plus, Trash2, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { KV, Section, f } from '@/components/bits'
import { fmtDate, fmtDateTime, toJ2000, toMs, type BodyId } from '@/lib/astro'
import { useT } from '@/lib/i18n'
import { createStore } from '@/lib/mini-store'
import { activeCraft, clock, jumpTo, selectedSolution, useApp } from '@/lib/store'
import './i18n'
import {
  CENTRAL_IDS, DIRS, MAX_BURNS, burnIsLong, buildBurns, draftsToBurns, emptyPlan, importRoute, loadPlan, propellantChain, savePlan, sortBurns, timeScale,
  type Burn, type CentralId, type Chain, type Dir, type Plan, type Spec, type Step,
} from './plan'

// ---------- Plan state (module-level so it survives tab switches; persisted on every change) ----------
const ui = createStore<{ plan: Plan; sel: string | null }>({ plan: loadPlan(), sel: null })
function setPlan(p: Plan) {
  ui.set({ plan: p })
  savePlan(p)
}
const patchBurn = (id: string, patch: Partial<Burn>) => setPlan({ ...ui.get().plan, burns: ui.get().plan.burns.map((b) => (b.id === id ? { ...b, ...patch } : b)) })

// ---------- Small form helpers ----------
const toLocalInput = (t: number) => new Date(toMs(t)).toISOString().slice(0, 16) // "YYYY-MM-DDTHH:mm", read back as UTC
const fromLocalInput = (v: string) => { const ms = Date.parse(`${v}:00Z`); return Number.isFinite(ms) ? toJ2000(ms) : null }
const ms = (kms: number) => kms * 1000
const fmtMs = (kms: number) => (kms * 1000).toFixed(kms < 0.01 ? 2 : kms < 1 ? 1 : 0)

function Num({ label, value, onChange, unit, step = 1 }: { label: string; value: number | null; onChange: (v: number | null) => void; unit?: string; step?: number }) {
  return (
    <div className="grid min-w-0 gap-1">
      <Label className="text-xs text-muted-foreground">{label}{unit && <span className="opacity-60"> ({unit})</span>}</Label>
      <Input type="number" inputMode="decimal" value={value ?? ''} step={step} className="h-11 text-base"
        onChange={(e) => { const raw = e.target.value; if (raw === '') return onChange(null); const v = parseFloat(raw); if (Number.isFinite(v)) onChange(v) }} />
    </div>
  )
}

function Pick<T extends string>({ label, value, onChange, options }: { label: string; value: T; onChange: (v: T) => void; options: { id: T; label: string }[] }) {
  return (
    <div className="grid min-w-0 gap-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Select value={value} onValueChange={(v) => onChange(v as T)}>
        <SelectTrigger className="h-11 w-full text-sm data-[size=default]:h-11"><SelectValue /></SelectTrigger>
        <SelectContent>{options.map((o) => <SelectItem key={o.id} value={o.id} className="min-h-11">{o.label}</SelectItem>)}</SelectContent>
      </Select>
    </div>
  )
}

function Warn({ children, tone = 'amber' }: { children: React.ReactNode; tone?: 'amber' | 'red' }) {
  const cls = tone === 'red' ? 'border-red-400/40 bg-red-400/10 text-red-100' : 'border-amber-400/30 bg-amber-400/10 text-amber-100/90'
  return (
    <div role="alert" className={`flex gap-2 rounded-lg border p-2.5 text-[11.5px] leading-snug ${cls}`}>
      <AlertTriangle className={`mt-0.5 size-3.5 shrink-0 ${tone === 'red' ? 'text-red-300' : 'text-amber-300'}`} />
      <div className="min-w-0">{children}</div>
    </div>
  )
}

// ---------- Add-burn form ----------
type FormType = Spec['type']
const FORM_TYPES: FormType[] = ['hohmann', 'circ', 'plane', 'combined', 'phasing', 'custom']

function AddForm() {
  const t = useT()
  const [type, setType] = useState<FormType>('hohmann')
  const [body, setBody] = useState<CentralId>('earth')
  const [alt1, setAlt1] = useState<number | null>(200)
  const [alt2, setAlt2] = useState<number | null>(35786)
  const [at, setAt] = useState<'apo' | 'peri'>('apo')
  const [di, setDi] = useState<number | null>(28.5)
  const [phase, setPhase] = useState<number | null>(30)
  const [revs, setRevs] = useState<number | null>(3)
  const [dvMs, setDvMs] = useState<number | null>(100)
  const [dir, setDir] = useState<Dir>('prograde')
  const [when, setWhen] = useState(() => toLocalInput(Math.round(clock.t / 60) * 60))
  const [err, setErr] = useState<string | null>(null)
  const [notes, setNotes] = useState<string[]>([])
  const n = (x: number | null) => x ?? NaN

  const spec = (): Spec => {
    switch (type) {
      case 'hohmann': return { type, body, alt1: n(alt1), alt2: n(alt2) }
      case 'circ': return { type, body, rpAlt: n(alt1), raAlt: n(alt2), at }
      case 'plane': return { type, body, alt: n(alt1), di: n(di) }
      case 'combined': return { type, body, alt1: n(alt1), alt2: n(alt2), di: n(di) }
      case 'phasing': return { type, body, alt: n(alt1), phase: n(phase), revs: n(revs) }
      case 'custom': return { type, body, dvMs: n(dvMs), dir }
    }
  }
  const t0 = fromLocalInput(when)
  const add = () => {
    const built = buildBurns(spec())
    if (!built.ok) { setErr(built.error); setNotes([]); return }
    if (t0 === null) return
    const room = MAX_BURNS - ui.get().plan.burns.length
    if (room < built.drafts.length) return
    const burns = draftsToBurns(built.drafts, t0, body, (k, v) => t(k, v))
    setErr(null); setNotes(built.notes)
    setPlan({ ...ui.get().plan, burns: [...ui.get().plan.burns, ...burns] })
    ui.set({ sel: burns[0].id })
  }
  const km = t('burn.units.km')
  const two = type === 'hohmann' || type === 'combined' || type === 'phasing'
  return (
    <div className="grid gap-2.5">
      <Pick label={t('burn.type')} value={type} onChange={(v) => { setType(v); setErr(null); setNotes([]) }} options={FORM_TYPES.map((id) => ({ id, label: t(`burn.type.${id}`) }))} />
      <Pick label={t('burn.f.body')} value={body} onChange={setBody} options={CENTRAL_IDS.map((id) => ({ id, label: t(`burn.body.${id}`) }))} />
      <div className="grid grid-cols-2 gap-2">
        {type === 'hohmann' || type === 'combined' ? (<>
          <Num label={t('burn.f.alt1')} unit={km} value={alt1} onChange={setAlt1} />
          <Num label={t('burn.f.alt2')} unit={km} value={alt2} onChange={setAlt2} />
        </>) : null}
        {type === 'circ' ? (<>
          <Num label={t('burn.f.rpAlt')} unit={km} value={alt1} onChange={setAlt1} />
          <Num label={t('burn.f.raAlt')} unit={km} value={alt2} onChange={setAlt2} />
          <div className="col-span-2"><Pick label={t('burn.f.at')} value={at} onChange={setAt} options={[{ id: 'apo', label: t('burn.at.apo') }, { id: 'peri', label: t('burn.at.peri') }]} /></div>
        </>) : null}
        {type === 'plane' || type === 'phasing' ? <Num label={t('burn.f.alt')} unit={km} value={alt1} onChange={setAlt1} /> : null}
        {type === 'plane' || type === 'combined' ? <Num label={t('burn.f.di')} unit="°" step={0.1} value={di} onChange={setDi} /> : null}
        {type === 'phasing' ? (<>
          <Num label={t('burn.f.phase')} unit="°" value={phase} onChange={setPhase} />
          <Num label={t('burn.f.revs')} value={revs} onChange={setRevs} />
        </>) : null}
        {type === 'custom' ? (<>
          <Num label={t('burn.f.dv')} unit="m/s" value={dvMs} onChange={setDvMs} />
          <Pick label={t('burn.f.dir')} value={dir} onChange={setDir} options={DIRS.map((id) => ({ id, label: t(`burn.dir.${id}`) }))} />
        </>) : null}
      </div>
      <div className="grid gap-1">
        <Label className="text-xs text-muted-foreground">{t('burn.f.date')}</Label>
        <Input type="datetime-local" value={when} className="h-11 text-base" onChange={(e) => setWhen(e.target.value)} />
      </div>
      {err && <Warn tone="red">{t(err)}</Warn>}
      {notes.map((k) => <Warn key={k}>{t(k)}</Warn>)}
      <Button className="h-11 gap-2" disabled={t0 === null || ui.get().plan.burns.length >= MAX_BURNS} onClick={add}><Plus className="size-4" />{t('burn.add')}</Button>
      {two && <p className="text-[11px] leading-snug text-muted-foreground">{t('burn.add.hint2')}</p>}
    </div>
  )
}

// ---------- Timeline ----------
const W = 360, H = 138, Y_MARK = 28, Y_TOP = 54, Y_BOT = 100, Y_AXIS = 110

function Timeline({ chain, tank, selected, onSelect }: { chain: Chain; tank: number; selected: string | null; onSelect: (id: string) => void }) {
  const t = useT()
  const steps = chain.steps
  const maxDv = Math.max(...steps.map((s) => s.burn.dv), 1e-9)
  const sc = useMemo(() => timeScale(steps.map((s) => s.burn.t), W), [steps])
  const span = sc.t1 - sc.t0
  const lab = (x: number) => (span < 3 * 86400 ? fmtDateTime(x).slice(5) : fmtDate(x))
  const yProp = (p: number) => Y_BOT - (tank > 0 ? Math.max(0, Math.min(1, p / tank)) : 0) * (Y_BOT - Y_TOP)
  const xs = steps.map((s) => sc.x(s.burn.t))
  let d = `M${sc.x(sc.t0).toFixed(1)},${yProp(tank).toFixed(1)}`
  let prev = tank
  steps.forEach((s, i) => { d += `L${xs[i].toFixed(1)},${yProp(prev).toFixed(1)}L${xs[i].toFixed(1)},${yProp(s.propLeft).toFixed(1)}`; prev = s.propLeft })
  d += `L${sc.x(sc.t1).toFixed(1)},${yProp(prev).toFixed(1)}`
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full select-none" role="group" aria-label={t('burn.tl.aria')}>
      <line x1={18} x2={W - 18} y1={Y_MARK} y2={Y_MARK} stroke="currentColor" className="text-white/10" />
      <line x1={18} x2={W - 18} y1={Y_BOT} y2={Y_BOT} stroke="currentColor" strokeDasharray="2 3" className="text-white/20" />
      <line x1={18} x2={W - 18} y1={Y_TOP} y2={Y_TOP} stroke="currentColor" strokeDasharray="2 3" className="text-white/10" />
      <text x={W - 18} y={Y_TOP - 3} textAnchor="end" className="fill-muted-foreground" fontSize="8">{t('burn.tl.gauge')} {f(tank, 0)} kg</text>
      <text x={W - 18} y={Y_BOT + 9} textAnchor="end" className="fill-muted-foreground" fontSize="8">0</text>
      <path d={d} fill="none" stroke="#38bdf8" strokeWidth={1.6} strokeLinejoin="round" />
      <line x1={18} x2={W - 18} y1={Y_AXIS} y2={Y_AXIS} stroke="currentColor" className="text-white/30" />
      {sc.ticks.map((x, i) => (
        <g key={i}>
          <line x1={sc.x(x)} x2={sc.x(x)} y1={Y_AXIS} y2={Y_AXIS + 4} stroke="currentColor" className="text-white/40" />
          <text x={sc.x(x)} y={Y_AXIS + 15} textAnchor={i === 0 ? 'start' : i === sc.ticks.length - 1 ? 'end' : 'middle'} className="fill-muted-foreground" fontSize="9">{lab(x)}</text>
        </g>
      ))}
      {steps.map((s, i) => {
        const r = 4 + 7 * Math.sqrt(s.burn.dv / maxDv), sel = s.burn.id === selected
        const col = s.ok ? '#34d399' : '#f87171'
        return (
          <g key={s.burn.id} role="button" tabIndex={0} aria-label={`${s.burn.name}, ${fmtMs(s.burn.dv)} m/s`} className="cursor-pointer outline-none"
            onClick={() => onSelect(s.burn.id)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(s.burn.id) } }}>
            <line x1={xs[i]} x2={xs[i]} y1={Y_MARK} y2={Y_BOT} stroke={col} strokeOpacity={0.35} strokeWidth={1} />
            <circle cx={xs[i]} cy={Y_MARK} r={22} fill="transparent" />
            <circle cx={xs[i]} cy={Y_MARK} r={r} fill={col} fillOpacity={0.85} stroke={sel ? '#fff' : 'none'} strokeWidth={2} />
            <circle cx={xs[i]} cy={yProp(s.propLeft)} r={2.5} fill={col} />
          </g>
        )
      })}
    </svg>
  )
}

// ---------- One burn row + editor ----------
const when = (b: Burn) => fmtDateTime(b.t)

function BurnRow({ step, open, thrust }: { step: Step; open: boolean; thrust: number | null }) {
  const t = useT()
  const b = step.burn
  const long = burnIsLong(step)
  return (
    <li className={`rounded-lg border ${step.ok ? 'border-white/10' : 'border-red-400/40'} bg-white/[0.03]`}>
      <button type="button" aria-expanded={open} onClick={() => ui.set({ sel: open ? null : b.id })}
        className="grid min-h-14 w-full gap-0.5 rounded-lg px-3 py-2 text-left active:bg-white/10">
        <span className="flex items-baseline justify-between gap-2">
          <span className="min-w-0 truncate text-[13px] font-medium">{b.name}</span>
          <span className="shrink-0 text-sm font-semibold tabular-nums">{fmtMs(b.dv)} m/s</span>
        </span>
        <span className="flex items-baseline justify-between gap-2 text-[11px] tabular-nums text-muted-foreground">
          <span>{when(b)} UTC{b.dir ? ` · ${t(`burn.dir.${b.dir}`)}` : ''}</span>
          <span className={step.ok ? '' : 'text-red-300'}>{step.ok ? t('burn.row.dvleft', { dv: fmtMs(step.dvLeft) }) : step.prop > 0 ? t('burn.row.short', { dv: fmtMs(step.shortDv) }) : t('burn.row.unfunded')}</span>
        </span>
        <span className="flex items-baseline justify-between gap-2 text-[11px] tabular-nums text-muted-foreground">
          <span>{t('burn.row.mass', { a: f(step.mBefore, 1), b: f(step.mAfter, 1) })}</span>
          <span>{step.duration !== null ? `${t('burn.dur')} ${fmtDur(step.duration)}` : t('burn.row.prop', { p: f(step.prop, 1) })}</span>
        </span>
      </button>
      {long && <div className="px-3 pb-2"><Warn>{step.ratio! > 1 ? t('burn.warn.longer') : t('burn.warn.long', { r: Math.round(step.ratio! * 100) })}</Warn></div>}
      {open && <Editor burn={b} step={step} thrust={thrust} />}
    </li>
  )
}

function fmtDur(s: number) {
  if (s < 90) return `${s.toFixed(s < 10 ? 1 : 0)} s`
  if (s < 5400) return `${(s / 60).toFixed(1)} min`
  return `${(s / 3600).toFixed(1)} h`
}

function Editor({ burn, step, thrust }: { burn: Burn; step: Step; thrust: number | null }) {
  const t = useT()
  return (
    <div className="grid gap-2.5 border-t border-white/10 px-3 py-3">
      <div className="grid gap-1">
        <Label className="text-xs text-muted-foreground">{t('burn.f.name')}</Label>
        <Input value={burn.name} maxLength={80} className="h-11 text-base" onChange={(e) => patchBurn(burn.id, { name: e.target.value })} />
      </div>
      <div className="grid gap-1">
        <Label className="text-xs text-muted-foreground">{t('burn.f.date')}</Label>
        <Input type="datetime-local" value={toLocalInput(burn.t)} className="h-11 text-base"
          onChange={(e) => { const v = fromLocalInput(e.target.value); if (v !== null) patchBurn(burn.id, { t: v }) }} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Num label={t('burn.f.dv')} unit="m/s" value={+ms(burn.dv).toFixed(2)} onChange={(v) => { if (v !== null && v > 0 && v <= 1e6) patchBurn(burn.id, { dv: v / 1000 }) }} />
        <Pick label={t('burn.f.dir')} value={(burn.dir ?? 'none') as Dir | 'none'} onChange={(v) => patchBurn(burn.id, { dir: v === 'none' ? null : v })}
          options={[...(burn.dir === null ? [{ id: 'none' as const, label: '—' }] : []), ...DIRS.map((id) => ({ id, label: t(`burn.dir.${id}`) }))]} />
      </div>
      {step.duration !== null && (
        <div className="text-[11px] text-muted-foreground">
          {t('burn.dur')}: <span className="tabular-nums text-foreground">{fmtDur(step.duration)}</span>
          {step.ratio !== null && <> · {t('burn.dur.ratio', { r: (step.ratio * 100).toFixed(step.ratio < 0.1 ? 1 : 0) })}</>}
          {thrust && step.ratio !== null && burnIsLong(step) && <div className="mt-1">{t('burn.warn.longNote')}</div>}
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" className="h-11 gap-2" onClick={() => jumpTo(burn.t)}><Crosshair className="size-4" />{t('burn.jump')}</Button>
        <Button variant="destructive" className="h-11 gap-2" onClick={() => { setPlan({ ...ui.get().plan, burns: ui.get().plan.burns.filter((b) => b.id !== burn.id) }); ui.set({ sel: null }) }}>
          <Trash2 className="size-4" />{t('burn.delete')}
        </Button>
      </div>
      <Button variant="ghost" className="h-11 gap-1 text-xs" onClick={() => ui.set({ sel: null })}><X className="size-4" />{t('burn.close')}</Button>
    </div>
  )
}

// ---------- Panel ----------
export function BurnsPanel() {
  const t = useT()
  const plan = ui.useStore((s) => s.plan)
  const sel = ui.useStore((s) => s.sel)
  const craft = useApp(activeCraft)
  const sol = useApp(selectedSolution)
  const [confirmClear, setConfirmClear] = useState(false)
  const [imported, setImported] = useState<string | null>(null)

  const sorted = useMemo(() => sortBurns(plan.burns), [plan.burns])
  const chain = useMemo(() => propellantChain(sorted, craft, plan.thrust), [sorted, craft, plan.thrust])
  const fail = chain.firstFail >= 0 ? chain.steps[chain.firstFail] : null
  const longCount = chain.steps.filter(burnIsLong).length
  const body = (id: BodyId) => t(`burn.b.${id}`)

  const doImport = () => {
    if (!sol) return
    const next = importRoute(plan, sol.events, (e) => t(`burn.ev.${e.kind}`, { body: body(e.body) }))
    const added = next.burns.filter((b) => b.src === 'route')
    setPlan({ ...next, burns: next.burns.slice(0, MAX_BURNS) })
    setImported(t('burn.import.done', { n: added.length, dv: (added.reduce((a, b) => a + b.dv, 0) * 1000).toFixed(0) }))
  }
  const clear = () => {
    if (!confirmClear) { setConfirmClear(true); setTimeout(() => setConfirmClear(false), 4000); return }
    setConfirmClear(false); setImported(null)
    setPlan(emptyPlan()); ui.set({ sel: null })
  }

  return (
    <div className="grid gap-4">
      <p className="text-xs text-muted-foreground">{t('burn.intro')}</p>

      <Section title={t('burn.sec.craft')}>
        <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs tabular-nums">
          {t('burn.craft', { dry: f(craft.dry, 0), prop: f(craft.prop, 0), isp: f(craft.isp, 0), dv: chain.valid ? (chain.budget * 1000).toFixed(0) : '—' })}
          <div className="mt-0.5 text-[11px] text-muted-foreground">{t('burn.craft.hint')}</div>
        </div>
        <Num label={t('burn.thrust')} unit="N" value={plan.thrust} onChange={(v) => setPlan({ ...plan, thrust: v !== null && v > 0 ? v : null })} />
        {!chain.valid && <Warn tone="red">{t('burn.warn.craft')}</Warn>}
      </Section>

      <Section title={t('burn.sec.timeline')}>
        {sorted.length === 0 ? <p className="text-xs text-muted-foreground">{t('burn.tl.empty')}</p> : (
          <div className="rounded-lg border border-white/10 bg-white/[0.03] px-1 py-2">
            <Timeline chain={chain} tank={craft.prop} selected={sel} onSelect={(id) => ui.set({ sel: sel === id ? null : id })} />
            <div className="flex items-center gap-3 px-2 text-[10px] text-muted-foreground">
              <span className="inline-flex items-center gap-1"><span className="size-2 rounded-full bg-emerald-400" />Δv</span>
              <span className="inline-flex items-center gap-1"><span className="h-0.5 w-3 bg-sky-400" />{t('burn.tl.gauge')}</span>
              {fail && <span className="inline-flex items-center gap-1"><span className="size-2 rounded-full bg-red-400" />{t('burn.tl.fail')}</span>}
            </div>
          </div>
        )}
        {fail && (
          <Warn tone="red">
            <p className="font-medium">{t('burn.warn.fail', {
              name: fail.burn.name, date: fmtDateTime(fail.burn.t), need: f(fail.prop + fail.shortProp, 1), left: f(fail.prop, 1), dv: (fail.shortDv * 1000).toFixed(0),
            })}</p>
            {chain.steps.length - chain.firstFail - 1 > 0 && <p className="mt-1">{t('burn.warn.after', { n: chain.steps.length - chain.firstFail - 1 })}</p>}
          </Warn>
        )}
        {longCount > 0 && <Warn>{t('burn.warn.thrust', { n: longCount })} {t('burn.warn.longNote')}</Warn>}
      </Section>

      <Section title={t('burn.sec.list', { n: sorted.length })}>
        {sorted.length === 0 ? <p className="text-xs text-muted-foreground">{t('burn.empty')}</p> : (
          <ol className="grid gap-1.5">{chain.steps.map((s) => <BurnRow key={s.burn.id} step={s} open={sel === s.burn.id} thrust={plan.thrust} />)}</ol>
        )}
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" className="h-11 gap-2" disabled={!sol} onClick={doImport}><FileInput className="size-4" />{t('burn.import')}</Button>
          <Button variant={confirmClear ? 'destructive' : 'outline'} className="h-11 gap-2" disabled={plan.burns.length === 0 && plan.thrust === null} onClick={clear}>
            <Trash2 className="size-4" />{confirmClear ? t('burn.clear.sure') : t('burn.clear')}
          </Button>
        </div>
        {!sol && <p className="text-[11px] leading-snug text-muted-foreground">{t('burn.import.none')}</p>}
        {imported && sol && <p className="text-[11px] leading-snug text-muted-foreground">{imported}</p>}
      </Section>

      {sorted.length > 0 && (
        <Section title={t('burn.sec.summary')}>
          <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
            <KV k={t('burn.sum.total')} v={`${(chain.totalDv * 1000).toFixed(0)} m/s`} />
            <KV k={t('burn.sum.budget')} v={chain.valid ? `${(chain.budget * 1000).toFixed(0)} m/s` : '—'} />
            <KV k={t('burn.sum.prop')} v={`${f(chain.totalProp, 1)} / ${f(craft.prop, 0)} kg`} />
            <KV k={t('burn.sum.left')} v={`${f(chain.propLeft, 1)} kg`} />
            <KV k={t('burn.sum.dvleft')} v={`${chain.steps.length ? fmtMs(chain.steps[chain.steps.length - 1].dvLeft) : '—'} m/s`} strong={!fail} />
            <KV k={t('burn.sum.final')} v={`${f(chain.mFinal, 1)} kg`} />
          </div>
        </Section>
      )}

      <Section title={t('burn.sec.add')}>
        <AddForm />
      </Section>
    </div>
  )
}
