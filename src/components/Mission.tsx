import { useEffect, useMemo, useRef, useState } from 'react'
import MgaWorker from '@/lib/mga.worker.ts?worker&inline'
import { Crosshair, Play, Rocket, ScanSearch, Share2, Bookmark, Trash2, TriangleAlert } from 'lucide-react'
import { Capacitor } from '@capacitor/core'
import { Share } from '@capacitor/share'
import { deleteMission, loadMissions, saveMission, type SavedMission } from '@/lib/missions'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { BODIES, DAY, DEG, G0, MU_EARTH, RE, dvBudget, fmtDate, fmtDuration, moonPlan, toJ2000, type BodyId } from '@/lib/astro'
import type { ArrivalKind, MgaInput, Solution } from '@/lib/mga'
import { createStore } from '@/lib/mini-store'
import { SPEEDS, clock, closeupKey, fitRoute, jumpTo, openCloseup, patchActiveCraft, selectedSolution, store, toggleCloseup, useApp } from '@/lib/store'
import { massPlan, propForDry, wetMassFor } from '@/lib/telemetry'
import { CraftFields } from './Controls'
import { FleetBar } from './Fleet'
import { MissionChart } from './MissionChart'
import { KV, NumField, Section, Tex, f } from './bits'

const TARGETS: (BodyId | 'moon')[] = ['moon', 'mercury', 'venus', 'mars', 'ceres', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto']
const FLYBY_BODIES: BodyId[] = ['venus', 'earth', 'mars', 'jupiter', 'saturn']
const MUST_BODIES: BodyId[] = ['venus', 'earth', 'mars', 'jupiter', 'saturn']
const name = (b: BodyId | 'moon') => (b === 'moon' ? 'Maan' : BODIES[b].name)
const fromDateInput = (s: string) => toJ2000(Date.parse(s + 'T00:00:00Z'))

// Mission settings live outside the component so they survive switching tabs.
const settings = createStore({
  mode: 'arrival' as 'departure' | 'arrival',
  date: '2038-11-03',
  windowDays: 900,
  objective: 'mindv' as 'mindv' | 'fastest',
  maxFlybys: 2,
  fbBodies: FLYBY_BODIES,
  mustVisit: 'none' as BodyId | 'none',
  maxVinfDep: 0,
  maxVinfArr: 0,
  parkAlt: 200,
  arrival: 'ellipse' as ArrivalKind,
  capAlt: 500,
  capEcc: 0.9,
  fuelMode: 'given' as 'given' | 'dry',
})
const set = settings.set

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="grid min-w-0 gap-1">
    <Label className="text-xs text-muted-foreground">{label}</Label>
    {children}
  </div>
)

export function MissionPanel() {
  const target = useApp((s) => s.target)
  const solutions = useApp((s) => s.solutions)
  const selected = useApp((s) => s.selected)
  const moon = useApp((s) => s.moon)
  const craft = useApp((s) => s.craft)
  const S = settings.useStore((x) => x)
  const [busy, setBusy] = useState<{ p: number; label: string } | null>(null)
  const [noRoute, setNoRoute] = useState(false)
  const worker = useRef<Worker | null>(null)
  useEffect(() => () => worker.current?.terminate(), [])
  const [runTick, setRunTick] = useState(0) // a loaded mission re-runs the optimizer once its settings have landed in state
  useEffect(() => { if (runTick) run() }, [runTick]) // eslint-disable-line react-hooks/exhaustive-deps

  const budget = dvBudget(craft.dry, craft.prop, craft.isp)
  const isMoon = target === 'moon'
  const input = (): MgaInput => ({
    target: target as BodyId, maxFlybys: S.maxFlybys, flybyBodies: S.fbBodies, mode: S.mode, tRef: fromDateInput(S.date), windowDays: S.windowDays,
    objective: S.objective, dvBudget: budget, parkAlt: S.parkAlt, arrival: S.arrival, capAlt: S.capAlt, capEcc: S.capEcc,
    maxVinfDep: S.maxVinfDep > 0 ? S.maxVinfDep : undefined, maxVinfArr: S.maxVinfArr > 0 ? S.maxVinfArr : undefined,
    mustVisit: S.mustVisit === 'none' ? undefined : S.mustVisit,
  })

  const run = () => {
    if (isMoon) {
      const tDep = S.mode === 'departure' ? fromDateInput(S.date) : fromDateInput(S.date) - 5 * DAY
      const m = moonPlan(tDep, S.parkAlt, S.capAlt)
      store.set({ moon: m, solutions: [], selected: -1, view: 'earthmoon' })
      jumpTo(m.tDep)
      clock.target = SPEEDS[2].s
      return
    }
    worker.current?.terminate()
    const w = new MgaWorker()
    worker.current = w
    setBusy({ p: 0, label: 'Starten…' })
    setNoRoute(false)
    w.onmessage = (e) => {
      if (e.data.type === 'progress') setBusy({ p: e.data.p, label: e.data.label })
      else {
        const sols: Solution[] = e.data.solutions
        setBusy(null)
        setNoRoute(sols.length === 0)
        store.set({ solutions: sols, selected: sols.length ? 0 : -1, flybyIdx: -1, moon: null, view: 'solar', follow: 'none', camFit: sols[0] ? fitRoute(sols[0]) : 0 })
        if (sols[0]) jumpTo(sols[0].tDep)
        w.terminate()
      }
    }
    w.postMessage(input())
  }

  const select = (i: number) => {
    store.set({ selected: i, flybyIdx: -1, view: 'solar', simActive: false, follow: 'none', camFit: fitRoute(solutions[i]) })
    jumpTo(solutions[i].tDep)
  }

  const flybysForced = S.mustVisit !== 'none' && S.maxFlybys < (S.mustVisit === 'earth' ? 2 : 1)

  return (
    <div className="grid gap-4">
      <FleetBar />
      <CraftFields />
      <Separator />
      <Section title="Missie-instellingen">
        <div className="grid grid-cols-2 gap-2">
          <Field label="Bestemming">
            <Select value={target} onValueChange={(v) => store.set({ target: v as BodyId | 'moon' })}>
              <SelectTrigger className="h-8 w-full"><SelectValue /></SelectTrigger>
              <SelectContent>{TARGETS.map((t) => <SelectItem key={t} value={t}>{name(t)}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Datum is…">
            <ToggleGroup type="single" variant="outline" size="sm" value={S.mode} onValueChange={(v) => v && set({ mode: v as typeof S.mode })} className="w-full">
              <ToggleGroupItem value="departure" className="flex-1 text-xs">Vertrek</ToggleGroupItem>
              <ToggleGroupItem value="arrival" className="flex-1 text-xs">Aankomst</ToggleGroupItem>
            </ToggleGroup>
          </Field>
          <Field label={S.mode === 'departure' ? 'Vroegste vertrek' : 'Aankomst op'}>
            <Input type="date" className="h-8" value={S.date} onChange={(e) => e.target.value && set({ date: e.target.value })} />
          </Field>
          {S.mode === 'departure' && !isMoon
            ? <NumField label="Zoekvenster" unit="dagen" value={S.windowDays} onChange={(v) => set({ windowDays: Math.max(10, v) })} />
            : <div />}
        </div>

        {!isMoon && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Optimaliseer">
                <Select value={S.mode === 'arrival' ? 'mindv' : S.objective} disabled={S.mode === 'arrival'} onValueChange={(v) => set({ objective: v as typeof S.objective })}>
                  <SelectTrigger className="h-8 w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mindv">Minimale Δv</SelectItem>
                    <SelectItem value="fastest">Snelst binnen Δv-budget</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Max. gravity assists">
                <Select value={String(S.maxFlybys)} onValueChange={(v) => set({ maxFlybys: +v })}>
                  <SelectTrigger className="h-8 w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>{[0, 1, 2].map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
            </div>
            <Field label="Verplichte gravity assist langs">
              <Select value={S.mustVisit} onValueChange={(v) => set({ mustVisit: v as typeof S.mustVisit })}>
                <SelectTrigger className="h-8 w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Geen (optimaliseer vrij)</SelectItem>
                  {MUST_BODIES.filter((b) => b !== target).map((b) => <SelectItem key={b} value={b}>{BODIES[b].name}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            {flybysForced && (
              <p className="text-[10.5px] text-muted-foreground">
                Het aantal gravity assists wordt automatisch verhoogd naar {S.mustVisit === 'earth' ? 2 : 1} om {BODIES[S.mustVisit as BodyId].name} te kunnen aandoen{S.mustVisit === 'earth' ? ' (eerst een ander lichaam, dan de Aarde)' : ''}.
              </p>
            )}
            {(S.maxFlybys > 0 || S.mustVisit !== 'none') && (
              <div className="grid gap-1">
                <span className="text-xs text-muted-foreground">Toegestane gravity-assist-lichamen</span>
                <div className="flex flex-wrap gap-x-3 gap-y-1.5">
                  {FLYBY_BODIES.map((b) => (
                    <label key={b} className="flex items-center gap-1.5 text-xs">
                      <Checkbox checked={S.fbBodies.includes(b)} onCheckedChange={(c) => set({ fbBodies: c ? [...S.fbBodies, b] : S.fbBodies.filter((x) => x !== b) })} />
                      {BODIES[b].name}
                    </label>
                  ))}
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <NumField label="Max. v∞ vertrek" unit="km/s" step={0.5} min={0} value={S.maxVinfDep} onChange={(v) => set({ maxVinfDep: Math.max(0, v) })} />
              <NumField label="Max. v∞ aankomst" unit="km/s" step={0.5} min={0} value={S.maxVinfArr} onChange={(v) => set({ maxVinfArr: Math.max(0, v) })} />
            </div>
            <p className="text-[10.5px] text-muted-foreground">
              0 = geen limiet. v∞ is de overschotsnelheid; C3 = v∞² (raketten worden met C3 opgegeven)
              {S.maxVinfDep > 0 && <> · vertrek: C3 ≤ {f(S.maxVinfDep ** 2, 1)} km²/s²</>}
              {S.maxVinfArr > 0 && <> · aankomst: C3 ≤ {f(S.maxVinfArr ** 2, 1)} km²/s²</>}.
            </p>
          </>
        )}

        <div className="grid grid-cols-2 gap-2">
          <NumField label="Parkeerbaan" unit="km" value={S.parkAlt} onChange={(v) => set({ parkAlt: Math.max(150, v) })} />
          {!isMoon && (
            <Field label="Aankomst">
              <Select value={S.arrival} onValueChange={(v) => set({ arrival: v as ArrivalKind })}>
                <SelectTrigger className="h-8 w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="flyby">Alleen flyby</SelectItem>
                  <SelectItem value="ellipse">Elliptische capture</SelectItem>
                  <SelectItem value="circle">Cirkelbaan</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          )}
          <NumField label={isMoon ? 'Maanbaan' : 'Periapsis-hoogte'} unit="km" value={S.capAlt} onChange={(v) => set({ capAlt: Math.max(10, v) })} />
          {!isMoon && S.arrival === 'ellipse' && (
            <NumField label="Excentriciteit" value={S.capEcc} step={0.05} onChange={(v) => set({ capEcc: Math.min(0.99, Math.max(0, v)) })} />
          )}
        </div>
        <Button onClick={run} disabled={!!busy}><Rocket /> Bereken optimale route</Button>
        {busy && (
          <div className="grid gap-1">
            <Progress value={busy.p * 100} />
            <span className="text-[11px] text-muted-foreground">{busy.label}</span>
          </div>
        )}
        {noRoute && !busy && (
          <p className="flex items-start gap-1.5 text-xs text-amber-400">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
            Geen route gevonden. Sta meer gravity-assist-lichamen toe (bij een verplichte assist moet dat lichaam erbij staan) of verruim de datum/het zoekvenster.
          </p>
        )}
      </Section>

      <SavedMissions params={S as unknown as Record<string, unknown>} onLoad={(m) => {
        store.set({ target: m.target as BodyId | 'moon' })
        patchActiveCraft(m.craft)
        set(m.params as Partial<typeof S>)
        setRunTick((n) => n + 1)
      }} />

      {moon && isMoon && <MoonResult />}

      {solutions.length > 0 && (
        <>
          <Separator />
          <Section title={`Routes (${solutions.length}) — klik om te tonen`}>
            <Table className="text-xs">
              <TableHeader>
                <TableRow>
                  <TableHead className="h-7 px-1.5">Route</TableHead>
                  <TableHead className="h-7 px-1.5">Vertrek</TableHead>
                  <TableHead className="h-7 px-1.5">Duur</TableHead>
                  <TableHead className="h-7 px-1.5 text-right">Δv</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {solutions.map((s, i) => (
                  <TableRow key={i} data-state={i === selected ? 'selected' : undefined} className="cursor-pointer" onClick={() => select(i)}>
                    <TableCell className="px-1.5 py-1.5">
                      <div className="flex flex-wrap items-center gap-0.5">
                        {s.seq.map((b, k) => <Badge key={k} variant={k === 0 || k === s.seq.length - 1 ? 'secondary' : 'default'} className="h-4 px-1 text-[10px]">{BODIES[b].name.slice(0, 3)}</Badge>)}
                        {s.tag === 'snelst' && <Badge variant="outline" className="h-4 px-1 text-[10px]">snelst</Badge>}
                      </div>
                    </TableCell>
                    <TableCell className="px-1.5 tabular-nums">{fmtDate(s.tDep)}</TableCell>
                    <TableCell className="px-1.5 whitespace-nowrap tabular-nums">{fmtDuration(s.tof)}</TableCell>
                    <TableCell className={`px-1.5 text-right font-medium tabular-nums ${s.feasible ? 'text-emerald-400' : 'text-amber-400'}`}>{f(s.dv)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <p className="text-[10.5px] text-muted-foreground">Groen = past binnen je Δv-budget ({f(budget)} km/s) en de v∞-limieten, oranje = te duur voor dit ruimtevaartuig of limiet overschreden.</p>
          </Section>
          <SolutionDetails />
        </>
      )}
    </div>
  )
}

function SolutionDetails() {
  const sol = useApp(selectedSolution)
  const craft = useApp((s) => s.craft)
  const autoCloseup = useApp((s) => s.autoCloseup)
  const off = useApp((s) => s.closeupOff)
  const plan = useMemo(() => (sol ? massPlan(sol, craft) : null), [sol, craft])
  const S = settings.useStore((x) => x)
  if (!sol || !plan) return null
  const simulate = () => {
    store.set({ simActive: true, view: 'solar', follow: 'craft', flybyIdx: -1 })
    jumpTo(sol.tDep)
    clock.target = SPEEDS[4].s
    clock.paused = false
  }
  const title = (e: Solution['events'][number]) =>
    e.kind === 'launch' ? `Lancering vanaf ${BODIES[e.body].name}` : e.kind === 'flyby' ? `Gravity assist ${BODIES[e.body].name}` : `Aankomst ${BODIES[e.body].name}`
  const over = (v: number, lim?: number) => !!lim && v > lim + 1e-9
  const lastK = sol.events.length - 1
  return (
    <>
      <Separator />
      <Section title="Gekozen route — per stap">
        <div className="grid gap-2">
          {sol.events.map((e, k) => {
            const st = plan.steps[k]
            const limit = k === 0 ? S.maxVinfDep : k === lastK ? S.maxVinfArr : 0
            return (
              <div key={k} className="rounded-lg border bg-muted/30 p-2">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="min-w-0 text-xs font-medium">{title(e)}</span>
                  <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">{fmtDate(e.t)}</span>
                </div>
                <KV k="Δv van de motor" v={`${f(e.dv, 3)} km/s`} strong />
                <KV k="v∞ · C3 = v∞²" v={<span className={over(e.vinf, limit) ? 'text-amber-400' : ''}>{f(e.vinf)} km/s · {f(e.vinf ** 2, 1)} km²/s²</span>} />
                <KV k="Brandstof dit manoeuvre" v={`${f(st.prop, st.prop < 10 ? 1 : 0)} kg`} />
                <KV k="Massa erna" v={`${st.mAfter.toFixed(0)} kg`} />
                {e.kind === 'launch' && (
                  <Tex block tex={`\\Delta v = \\sqrt{v_\\infty^2 + \\tfrac{2\\mu_\\oplus}{r_p}} - \\sqrt{\\tfrac{\\mu_\\oplus}{r_p}}`} />
                )}
                {e.kind === 'flyby' && (
                  <>
                    <KV k="Afbuighoek δ nodig / max. gratis" v={`${f(e.turn! / DEG, 1)}° / ${f(e.turnMax! / DEG, 1)}°`} />
                    <KV k="Zonsnelheid vóór → na" v={`${f(e.vHelioIn!)} → ${f(e.vHelioOut!)} km/s`} />
                    <KV k="Snelheidswinst door planeet" v={`${f(e.vHelioOut! - e.vHelioIn!)} km/s`} strong />
                  </>
                )}
                {e.kind === 'arrival' && <KV k="Snelheid t.o.v. Zon" v={`${f(e.vHelioIn!)} km/s`} />}
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => jumpTo(e.t)}><Crosshair /> Ga naar tijdstip</Button>
                  {e.kind === 'flyby' && <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => openCloseup(sol, k)}><ScanSearch /> Close-up</Button>}
                  {e.kind === 'flyby' && (
                    <label className="ml-auto flex items-center gap-1.5 text-xs">
                      <Checkbox checked={!off.includes(closeupKey(sol, k))} onCheckedChange={() => toggleCloseup(sol, k)} />
                      Automatisch close-up
                    </label>
                  )}
                </div>
              </div>
            )
          })}
        </div>
        <KV k="Totale Δv" v={`${f(sol.dv, 3)} km/s`} strong />
        <KV k="Reistijd" v={`${fmtDuration(sol.tof)} (${fmtDate(sol.tDep)} → ${fmtDate(sol.tArr)})`} />
        <FuelShort plan={plan} />
        {!!sol.limitExcess && <p className="flex items-start gap-1.5 text-xs text-amber-400"><TriangleAlert className="mt-0.5 size-3.5 shrink-0" />De v∞-limiet is niet te halen binnen dit zoekvenster; dit is de dichtstbijzijnde route.</p>}
        <div className="flex items-center justify-between text-xs">
          <span>Automatische close-up tijdens de simulatie</span>
          <Switch checked={autoCloseup} onCheckedChange={(v) => store.set({ autoCloseup: v })} />
        </div>
        <Button onClick={simulate}><Play /> Simuleer de vlucht</Button>
      </Section>

      <Separator />
      <Section title="Δv over de missie">
        <MissionChart sol={sol} craft={craft} />
      </Section>

      <Separator />
      <FuelSection sol={sol} />
    </>
  )
}

/** One clear red line when the tank cannot deliver the route's Δv; masses elsewhere are then counted from the required wet mass. */
function FuelShort({ plan }: { plan: ReturnType<typeof massPlan> }) {
  const craft = useApp((s) => s.craft)
  if (plan.ok) return null
  return (
    <div className="grid gap-1.5 rounded-md border border-red-500/40 bg-red-500/10 p-2 text-xs text-red-400">
      <p className="flex items-start gap-1.5">
        <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
        Te weinig brandstof: nodig {plan.totalProp.toFixed(0)} kg, tank {craft.prop.toFixed(0)} kg (tekort {plan.shortfall.toFixed(0)} kg)
      </p>
      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => patchActiveCraft({ prop: Math.ceil(plan.totalProp) })}>
        Zet brandstof op {Math.ceil(plan.totalProp)} kg
      </Button>
    </div>
  )
}

/** Tsiolkovsky bookkeeping for the whole route, in both directions (tank → Δv budget, dry mass → propellant). */
function FuelSection({ sol }: { sol: Solution }) {
  const craft = useApp((s) => s.craft)
  const mode = settings.useStore((x) => x.fuelMode)
  const plan = massPlan(sol, craft)
  const n = (x: number, d = 0) => x.toFixed(d)
  const need = propForDry(craft.dry, sol.dv, craft.isp)
  const x = sol.dv / (craft.isp * G0) // Δv/(Isp·g0), dimensionless
  return (
    <Section title="Brandstof — Tsiolkovsky">
      <ToggleGroup type="single" variant="outline" size="sm" value={mode} onValueChange={(v) => v && set({ fuelMode: v as typeof mode })} className="grid w-full grid-cols-2 gap-1">
        <ToggleGroupItem value="given" className="h-auto min-w-0 whitespace-normal px-2 py-1.5 text-[11px] leading-tight">Gegeven brandstof → Δv-budget</ToggleGroupItem>
        <ToggleGroupItem value="dry" className="h-auto min-w-0 whitespace-normal px-2 py-1.5 text-[11px] leading-tight">Gegeven droge massa → benodigde brandstof</ToggleGroupItem>
      </ToggleGroup>

      {mode === 'given' ? (
        <>
          <KV k={plan.ok ? 'Massa begin m₀ (droog + brandstof)' : 'Massa begin m₀ (benodigd, droog + brandstof)'} v={`${n(plan.m0)} kg`} />
          <KV k="Massa eind m_f (na alle burns)" v={`${n(plan.mFinal)} kg`} strong />
          <KV k="Brandstof nodig voor deze route" v={`${n(plan.totalProp)} kg`} />
          <KV k="Brandstof in de tank" v={`${n(craft.prop)} kg`} />
          <KV k="Brandstof over na aankomst" v={<span className={plan.ok ? '' : 'text-red-400'}>{n(plan.remaining)} kg</span>} />
          <KV k="Δv-budget van de tank / nodig" v={<span className={plan.ok ? '' : 'text-amber-400'}>{f(plan.budget)} / {f(plan.totalDv)} km/s</span>} />
          <Tex block tex={`\\begin{aligned} m_f &= m_0\\,e^{-\\Delta v/(I_{sp}g_0)} \\\\ &= ${n(plan.m0)}\\cdot e^{-${f(x, 3)}} = ${n(plan.m0)}\\cdot ${f(Math.exp(-x), 4)} = ${n(plan.mFinal)}\\ \\text{kg} \\end{aligned}`} />
        </>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            <NumField label="Droge massa m_f" unit="kg" min={1} value={craft.dry} onChange={(v) => patchActiveCraft({ dry: Math.max(1, v) })} />
            <NumField label="Isp" unit="s" value={craft.isp} onChange={(v) => patchActiveCraft({ isp: Math.max(1, v) })} />
          </div>
          <KV k="Benodigde brandstof" v={`${n(need)} kg`} strong />
          <KV k="Massa begin m₀ = droog + brandstof" v={`${n(wetMassFor(craft.dry, sol.dv, craft.isp))} kg`} />
          <KV k="Totale Δv van de route" v={`${f(sol.dv, 3)} km/s`} />
          <Tex block tex={`\\begin{aligned} m_0 &= m_f\\,e^{\\Delta v/(I_{sp}g_0)} \\\\ &= ${n(craft.dry)}\\cdot e^{${f(x, 3)}} = ${n(craft.dry)}\\cdot ${f(Math.exp(x), 4)} = ${n(wetMassFor(craft.dry, sol.dv, craft.isp))}\\ \\text{kg} \\end{aligned}`} />
          <Button size="sm" variant="outline" disabled={Math.ceil(need) === craft.prop} onClick={() => patchActiveCraft({ prop: Math.ceil(need) })}>
            Zet brandstof op {Math.ceil(need)} kg
          </Button>
        </>
      )}
      <p className="text-[10.5px] text-muted-foreground">
        Elke burn verlaagt de massa met factor e<sup>−Δv/(Isp·g₀)</sup>; de stappen hierboven volgen elkaar op, dus de totale brandstof is gelijk aan één raketvergelijking over de som van alle Δv's. Geen reserve of boil-off meegerekend.
      </p>
    </Section>
  )
}

function MoonResult() {
  const m = useApp((s) => s.moon)!
  return (
    <Section title="Maanmissie (TLI + LOI, patched conic)">
      <KV k="TLI vanuit parkeerbaan" v={`${f(m.tli, 3)} km/s`} strong />
      <KV k="v∞ bij de Maan" v={`${f(m.vinf, 3)} km/s`} />
      <KV k="LOI (inschieten in maanbaan)" v={`${f(m.loi, 3)} km/s`} strong />
      <KV k="Totaal" v={`${f(m.total, 3)} km/s`} strong />
      <KV k="Vertrek → aankomst" v={`${fmtDate(m.tDep)} → ${fmtDate(m.tArr)} (${fmtDuration(m.tArr - m.tDep)})`} />
      <Tex block tex={`\\Delta v_{TLI} = \\sqrt{\\mu_\\oplus\\left(\\tfrac{2}{r_p}-\\tfrac{1}{a}\\right)} - \\sqrt{\\tfrac{\\mu_\\oplus}{r_p}},\\ a = \\tfrac{${(m.rPark).toFixed(0)} + ${m.rMoon.toFixed(0)}}{2}`} />
      <Tex block tex={`\\Delta v_{LOI} = \\sqrt{v_\\infty^2 + \\tfrac{2\\mu_{Maan}}{r}} - \\sqrt{\\tfrac{\\mu_{Maan}}{r}}`} />
      <p className="text-[10.5px] text-muted-foreground">μ⊕ = {MU_EARTH} km³/s², R⊕ = {RE} km. Bekijk de transfer in de Aarde–Maan weergave.</p>
    </Section>
  )
}

/** What the share sheet sends: a plain-text summary of the selected route (or of the Moon plan's target). */
function shareText(sol: Solution | null, target: string) {
  if (!sol) return `Periapsis · missie naar ${target === 'moon' ? 'de Maan' : BODIES[target as BodyId].name}`
  const route = sol.seq.map((b) => BODIES[b].name).join(' → ')
  return `Periapsis · ${route}\nVertrek ${fmtDate(sol.tDep)} · aankomst ${fmtDate(sol.tArr)} · ${fmtDuration(sol.tof)}\nΔv ${sol.dv.toFixed(2)} km/s${sol.feasible ? '' : ' (boven het Δv-budget)'}`
}

/** Save the current mission set-up, load an earlier one (re-runs the optimizer), or share the selected route as text. */
function SavedMissions({ params, onLoad }: { params: Record<string, unknown>; onLoad: (m: SavedMission) => void }) {
  const [list, setList] = useState(loadMissions)
  const target = useApp((s) => s.target)
  const craft = useApp((s) => s.craft)
  const sol = useApp(selectedSolution)
  const [note, setNote] = useState('')
  const flash = (t: string) => { setNote(t); setTimeout(() => setNote(''), 2500) }
  const label = `${target === 'moon' ? 'Maan' : BODIES[target as BodyId].name} · ${String(params.date)}`
  const share = async () => {
    const text = shareText(sol, target)
    try {
      if (Capacitor.isNativePlatform()) await Share.share({ title: 'Periapsis missie', text })
      else if (navigator.share) await navigator.share({ title: 'Periapsis missie', text })
      else { await navigator.clipboard.writeText(text); flash('Gekopieerd naar het klembord') }
    } catch { /* the user closed the share sheet */ }
  }
  return (
    <Section title="Opgeslagen missies">
      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" className="h-11" onClick={() => { setList(saveMission({ name: label, target, craft, params })); flash('Missie opgeslagen') }}><Bookmark /> Opslaan</Button>
        <Button variant="outline" className="h-11" onClick={share}><Share2 /> Delen</Button>
      </div>
      {note && <p role="status" className="text-xs text-emerald-400">{note}</p>}
      {list.length === 0 ? <p className="text-xs text-muted-foreground">Nog niets opgeslagen. Sla een set-up op om hem later met één tik terug te zetten.</p> : (
        <ul className="grid gap-1.5">
          {list.map((m) => (
            <li key={m.id} className="flex items-center gap-1 rounded-lg border bg-muted/30 pl-3">
              <button type="button" className="min-h-11 min-w-0 flex-1 text-left" onClick={() => onLoad(m)}>
                <div className="truncate text-sm font-medium">{m.name}</div>
                <div className="text-[11px] text-muted-foreground">{new Date(m.savedAt).toLocaleDateString('nl-NL')} · tik om te laden</div>
              </button>
              <Button size="icon" variant="ghost" className="size-11 shrink-0" aria-label={`Verwijder ${m.name}`} onClick={() => setList(deleteMission(m.id))}><Trash2 /></Button>
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}
