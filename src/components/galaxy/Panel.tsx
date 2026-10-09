// Left-panel tab "Melkweg": destination, flight playback, propulsion & speed, results with live formulas.
import { Pause, Play, RotateCcw } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import {
  AGE_GALAXY_YR, BODIES, CUSTOM_ID, C_KMS, G0_MS2, LY_KM, SUN_GC_LY, YEAR_S, betaToKms, fmtKms, fmtLy, fmtYears, fmtYearsText, gamma, nl, nlSig, timeContext, type Model,
} from '@/lib/galaxy'
import { ION_PRESETS, currentPlan, currentTarget, flight, gstore, resetFlight, setCam, setTarget, type CamMode } from '@/lib/galaxy-store'
import { cn } from '@/lib/utils'
import { KV, NumField, Section, Tex } from '../bits'

const AU_KM = 149597870.7

/** number → TeX with decimal comma, thin-space grouping, scientific notation for extremes */
function tx(x: number, sig = 3): string {
  if (!Number.isFinite(x)) return '\\infty'
  if (x === 0) return '0'
  const a = Math.abs(x)
  if (a >= 1e7 || a < 1e-3) { const e = Math.floor(Math.log10(a)); return `${tx(x / 10 ** e, sig)}\\times10^{${e}}` }
  return nlSig(x, sig).replace(',', '{,}').replace(/\u202f/g, '\\,')
}

function useTick(ms = 150) {
  const [, set] = useState(0)
  useEffect(() => { const id = setInterval(() => set((x) => x + 1), ms); return () => clearInterval(id) }, [ms])
}

const Bron = ({ children }: { children: ReactNode }) => <p className="text-[10.5px] leading-snug text-muted-foreground">Bron: {children}</p>
const Note = ({ children, tone }: { children: ReactNode; tone?: 'warn' }) => (
  <p className={cn('rounded-md border px-2 py-1.5 text-[11px] leading-snug', tone === 'warn' ? 'border-amber-500/40 bg-amber-500/10 text-amber-200' : 'border-border bg-muted/30 text-muted-foreground')}>{children}</p>
)
const Pick = ({ active, onClick, children, className }: { active: boolean; onClick: () => void; children: ReactNode; className?: string }) => (
  <Button size="sm" variant="outline" onClick={onClick}
    className={cn('h-8 justify-start px-2 text-xs font-normal', active && 'border-cyan-400/70 bg-cyan-500/15 text-cyan-100 hover:bg-cyan-500/20', className)}>
    {children}
  </Button>
)

// ======================================================================= destination
function TargetSection() {
  const id = gstore.useStore((s) => s.targetId)
  const c = gstore.useStore((s) => s.custom)
  const t = currentTarget()
  const body = BODIES.find((b) => b.id === id)
  return (
    <Section title="Bestemming (vanaf de Zon)">
      <Select value={id} onValueChange={setTarget}>
        <SelectTrigger size="sm" className="w-full text-xs"><SelectValue /></SelectTrigger>
        <SelectContent className="max-h-[50dvh]">
          {BODIES.map((b) => <SelectItem key={b.id} value={b.id} className="text-xs">{b.name} — {fmtLy(b.d)}</SelectItem>)}
          <SelectItem value={CUSTOM_ID} className="text-xs">Eigen bestemming…</SelectItem>
        </SelectContent>
      </Select>
      {id === CUSTOM_ID && (
        <div className="grid grid-cols-3 gap-2">
          <NumField label="Afstand" unit="ly" value={c.d} min={0.01} step={10} onChange={(d) => gstore.set({ custom: { ...c, d: Math.max(0.01, d) } })} />
          <NumField label="Gal. lengte l" unit="°" value={c.l} step={5} onChange={(l) => gstore.set({ custom: { ...c, l } })} />
          <NumField label="Gal. breedte b" unit="°" value={c.b} step={5} onChange={(b) => gstore.set({ custom: { ...c, b: Math.max(-90, Math.min(90, b)) } })} />
        </div>
      )}
      <div>
        <KV k="Afstand tot de Zon" v={`ca. ${fmtLy(t.d)}`} strong />
        <KV k="Galactische l, b" v={`${nl(t.l, 1)}°, ${nl(t.b, 1)}°`} />
      </div>
      {body && <p className="text-[11px] leading-snug text-muted-foreground">{body.note}{body.id === 'rim' && ' Dit is de rand van de sterrenschijf (straal ca. 50 000 ly); de Melkweg is dus ca. 100 000 ly breed en de Zon staat niet in het midden.'}</p>}
    </Section>
  )
}

// ======================================================================= flight playback
const RATES = [0.1, 1, 2, 10, 100, 1000, 10000]
const CAMS: [CamMode, string][] = [['galaxy', 'Hele Melkweg'], ['sun', 'Rond de Zon'], ['overview', 'Overzicht route'], ['chase', 'Volg ruimtevaartuig'], ['dest', 'Kijk naar bestemming']]

function FlightSection() {
  useTick()
  const g = gstore.useStore((s) => s)
  const plan = currentPlan(), t = currentTarget()
  const s = Math.min(flight.s, plan.d), m = plan.profile(s)
  const done = s >= plan.d
  const yrPerSec = g.rate / m.beta
  const rateLabel = (r: number) => (r >= 1000 ? nl(r) : nl(r, 1))
  return (
    <Section title="Vlucht afspelen">
      <div className="flex gap-2">
        <Button size="sm" className="h-8 flex-1" onClick={() => { if (done) flight.s = 0; gstore.set({ playing: !g.playing || done }) }}>
          {g.playing && !done ? <><Pause /> Pauze</> : <><Play /> {s > 0 && !done ? 'Hervatten' : 'Afspelen'}</>}
        </Button>
        <Button size="sm" variant="outline" className="h-8" onClick={resetFlight}><RotateCcw /> Opnieuw</Button>
      </div>
      <div className="grid gap-1.5">
        <div className="flex items-baseline justify-between text-xs">
          <span className="text-muted-foreground">Afspeeltempo (afstand van het schip per seconde)</span>
        </div>
        <div className="flex flex-wrap gap-1">
          {RATES.map((r) => (
            <Pick key={r} active={Math.abs(Math.log10(g.rate / r)) < 0.02} onClick={() => gstore.set({ rate: r })} className="h-7 px-2 tabular-nums">{rateLabel(r)}</Pick>
          ))}
          <span className="self-center pl-1 text-[11px] text-muted-foreground">ly/s</span>
        </div>
        <Slider min={-1} max={4} step={0.01} value={[Math.log10(g.rate)]} onValueChange={([v]) => gstore.set({ rate: 10 ** v })} />
        <p className="text-[11px] leading-snug text-muted-foreground">
          {nlSig(g.rate, 3)} ly/s ≙ <span className="text-foreground">{fmtYearsText(yrPerSec)}</span> aardse tijd per seconde bij de huidige snelheid.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-1">
        {CAMS.map(([k, l]) => <Pick key={k} active={g.cam === k} onClick={() => setCam(k)} className={k === 'dest' ? 'col-span-2' : undefined}>{l}</Pick>)}
      </div>
      <div className="grid gap-1.5 rounded-md border bg-muted/20 p-2.5">
        <Progress value={(s / plan.d) * 100} className="h-1.5" />
        <div className="flex justify-between text-[11px] text-muted-foreground">
          <span>{done ? `Aangekomen bij ${t.name}` : 'Onderweg naar ' + t.name}</span><span className="tabular-nums">{nl((s / plan.d) * 100, 1)} %</span>
        </div>
        <KV k="Verstreken tijd (Aarde)" v={fmtYearsText(m.t)} />
        <KV k="Verstreken tijd (aan boord)" v={m.tau === null ? 'niet gedefinieerd (v ≥ c)' : fmtYearsText(m.tau)} />
        <KV k="Afgelegd" v={fmtLy(s)} />
        <KV k="Nog te gaan" v={fmtLy(plan.d - s)} />
        <KV k="Snelheid" v={`${fmtKms(betaToKms(m.beta))} · ${nlSig(m.beta * 100, 3)} % c`} />
      </div>
    </Section>
  )
}

// ======================================================================= propulsion & speed
const SPEEDS: { label: string; kms: number; sub?: string; fiction?: boolean }[] = [
  { label: 'Lichtsnelheid (c)', kms: C_KMS, sub: '299 792 km/s' },
  { label: '50 % van c', kms: C_KMS / 2, sub: '149 896 km/s' },
  { label: '10 % van c', kms: C_KMS / 10, sub: '29 979 km/s' },
  { label: '100 000 km/s', kms: 1e5, sub: '0,33 c' },
  { label: '100 miljoen km/s', kms: 1e8, sub: '333 c — sneller dan het licht: fictie', fiction: true },
]
const MODELS: [Model, string][] = [['ideal', 'Ideaal: constante kruissnelheid'], ['ion', 'Ionenmotor'], ['accel', 'Constante versnelling (fantasie-fusieschip)']]

function DriveSection() {
  const g = gstore.useStore((s) => s)
  const same = (a: number, b: number) => Math.abs(a / b - 1) < 1e-9
  const setIon = (p: Partial<typeof g.ion>) => gstore.set({ ion: { ...g.ion, ...p }, ionPreset: 'custom' })
  return (
    <Section title="Aandrijving & snelheid">
      <Select value={g.model} onValueChange={(v) => gstore.set({ model: v as Model })}>
        <SelectTrigger size="sm" className="w-full text-xs"><SelectValue /></SelectTrigger>
        <SelectContent>{MODELS.map(([v, l]) => <SelectItem key={v} value={v} className="text-xs">{l}</SelectItem>)}</SelectContent>
      </Select>

      {g.model === 'ideal' && (
        <>
          <div className="grid gap-1">
            {SPEEDS.map((p) => (
              <Pick key={p.label} active={same(g.vKms, p.kms)} onClick={() => gstore.set({ vKms: p.kms })} className="h-auto min-h-8 flex-col items-start gap-0 py-1">
                <span>{p.label}</span>
                <span className={cn('text-[10.5px]', p.fiction ? 'text-amber-300' : 'text-muted-foreground')}>{p.sub}</span>
              </Pick>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <NumField label="Eigen snelheid" unit="km/s" value={+g.vKms.toPrecision(6)} step={1000} min={0.001} onChange={(v) => gstore.set({ vKms: Math.max(1e-3, v) })} />
            <NumField label="…of als deel van c" unit="× c" value={+(g.vKms / C_KMS).toPrecision(6)} step={0.05} min={1e-9} onChange={(v) => gstore.set({ vKms: Math.max(1e-9, v) * C_KMS })} />
          </div>
        </>
      )}

      {g.model === 'ion' && (
        <>
          <Select value={g.ionPreset} onValueChange={(v) => { if (v !== 'custom') gstore.set({ ionPreset: v, ion: ION_PRESETS[v].ion }) }}>
            <SelectTrigger size="sm" className="w-full text-xs"><SelectValue placeholder="Eigen waarden" /></SelectTrigger>
            <SelectContent>
              {Object.entries(ION_PRESETS).map(([k, p]) => <SelectItem key={k} value={k} className="text-xs">{p.label}</SelectItem>)}
              <SelectItem value="custom" className="text-xs" disabled>Eigen waarden</SelectItem>
            </SelectContent>
          </Select>
          <div className="grid grid-cols-2 gap-2">
            <NumField label="Stuwkracht" unit="mN" value={+(g.ion.thrustN * 1000).toPrecision(6)} step={10} min={0.001} onChange={(v) => setIon({ thrustN: Math.max(1e-6, v / 1000) })} />
            <NumField label="Isp" unit="s" value={g.ion.isp} step={100} min={1} onChange={(v) => setIon({ isp: Math.max(1, v) })} />
            <NumField label="Vermogen" unit="kW, info" value={+(g.ion.powerW / 1000).toPrecision(6)} step={0.5} min={0} onChange={(v) => setIon({ powerW: Math.max(0, v * 1000) })} />
            <NumField label="Drijfmassa (xenon)" unit="kg" value={g.ion.propKg} step={50} min={0} onChange={(v) => setIon({ propKg: Math.max(0, v) })} />
            <NumField label="Drooggewicht" unit="kg" value={g.ion.dryKg} step={50} min={1} onChange={(v) => setIon({ dryKg: Math.max(1, v) })} />
          </div>
        </>
      )}

      {g.model === 'accel' && (
        <div className="grid gap-2">
          <NumField label="Versnelling" unit="g" value={g.aG} step={0.1} min={0.001} onChange={(v) => gstore.set({ aG: Math.max(1e-3, v) })} />
          <div className="flex flex-wrap gap-1">
            {[0.01, 0.1, 1, 2].map((a) => <Pick key={a} active={g.aG === a} onClick={() => gstore.set({ aG: a })} className="h-7 px-2">{nl(a)} g</Pick>)}
          </div>
          <Note>Fantasie: een fusieschip dat zijn versnelling ononderbroken volhoudt, halverwege omdraait (flip-and-burn) en afremt. Brandstof wordt niet gemodelleerd.</Note>
        </div>
      )}
    </Section>
  )
}

// ======================================================================= results + formulas
function ResultSection() {
  const g = gstore.useStore((s) => s)
  const plan = currentPlan(), t = currentTarget()
  const v = betaToKms(plan.beta)
  const te = fmtYears(plan.tEarthYr), tau = plan.tauYr === null ? null : fmtYears(plan.tauYr)
  const ctx = timeContext(plan.tEarthYr)
  const speedLabel = g.model === 'accel' ? 'Topsnelheid (halverwege)' : g.model === 'ion' ? 'Eindsnelheid na de brandfase' : 'Kruissnelheid'
  return (
    <Section title="Resultaat">
      <div>
        <KV k="Bestemming" v={`${t.name} · ${fmtLy(t.d)}`} />
        <KV k={speedLabel} v={`${fmtKms(v)} · ${nlSig(plan.beta * 100, 3)} % c`} />
        <KV k="Reistijd — Aarde-frame" v={te.main} strong />
        {te.alt && <KV k="" v={te.alt} />}
        <KV k="Reistijd — aan boord (τ)" v={tau ? tau.main : 'niet gedefinieerd'} strong={!!tau} />
        {tau?.alt && <KV k="" v={tau.alt} />}
        {plan.accel && <KV k="Piek-Lorentzfactor γ" v={nlSig(plan.accel.gammaPeak, 3)} />}
      </div>
      <p className="text-[11px] leading-snug text-muted-foreground">Ter vergelijking: {ctx}.{plan.tEarthYr > 1e4 && plan.tEarthYr < AGE_GALAXY_YR && ` Dat is ${nlSig((plan.tEarthYr / AGE_GALAXY_YR) * 100, 2)} % van de leeftijd van de Melkweg.`}</p>
      {plan.ftl && (
        <Note tone="warn">
          {plan.beta === 1 ? 'v = c: alleen massaloze deeltjes (licht) halen dit. ' : `${nlSig(plan.beta, 3)} × c is sneller dan het licht — fictie. `}
          Volgens de speciale relativiteitstheorie kan een ruimteschip met massa de lichtsnelheid niet bereiken (de benodigde energie gaat naar oneindig), dus de eigentijd τ is niet gedefinieerd. Dit is puur een gedachte-experiment; de animatie volgt gewoon d = v·t.
        </Note>
      )}
      {g.model === 'ideal' && !plan.ftl && <Note>Aanname: het schip heeft vanaf het begin direct de kruissnelheid (oneindige acceleratie); versnellen en afremmen zijn niet meegerekend.</Note>}
      {g.model === 'ideal' && <ScaleFormulas plan={plan} t={t} />}
      {g.model === 'ion' && <IonFormulas />}
      {g.model === 'accel' && <AccelFormulas />}
    </Section>
  )
}

function ScaleFormulas({ plan, t }: { plan: ReturnType<typeof currentPlan>; t: ReturnType<typeof currentTarget> }) {
  const b = plan.beta
  return (
    <div className="grid gap-1">
      <Tex block tex={`\\beta=\\frac{v}{c}=\\frac{${tx(betaToKms(b))}}{${tx(C_KMS, 6)}}=${tx(b, 4)}`} />
      <Tex block tex={`t=\\frac{d}{v}=\\frac{${tx(t.d)}\\ \\text{ly}}{${tx(b, 4)}\\,c}=${tx(plan.tEarthYr)}\\ \\text{jaar}`} />
      {!plan.ftl && <Tex block tex={`\\gamma=\\frac{1}{\\sqrt{1-\\beta^{2}}}=${tx(gamma(b), 4)}\\qquad \\tau=\\frac{t}{\\gamma}=${tx(plan.tauYr!)}\\ \\text{jaar}`} />}
      <Tex block tex={`1\\ \\text{ly}=c\\cdot 1\\ \\text{jr}=${tx(LY_KM, 5)}\\ \\text{km}`} />
      <Bron>speciale relativiteitstheorie (Einstein 1905); tijddilatatie. 1 ly = c × 1 julianisch jaar ({tx0(YEAR_S)} s).</Bron>
    </div>
  )
}
const tx0 = (x: number) => nl(x, 0)

function IonFormulas() {
  const g = gstore.useStore((s) => s)
  const plan = currentPlan(), t = currentTarget(), ion = plan.ion!
  const vf = ion.dv / 1000
  const fantasy = 0.1 * C_KMS
  return (
    <div className="grid gap-1.5">
      <Tex block tex={`\\begin{aligned}v_e&=I_{sp}\\,g_0=${tx(g.ion.isp)}\\cdot${tx(G0_MS2, 6)}=${tx(ion.ve)}\\ \\text{m/s}\\\\ \\dot m&=\\frac{F}{v_e}=\\frac{${tx(g.ion.thrustN)}}{${tx(ion.ve)}}=${tx(ion.mdot)}\\ \\text{kg/s}\\end{aligned}`} />
      <Tex block tex={`\\Delta v=v_e\\ln\\frac{m_0}{m_f}=${tx(ion.ve)}\\cdot\\ln\\frac{${tx(ion.m0)}}{${tx(ion.mf)}}=${tx(vf, 4)}\\ \\text{km/s}`} />
      <Tex block tex={`\\begin{aligned}t_b&=\\frac{m_p}{\\dot m}=${tx(ion.tBurn)}\\ \\text{s}=${tx(ion.tBurn / 86400)}\\ \\text{dagen}\\\\ s_b&=v_e\\!\\left[t_b+\\frac{m_f}{\\dot m}\\ln\\frac{m_f}{m_0}\\right]=${tx(ion.sBurn / 1000)}\\ \\text{km}\\end{aligned}`} />
      <Tex block tex={`t=t_b+\\frac{d-s_b}{v_f}=${tx(plan.tEarthYr)}\\ \\text{jaar}\\qquad \\beta_f=${tx(plan.beta, 3)}`} />
      <div>
        <KV k="Brandtijd" v={fmtYearsText(ion.tBurnYr)} />
        <KV k="Afgelegd tijdens de brandfase" v={`${nlSig(ion.sBurn / 1000, 3)} km (${nlSig(ion.sBurn / 1000 / AU_KM, 3)} AE)`} />
        <KV k="Eindsnelheid" v={`${fmtKms(vf)} · ${nlSig(plan.beta * 100, 3)} % c`} strong />
        <KV k={`Reistijd naar ${t.name}`} v={fmtYearsText(plan.tEarthYr)} strong />
        <KV k="Rendement η = F·vₑ / 2P" v={Number.isFinite(ion.eta) ? `${nlSig(ion.eta * 100, 2)} %` : '—'} />
      </div>
      <Note tone="warn">
        Zo ziet de realiteit eruit: deze ionenmotor haalt slechts {fmtKms(vf)} ({nlSig(plan.beta * 100, 2)} % van c). De reis naar {t.name} duurt dan {fmtYearsText(plan.tEarthYr)}.
        Start in rust t.o.v. de Zon; zwaartekracht en zonnebaansnelheid zijn niet meegerekend.
      </Note>
      <Button size="sm" variant="outline" className="h-auto min-h-8 whitespace-normal border-amber-500/50 py-1.5 text-xs text-amber-200 hover:bg-amber-500/10"
        onClick={() => gstore.set({ model: 'ideal', vKms: fantasy })}>
        Fantasie-modus: vlieg toch met 10 % van c (30 000 km/s)
      </Button>
      <Bron>Tsiolkovsky (1903); constante stuwkracht met afnemende massa: s(t) = vₑ[t + (m/ṁ)·ln(m/m₀)]. NSTAR: NASA Glenn / Dawn (92 mN, Isp 3 100 s, 2,3 kW). NEXT: Patterson e.a., NASA GRC.</Bron>
    </div>
  )
}

function AccelFormulas() {
  const g = gstore.useStore((s) => s)
  const plan = currentPlan(), t = currentTarget(), r = plan.accel!
  return (
    <div className="grid gap-1.5">
      <Tex block tex={`\\begin{aligned}\\tau&=\\frac{2c}{a}\\,\\mathrm{arcosh}\\!\\left(1+\\frac{a\\,d}{2c^{2}}\\right)\\\\ &=\\frac{2}{${tx(r.a, 4)}}\\,\\mathrm{arcosh}(${tx(r.gammaPeak, 4)})=${tx(r.tau)}\\ \\text{jaar}\\end{aligned}`} />
      <Tex block tex={`\\begin{aligned}t&=\\frac{2c}{a}\\sinh\\!\\frac{a\\,\\tau}{2c}=${tx(r.t)}\\ \\text{jaar}\\\\ \\gamma_{max}&=1+\\frac{a\\,d}{2c^{2}}=${tx(r.gammaPeak, 4)}\\end{aligned}`} />
      <Tex block tex={`\\begin{aligned}a&=${tx(g.aG)}\\,g=${tx(r.a, 4)}\\ \\text{ly/jr}^{2}\\\\ \\beta_{max}&=\\sqrt{1-\\gamma_{max}^{-2}}=${tx(r.betaPeak, 5)}\\end{aligned}`} />
      <Note>Controle: 1 g naar Proxima Centauri (4,246 ly) geeft ca. 3,5 jaar aan boord en ca. 5,9 jaar op Aarde, naar het Galactisch centrum ({tx0(SUN_GC_LY)} ly) ca. 20 jaar aan boord — maar ca. {tx0(SUN_GC_LY)} jaar op Aarde. Aanname: acceleratie meteen vol, zonder brandstofbeperking.</Note>
      <Bron>J. Baez, "The Relativistic Rocket" (math.ucr.edu); wikipedia: Spacecraft propulsion / Rindler hyperbolic motion. Bestemming: {t.name}.</Bron>
    </div>
  )
}

function Sources() {
  return (
    <div className="grid gap-1 border-t pt-3 text-[10.5px] leading-snug text-muted-foreground">
      <p><span className="font-medium text-foreground/80">Melkweg-model (procedureel, ca. 200 000 sterren):</span> Zon ca. 26 000 ly van het centrum, balk 27 000 ly onder 27°, spiraalarmen onder ca. 12°, schijf met straal ca. 50 000 ly, dikte ca. 1 000 ly. 1 schaaleenheid = 10 ly. Sterren dichtbij de Zon zijn procedureel aangevuld; de benoemde sterren staan op hun echte plaats.</p>
      <p>Bron: Reid e.a. 2019 (spoed ≈ 9–17°, Orion-spoor), Wegg e.a. 2015 en Benjamin e.a. 2005 (balk, 27°), Churchwell e.a. 2009 en NASA/JPL-Caltech/R. Hurt (artist concept, alleen als visuele referentie; geen afbeelding gebruikt), GRAVITY 2019 (afstand tot Sgr A*). Sterren: SIMBAD/Hipparcos/Gaia, afstanden afgerond (&quot;ca.&quot;); (l, b) uit RA/Dec (J2000) met de IAU-galactische pool.</p>
    </div>
  )
}

export function GalaxyPanel() {
  return (
    <div className="grid gap-5">
      <p className="text-xs leading-snug text-muted-foreground">
        Interstellaire reis door een 3D-Melkweg. Kies een bestemming, stel de snelheid of aandrijving in en vlieg mee — met correcte lichtjaren, tijddilatatie en reistijden.
      </p>
      <TargetSection />
      <FlightSection />
      <DriveSection />
      <ResultSection />
      <Sources />
    </div>
  )
}
