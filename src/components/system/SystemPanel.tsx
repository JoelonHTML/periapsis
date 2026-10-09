// "Stelsel" tab: central body, camera, moon list, spacecraft orbit editor, readouts and the orbit-adjustment (manoeuvre) planner.
import { Fuel, Navigation, RotateCcw } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { DEG, G0, dvBudget, fmtDate, fmtDateTime, fmtDuration } from '@/lib/astro'
import { activeCraft, clock, selectedSolution, useApp } from '@/lib/store'
import {
  applyPlan, currentSeg, editBase, editTarget, ensureShip, goCam, resetShip, restoreFuel, setBody, setFollowCraft, shipKey, sys,
  type Ship, type TargetOrbit,
} from '@/lib/system-store'
import {
  SYSTEMS, SYS_IDS, apoFromE, eccOf, energy, orbA, orbPeriod, planManeuver, segAt, shipState, sysMu, sysName, sysR, vApo, vPeri,
  type MoonDef, type SysId,
} from '@/lib/system'
import { PLANET_CREDITS, hdSetting, setHdMode, type HdMode } from './planetTex'
import { KV, NumField, Section, Tex, f } from '../bits'

const nl = (x: number, d = 0) => x.toLocaleString('nl-NL', { minimumFractionDigits: d, maximumFractionDigits: d })
const dur = (s: number) => (s < 5400 ? `${(s / 60).toFixed(0)} min` : fmtDuration(s))
const fmtDv = (dv: number) => (dv < 0.1 ? `${(dv * 1000).toFixed(1)} m/s` : `${dv.toFixed(3)} km/s`)
const altText = (o: { rp: number; ra: number; i: number }, R: number) => `${nl(o.rp - R)} × ${nl(o.ra - R)} km, i = ${f(o.i / DEG, 1)}°`

function useTick(ms: number) {
  const [, set] = useState(0)
  useEffect(() => { const id = setInterval(() => set((x) => x + 1), ms); return () => clearInterval(id) }, [ms])
}

export function SystemPanel() {
  const body = sys.useStore((s) => s.body)
  const sol = useApp(selectedSolution)
  useEffect(() => { ensureShip(body) }, [body, sol])
  const ship = sys.useStore((s) => s.ships[shipKey(body)])
  const arrives = sol && sol.arrival.kind !== 'flyby' ? sol.arrival.body : null
  return (
    <div className="grid gap-4">
      <BodyPicker body={body} arrives={arrives} />
      <ViewOptions />
      <MoonList body={body} />
      <Separator />
      {ship && <SpacecraftSection body={body} ship={ship} />}
    </div>
  )
}

// ------------------------------------------------------------------------------------------------------------ body + view
function BodyPicker({ body, arrives }: { body: SysId; arrives: SysId | null }) {
  const def = SYSTEMS[body], b = sysName(body)
  const rot = def.wRate === 0 ? 0.99726968 : 360 / Math.abs(def.wRate)
  return (
    <Section title="Centraal lichaam">
      <div className="grid grid-cols-5 gap-1">
        {SYS_IDS.map((id) => (
          <Button key={id} size="sm" variant={id === body ? 'default' : 'outline'} className="h-7 px-1 text-[11px]" onClick={() => setBody(id)}>
            {sysName(id)}
          </Button>
        ))}
      </div>
      {arrives && arrives !== body && (
        <Button size="sm" variant="secondary" className="h-7 justify-start text-xs" onClick={() => setBody(arrives)}>
          <Navigation /> Missiedoel: {sysName(arrives)} bekijken
        </Button>
      )}
      <div className="rounded-md border bg-muted/30 px-2.5 py-1.5">
        <KV k="Zwaartekracht μ" v={`${nl(sysMu(body))} km³/s²`} />
        <KV k="Gemiddelde straal" v={`${nl(sysR(body), 1)} km`} />
        <KV k={`Rotatie${def.wRate < 0 ? ' (retrograde)' : ''}`} v={rot < 1.2 ? `${f(rot * 24, 2)} u` : `${f(rot, 2)} d`} />
        <KV k={`Manen in dit overzicht`} v={def.moons.length ? String(def.moons.length) : 'geen'} />
        <p className="pt-1 text-[10.5px] leading-snug text-muted-foreground">
          {b}-as volgens IAU (pool α = {f(def.pole[0], 2)}°, δ = {f(def.pole[1], 2)}°), zonbelichting uit de werkelijke positie van {b} op de gekozen datum.
        </p>
      </div>
    </Section>
  )
}

function ViewOptions() {
  const labels = sys.useStore((s) => s.labels)
  const orbits = sys.useStore((s) => s.orbits)
  const kind = sys.useStore((s) => s.cam.kind)
  const follow = sys.useStore((s) => s.follow)
  const hd = hdSetting.useStore((s) => s.mode)
  return (
    <Section title="Weergave">
      <div className="grid gap-1">
        <Label className="text-xs text-muted-foreground">Schaal</Label>
        <ToggleGroup type="single" variant="outline" size="sm" className="w-full" value={follow.startsWith('moon:') ? '' : kind}
          onValueChange={(v) => { if (v) goCam(v as 'system' | 'planet' | 'craft') }}>
          <ToggleGroupItem value="system" className="flex-1 px-1 text-[11px]">Heel stelsel</ToggleGroupItem>
          <ToggleGroupItem value="planet" className="flex-1 px-1 text-[11px]">Planeet</ToggleGroupItem>
          <ToggleGroupItem value="craft" className="flex-1 px-1 text-[11px]">Ruimtevaartuig</ToggleGroupItem>
        </ToggleGroup>
      </div>
      <div className="grid grid-cols-3 gap-2 text-xs">
        <label className="flex items-center justify-between gap-2"><span>Labels</span><Switch checked={labels} onCheckedChange={(v) => sys.set({ labels: v })} /></label>
        <label className="flex items-center justify-between gap-2"><span>Banen</span><Switch checked={orbits} onCheckedChange={(v) => sys.set({ orbits: v })} /></label>
        <label className="flex items-center justify-between gap-2"><span>Volgen</span><Switch checked={follow === 'craft'} onCheckedChange={setFollowCraft} /></label>
      </div>
      <div className="grid gap-1">
        <Label className="text-xs text-muted-foreground">HD-texturen (4k/8k, wordt van het internet geladen als je dichtbij komt)</Label>
        <ToggleGroup type="single" variant="outline" size="sm" className="w-full" value={hd} onValueChange={(v) => { if (v) setHdMode(v as HdMode) }}>
          <ToggleGroupItem value="auto" className="flex-1 px-1 text-[11px]">Auto</ToggleGroupItem>
          <ToggleGroupItem value="on" className="flex-1 px-1 text-[11px]">Aan</ToggleGroupItem>
          <ToggleGroupItem value="off" className="flex-1 px-1 text-[11px]">Uit</ToggleGroupItem>
        </ToggleGroup>
      </div>
      <p className="text-[10.5px] leading-snug text-muted-foreground">
        Planeetkaarten: {PLANET_CREDITS.who} — {PLANET_CREDITS.licence}. Venus, Ceres, Pluto en de overige manen zijn nog procedureel.
      </p>
      <p className="text-[10.5px] leading-snug text-muted-foreground">
        Schaal 1 eenheid = 1000 km, manen op ware grootte (met een vast punt zodat je ze terugvindt). Scrol om in te zoomen tot een baan van 200 km boven het oppervlak; &lsquo;Volgen&rsquo; laat de camera met het ruimtevaartuig meebewegen.
      </p>
    </Section>
  )
}

function MoonList({ body }: { body: SysId }) {
  const def = SYSTEMS[body]
  const follow = sys.useStore((s) => s.follow)
  if (!def.moons.length) return <Section title="Manen"><p className="text-xs text-muted-foreground">{sysName(body)} heeft geen manen: alleen de planeet en je ruimtevaartuig.</p></Section>
  return (
    <Section title={`Manen (${def.moons.length}) — klik om erheen te vliegen`}>
      <div className="grid gap-px overflow-hidden rounded-md border text-[11px]">
        <div className="grid grid-cols-[1fr_84px_58px_58px] gap-1 bg-muted/40 px-2 py-1 text-[10px] uppercase tracking-wide text-muted-foreground">
          <span>Maan</span><span className="text-right">a (km)</span><span className="text-right">P (d)</span><span className="text-right">R (km)</span>
        </div>
        {def.moons.map((m) => <MoonRow key={m.id} m={m} active={follow === `moon:${m.id}`} />)}
      </div>
      <p className="text-[10.5px] leading-snug text-muted-foreground">
        Banen: JPL-gemiddelden (a, e, i, periode, straal){body === 'earth' ? '; de Maan volgt de nauwkeurige Meeus-reeks' : ''}. Standen: {body === 'jupiter' ? 'Galileïsche manen met literatuurwaarden voor de lengte op J2000, overige manen' : 'de fase op J2000 is'} een vaste, indicatieve waarde — periode en baan zijn echt, de exacte plek op datum niet.
      </p>
    </Section>
  )
}

function MoonRow({ m, active }: { m: MoonDef; active: boolean }) {
  return (
    <button type="button" onClick={() => goCam('moon', m.id)}
      className={`grid grid-cols-[1fr_84px_58px_58px] items-center gap-1 px-2 py-1 text-left tabular-nums hover:bg-accent ${active ? 'bg-accent' : 'bg-card/40'}`}>
      <span className="flex items-center gap-1.5 truncate"><i className="inline-block size-2 shrink-0 rounded-full" style={{ background: m.color }} />{m.name}{m.i > 90 && <span className="text-[9px] text-amber-400" title="retrograde">↺</span>}</span>
      <span className="text-right">{nl(m.a)}</span>
      <span className="text-right">{m.P < 10 ? f(m.P, 3) : m.P < 100 ? f(m.P, 2) : f(m.P, 1)}</span>
      <span className="text-right">{m.R < 100 ? f(m.R, 1) : nl(m.R)}</span>
    </button>
  )
}

// ------------------------------------------------------------------------------------------------------------ spacecraft
/** Perigee / apogee / eccentricity are linked: editing e recomputes the apogee, editing the apogee shows the new e. */
function OrbitFields({ v, R, onChange, full }: {
  v: { rpAlt: number; raAlt: number; incDeg: number; nodeDeg?: number; argpDeg?: number }
  R: number; onChange: (p: { rpAlt?: number; raAlt?: number; incDeg?: number; nodeDeg?: number; argpDeg?: number }) => void; full?: boolean
}) {
  const rpAlt = Math.min(v.rpAlt, v.raAlt), raAlt = Math.max(v.rpAlt, v.raAlt)
  const e = eccOf(R + rpAlt, R + raAlt)
  const round = (x: number) => Math.round(x * 10) / 10
  return (
    <div className="grid grid-cols-3 gap-2">
      <NumField label="Perigeum" unit="km" value={v.rpAlt} onChange={(x) => onChange({ rpAlt: x })} />
      <NumField label="Apogeum" unit="km" value={v.raAlt} onChange={(x) => onChange({ raAlt: x })} />
      <NumField label="Excentriciteit e" step={0.01} value={+e.toFixed(5)}
        onChange={(x) => { const ee = Math.min(0.995, Math.max(0, x)); onChange({ rpAlt, raAlt: round(apoFromE(R + rpAlt, ee) - R) }) }} />
      <NumField label="Inclinatie i" unit="°" step={0.5} value={v.incDeg} onChange={(x) => onChange({ incDeg: Math.max(0, Math.min(180, x)) })} />
      {full && <NumField label="Knoop Ω" unit="°" step={5} value={v.nodeDeg ?? 0} onChange={(x) => onChange({ nodeDeg: x })} />}
      {full && <NumField label="Periapsis ω" unit="°" step={5} value={v.argpDeg ?? 0} onChange={(x) => onChange({ argpDeg: x })} />}
    </div>
  )
}

function SpacecraftSection({ body, ship }: { body: SysId; ship: Ship }) {
  const R = sysR(body), def = SYSTEMS[body]
  const base = ship.base
  const inAtmosphere = Math.min(base.rpAlt, base.raAlt) < def.atmAlt
  const bad = Math.min(base.rpAlt, base.raAlt) <= 0
  return (
    <>
      <Section title={`Ruimtevaartuig rond ${sysName(body)}`}>
        <ArrivalStatus ship={ship} />
        <p className="text-[10.5px] leading-snug text-muted-foreground">
          {ship.src === 'mission'
            ? 'Beginbaan = aankomstbaan van de gekozen missie (periapsis op de aankomstdatum; i = 30°, Ω = ω = 0° als standaard, de missie legt de oriëntatie niet vast).'
            : ship.src === 'custom' ? 'Eigen beginbaan. “Reset baan” keert terug naar de missiebaan of de standaardbaan.' : 'Geen passende missie: standaardbaan 200 km cirkelbaan.'}
        </p>
        <OrbitFields v={base} R={R} full onChange={(p) => editBase(body, p)} />
        {bad && <p className="text-xs text-red-400">Het perigeum moet boven het oppervlak liggen (hoogte &gt; 0 km).</p>}
        {!bad && inAtmosphere && <p className="text-xs text-amber-400">Perigeum onder {def.atmAlt} km: binnen de atmosfeer, de baan zou snel vervallen.</p>}
        <p className="text-[10.5px] leading-snug text-muted-foreground">Hier aanpassen zet de beginbaan direct (zonder brandstof). Voor een echte manoeuvre gebruik je “Baan aanpassen” hieronder.</p>
      </Section>
      <Readouts body={body} ship={ship} />
      <Separator />
      <Planner body={body} ship={ship} />
    </>
  )
}

function ArrivalStatus({ ship }: { ship: Ship }) {
  const [pre, setPre] = useState(false)
  useEffect(() => {
    const upd = () => setPre(ship.src === 'mission' && clock.t < ship.tp)
    upd()
    const id = setInterval(upd, 200)
    return () => clearInterval(id)
  }, [ship])
  if (!pre) return null
  return <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-300">Aankomst op {fmtDateTime(ship.tp)} UTC — ruimtevaartuig nog onderweg.</div>
}

function Readouts({ body, ship }: { body: SysId; ship: Ship }) {
  useTick(1000)
  const R = sysR(body), mu = sysMu(body)
  const seg = segAt(ship.segs, clock.t), o = seg.orb
  const a = orbA(o), e = eccOf(o.rp, o.ra), T = orbPeriod(o, mu), vp = vPeri(o, mu), va = vApo(o, mu), eps = energy(o, mu)
  const altRef = useRef<HTMLSpanElement>(null), spdRef = useRef<HTMLSpanElement>(null), phRef = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    const upd = () => {
      const pre = ship.src === 'mission' && clock.t < ship.tp
      const st = shipState(ship.segs, mu, clock.t)
      if (altRef.current) altRef.current.textContent = pre ? '—' : `${nl(st.rad - R, 1)} km`
      if (spdRef.current) spdRef.current.textContent = pre ? '—' : `${f(st.speed, 3)} km/s`
      if (phRef.current) phRef.current.textContent = pre ? '—' : `${f(((((clock.t - st.seg.orb.tp) / orbPeriod(st.seg.orb, mu)) % 1) + 1) % 1 * 100, 1)} % van de omloop`
    }
    upd()
    const id = setInterval(upd, 100)
    return () => clearInterval(id)
  }, [ship, mu, R])
  return (
    <Section title={`De baan${seg.kind === 'transfer' ? ' (overgangsbaan)' : ''}`}>
      <KV k="Halve lange as a" v={`${nl(a, 1)} km`} />
      <KV k="Excentriciteit e" v={f(e, 5)} />
      <KV k="Omlooptijd T" v={dur(T)} />
      <KV k="Snelheid perigeum / apogeum" v={`${f(vp, 3)} / ${f(va, 3)} km/s`} />
      <KV k="Specifieke energie ε" v={`${f(eps, 3)} km²/s²`} />
      <div className="rounded-md border bg-muted/30 px-2.5 py-1">
        <KV k="Hoogte nu" v={<span ref={altRef} />} strong />
        <KV k="Snelheid nu" v={<span ref={spdRef} />} strong />
        <KV k="Positie in baan" v={<span ref={phRef} />} />
      </div>
      <Tex block tex={`a = \\frac{r_p + r_a}{2} = \\frac{${f(o.rp, 1)} + ${f(o.ra, 1)}}{2} = ${f(a, 1)}\\ \\text{km}`} />
      <Tex block tex={`e = \\frac{r_a - r_p}{r_a + r_p} = \\frac{${f(o.ra - o.rp, 1)}}{${f(o.ra + o.rp, 1)}} = ${f(e, 4)}`} />
      <Tex block tex={`T = 2\\pi\\sqrt{\\frac{a^3}{\\mu}} = ${f(T, 0)}\\ \\text{s},\\quad \\varepsilon = -\\frac{\\mu}{2a} = ${f(eps, 3)}\\ \\tfrac{\\text{km}^2}{\\text{s}^2}`} />
      <Tex block tex={`v = \\sqrt{\\mu\\left(\\tfrac{2}{r} - \\tfrac{1}{a}\\right)}:\\ v_p = ${f(vp, 3)},\\ v_a = ${f(va, 3)}\\ \\text{km/s}`} />
      <p className="text-[10.5px] text-muted-foreground">μ = {nl(mu, 1)} km³/s² · R = {nl(R, 1)} km · hoogte = afstand tot het middelpunt − R</p>
    </Section>
  )
}

// ------------------------------------------------------------------------------------------------------------ planner
function Planner({ body, ship }: { body: SysId; ship: Ship }) {
  useTick(1000)
  const R = sysR(body), mu = sysMu(body)
  const craft = useApp(activeCraft)
  const last = currentSeg(ship), tg = ship.target
  const m0 = craft.dry + craft.prop
  const pre = ship.src === 'mission' && clock.t < ship.tp
  const tNow = Math.max(clock.t, Number.isFinite(last.t0) ? last.t0 : clock.t, ship.src === 'mission' ? ship.tp : -Infinity)
  const valid = Math.min(tg.rpAlt, tg.raAlt) > 0
  const plan = useMemo(
    () => planManeuver(mu, last.orb, { rp: R + Math.min(tg.rpAlt, tg.raAlt), ra: R + Math.max(tg.rpAlt, tg.raAlt), i: tg.incDeg * DEG }, tNow, m0, craft.isp),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mu, R, last, tg.rpAlt, tg.raAlt, tg.incDeg, Math.floor(tNow / 1000), m0, craft.isp],
  )
  const short = plan.kg - craft.prop
  const budget = dvBudget(craft.dry, craft.prop, craft.isp)
  const reason = pre ? 'Wacht tot de aankomst: het ruimtevaartuig is nog onderweg.'
    : !valid ? 'Kies een perigeum boven het oppervlak (> 0 km).'
    : plan.same ? 'Doelbaan is gelijk aan de huidige baan: niets te doen.'
    : short > 1e-9 ? `Onvoldoende brandstof: ${f(short, 1)} kg tekort (Δv-budget ${f(budget, 3)} km/s < ${f(plan.dv, 3)} km/s nodig).` : ''
  const set = (p: Partial<TargetOrbit>) => editTarget(body, p)
  const run = () => { applyPlan(body, planManeuver(mu, last.orb, { rp: R + Math.min(tg.rpAlt, tg.raAlt), ra: R + Math.max(tg.rpAlt, tg.raAlt), i: tg.incDeg * DEG }, tNow, m0, craft.isp)) }
  const ve = craft.isp * G0
  return (
    <div className="grid gap-4">
      <Section title="Baan aanpassen (impulsieve burns)">
        <p className="text-[10.5px] leading-snug text-muted-foreground">
          Vul de gewenste baan in. Burn 1 in het perigeum zet het apogeum op de doelwaarde, burn 2 daar (een halve overgangsbaan later) zet het perigeum — en de inclinatie, gecombineerd. Hoogtes zijn boven het oppervlak.
        </p>
        <OrbitFields v={tg} R={R} onChange={(p) => set(p)} />
        <Button size="sm" variant="outline" className="h-7 justify-self-start text-xs" onClick={() => set({ rpAlt: last.orb.rp - R, raAlt: last.orb.ra - R, incDeg: last.orb.i / DEG })}>
          Doel = huidige baan
        </Button>
      </Section>

      <Section title="Berekening">
        {plan.same || !valid ? <p className="text-xs text-muted-foreground">{valid ? 'Geen manoeuvre nodig.' : 'Ongeldige doelbaan.'}</p> : (
          <>
            {plan.burns.map((b) => (
              <div key={b.n} className="rounded-md border bg-muted/30 px-2.5 py-1.5">
                <div className="text-xs font-medium">{b.name}</div>
                <KV k="Waar" v={`${b.n === 1 ? 'perigeum' : 'apogeum'} · hoogte ${nl(b.r - R)} km`} />
                <KV k="Tijdstip" v={`${fmtDateTime(b.t)} UTC`} />
                <KV k="Snelheid vóór → na" v={`${f(b.vBefore, 3)} → ${f(b.vAfter, 3)} km/s`} />
                <KV k="Δv" v={fmtDv(b.dv)} strong />
                <KV k="Brandstof" v={`${f(b.kg, 1)} kg`} />
                <KV k="Nieuwe baan" v={<span className="text-right">{altText(b.after, R)}</span>} />
              </div>
            ))}
            <KV k="Tijd tussen de burns" v={dur(plan.tof)} />
            <KV k="Totale Δv" v={fmtDv(plan.dv)} strong />
            <KV k={`Brandstof nodig (m₀ = ${nl(m0)} kg)`} v={<span className={short > 1e-9 ? 'text-red-400' : ''}>{f(plan.kg, 1)} kg</span>} strong />
            <KV k="Brandstof over na manoeuvre" v={`${f(Math.max(0, craft.prop - plan.kg), 1)} kg van ${nl(craft.prop)} kg`} />
            {plan.burns.map((b) => b.n === 1 ? (
              <Tex key={1} block tex={`\\Delta v_1 = |v_{T} - v_{p}| = |${f(b.vAfter, 4)} - ${f(b.vBefore, 4)}| = ${f(b.dv, 4)}\\ \\text{km/s}`} />
            ) : (
              <div key={2}>
                <Tex block tex={`\\Delta v_2 = \\sqrt{v_T^2 + v_f^2 - 2 v_T v_f \\cos\\Delta i}`} />
                <Tex block tex={`v_T = ${f(b.vBefore, 3)},\\ v_f = ${f(b.vAfter, 3)},\\ \\Delta i = ${f(b.dI / DEG, 1)}^\\circ \\Rightarrow ${f(b.dv, 4)}\\ \\text{km/s}`} />
              </div>
            ))}
            <Tex block tex={`m_{\\text{brandstof}} = m_0\\left(1 - e^{-\\Delta v/(I_{sp} g_0)}\\right)`} />
            <Tex block tex={`= ${Math.round(m0)}\\left(1 - e^{-${f(plan.dv, 4)}/${f(ve, 3)}}\\right) = ${f(plan.kg, 1)}\\ \\text{kg}`} />
          </>
        )}
        {reason && <p className={`text-xs ${short > 1e-9 || !valid ? 'text-red-400' : 'text-amber-300'}`}>{reason}</p>}
        <Button disabled={!!reason} onClick={run} className="h-9"><Fuel /> Voer manoeuvre uit</Button>
        <p className="text-[10.5px] leading-snug text-muted-foreground">
          Uitvoeren haalt de brandstof direct uit het ruimtevaartuig (zie ‘Brandstof’ bij Missie/Aardbaan) en laat de burns in de 3D-weergave in simulatietijd verlopen. De klok versnelt zodat dit ± 25 s duurt.
        </p>
      </Section>

      <Section title="Logboek">
        {ship.log.length === 0 && <p className="text-xs text-muted-foreground">Nog geen manoeuvres uitgevoerd.</p>}
        {ship.log.map((l, i) => (
          <div key={i} className="rounded-md border px-2.5 py-1 text-[11px] leading-snug">
            <div className="flex justify-between gap-2"><b>Burn {l.n}</b><span className="tabular-nums text-muted-foreground">{fmtDateTime(l.t)} UTC</span></div>
            <div className="flex justify-between gap-2 tabular-nums"><span>Δv {fmtDv(l.dv)}</span><span>{f(l.kg, 1)} kg</span></div>
            <div className="text-muted-foreground">→ {l.after}</div>
          </div>
        ))}
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="h-8 flex-1 text-xs" onClick={() => resetShip(body)}><RotateCcw /> Reset baan</Button>
          <Button size="sm" variant="outline" className="h-8 flex-1 text-xs" disabled={ship.spent <= 0} onClick={() => restoreFuel(body)}>
            <Fuel /> Brandstof herstellen{ship.spent > 0 ? ` (+${f(ship.spent, 1)} kg)` : ''}
          </Button>
        </div>
        {ship.log.length > 0 && <p className="text-[10.5px] text-muted-foreground">Laatste manoeuvre-epoch: {fmtDate(ship.log[ship.log.length - 1].t)}. Totaal verbruikt in dit stelsel: {f(ship.spent, 1)} kg.</p>}
      </Section>
    </div>
  )
}
