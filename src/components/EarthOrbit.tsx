import { Globe2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import {
  ASCENT_LOSSES, DAY, DEG, MU_EARTH, RE, SITES, YEAR, density, fmtDuration, j2Rates, type EarthPlan, type OrbitTarget,
} from '@/lib/astro'
import { store, useApp } from '@/lib/store'
import { CraftFields } from './Controls'
import { KV, NumField, Section, Tex, f } from './bits'
import { Eclipse } from '@/features/satellites/EclipseSection'
import { PerturbSection } from '@/features/perturb/PerturbSection'
import { EarthLayersPanel } from '@/features/earth/EarthLayersPanel'

type Preset = { label: string; rpAlt: number; raAlt: number; inc: number | 'site' | 'sso'; wDeg: number | null }
const PRESETS: Record<string, Preset> = {
  iss: { label: 'ISS-achtig — 420 km, 51,6°', rpAlt: 420, raAlt: 420, inc: 51.64, wDeg: null },
  leo800: { label: 'LEO — 800 km (i = breedtegraad)', rpAlt: 800, raAlt: 800, inc: 'site', wDeg: null },
  sso: { label: 'Zonsynchroon (SSO) — 700 km', rpAlt: 700, raAlt: 700, inc: 'sso', wDeg: null },
  meo: { label: 'MEO / GPS — 20 200 km, 55°', rpAlt: 20200, raAlt: 20200, inc: 55, wDeg: null },
  gto: { label: 'GTO — 250 × 35 786 km', rpAlt: 250, raAlt: 35786, inc: 'site', wDeg: null },
  geo: { label: 'GEO — geostationair, 0°', rpAlt: 35786, raAlt: 35786, inc: 0, wDeg: null },
  molniya: { label: 'HEO Molniya — 600 × 39 750 km, 63,4°', rpAlt: 600, raAlt: 39750, inc: 63.4, wDeg: 270 },
  custom: { label: 'Eigen baan', rpAlt: 800, raAlt: 800, inc: 51.6, wDeg: null },
}

export function sitePosition() {
  const s = store.get()
  return s.siteIdx < 0 ? { name: 'Eigen locatie', lat: s.customLat, lon: s.customLon } : SITES[s.siteIdx]
}

function applyPreset(key: string) {
  const p = PRESETS[key], s = store.get(), lat = Math.abs(sitePosition().lat)
  const inc = p.inc === 'site' ? lat : p.inc === 'sso' ? j2Rates(RE + p.rpAlt, 0, 0).ssoInc / DEG : p.inc
  store.set({ orbitPreset: key, orbit: { ...s.orbit, rpAlt: p.rpAlt, raAlt: p.raAlt, incDeg: +inc.toFixed(2), wDeg: p.wDeg } })
}

export function EarthPanel({ plan }: { plan: EarthPlan }) {
  const s = useApp((x) => x)
  const site = s.siteIdx < 0 ? { name: 'Eigen locatie', lat: s.customLat, lon: s.customLon } : SITES[s.siteIdx]
  const o = s.orbit
  const setOrbit = (p: Partial<OrbitTarget>) => store.set({ orbit: { ...o, ...p }, orbitPreset: 'custom' })
  const m0 = s.craft.dry + s.craft.prop
  const r = j2Rates(plan.a, plan.e, plan.iT)
  const perDay = (x: number) => (x * DAY) / DEG
  return (
    <div className="grid gap-4">
      <Section title="Lancering">
        <div className="grid gap-1">
          <Label className="text-xs text-muted-foreground">Lanceerbasis</Label>
          <Select value={String(s.siteIdx)} onValueChange={(v) => store.set({ siteIdx: +v })}>
            <SelectTrigger className="h-8 w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              {SITES.map((x, i) => <SelectItem key={x.name} value={String(i)}>{x.name} · {x.lat.toFixed(1)}°</SelectItem>)}
              <SelectItem value="-1">Eigen locatie (lat/lon)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {s.siteIdx < 0 && (
          <div className="grid grid-cols-2 gap-2">
            <NumField label="Breedtegraad" unit="°" step={0.1} value={s.customLat} onChange={(v) => store.set({ customLat: Math.max(-89, Math.min(89, v)) })} />
            <NumField label="Lengtegraad" unit="°" step={0.1} value={s.customLon} onChange={(v) => store.set({ customLon: v })} />
          </div>
        )}
      </Section>
      <Section title="Doelbaan om de Aarde">
        <Select value={s.orbitPreset} onValueChange={applyPreset}>
          <SelectTrigger className="h-8 w-full"><SelectValue /></SelectTrigger>
          <SelectContent>{Object.entries(PRESETS).map(([k, p]) => <SelectItem key={k} value={k}>{p.label}</SelectItem>)}</SelectContent>
        </Select>
        <div className="grid grid-cols-2 gap-2">
          <NumField label="Perigeum" unit="km" value={o.rpAlt} onChange={(v) => setOrbit({ rpAlt: Math.max(120, v) })} />
          <NumField label="Apogeum" unit="km" value={o.raAlt} onChange={(v) => setOrbit({ raAlt: Math.max(120, v) })} />
          <NumField label="Inclinatie" unit="°" step={0.1} value={o.incDeg} onChange={(v) => setOrbit({ incDeg: Math.max(0, Math.min(180, v)) })} />
          <NumField label="Parkeerbaan" unit="km" value={o.parkAlt} onChange={(v) => setOrbit({ parkAlt: Math.max(150, v) })} />
        </div>
        <Button variant="outline" onClick={() => store.set({ view: 'earth' })}><Globe2 /> Toon baan in 3D</Button>
      </Section>
      <CraftFields />
      <EarthLayersPanel />
      <Separator />

      <Section title="1 · Lancering naar parkeerbaan">
        <KV k={`Breedtegraad ${site.name}`} v={`${f(site.lat, 2)}°`} />
        <KV k="Lanceer-inclinatie (min. = |breedte|)" v={`${f(plan.iL / DEG, 2)}°`} />
        <KV k="Lanceerazimut" v={`${f(((plan.azimuth / DEG) + 360) % 360, 1)}° t.o.v. noord`} />
        <KV k="Gratis snelheid door aardrotatie" v={`${f(plan.rotGain, 3)} km/s`} />
        <KV k={`Δv opstijging (incl. ~${ASCENT_LOSSES} km/s verliezen)`} v={`${f(plan.ascent)} km/s`} strong />
        <Tex block tex={`\\sin A_z = \\frac{\\cos i}{\\cos\\varphi},\\quad v_{rot} = \\omega_\\oplus R_\\oplus \\cos\\varphi = ${f(plan.vRot, 3)}\\ \\text{km/s}`} />
        <Tex block tex={`\\Delta v_{op} \\approx \\sqrt{\\tfrac{\\mu}{r_{park}}} + \\Delta v_{verlies} - v_{rot}\\sin A_z = ${f(plan.vPark, 3)} + ${ASCENT_LOSSES} - ${f(plan.rotGain, 3)}`} />
      </Section>

      <Section title="2 · Manoeuvres in de ruimte">
        {plan.burns.length === 0 && <p className="text-xs text-muted-foreground">Doelbaan = parkeerbaan, geen extra burns.</p>}
        {plan.burns.map((b) => <KV key={b.name} k={b.name} v={`${f(b.dv, 3)} km/s`} />)}
        {plan.dI > 1e-6 && <KV k="Vlakverandering Δi" v={`${f(plan.dI / DEG, 2)}° (in apogeum, gecombineerd)`} />}
        {plan.transferTime > 0 && <KV k="Transfertijd" v={fmtDuration(plan.transferTime)} />}
        <KV k="Δv in de ruimte" v={`${f(plan.inSpace, 3)} km/s`} strong />
        <KV k="Δv totaal vanaf lanceerplatform" v={`${f(plan.total, 2)} km/s`} strong />
        <KV k="Brandstof voor burns (van tank)" v={<span className={plan.prop <= s.craft.prop ? '' : 'text-amber-400'}>{plan.prop.toFixed(0)} kg / {s.craft.prop} kg</span>} />
        <Tex block tex={`\\Delta v_1 = \\sqrt{\\mu\\left(\\tfrac{2}{r_{park}} - \\tfrac{2}{r_{park}+r_a}\\right)} - \\sqrt{\\tfrac{\\mu}{r_{park}}}`} />
        <Tex block tex={`\\Delta v_2 = \\sqrt{v_{T,a}^2 + v_{a}^2 - 2 v_{T,a} v_{a} \\cos\\Delta i}`} />
        <Tex block tex={`m_{brandstof} = m_0\\left(1 - e^{-\\Delta v / (I_{sp} g_0)}\\right),\\ m_0 = ${m0}\\ \\text{kg}`} />
      </Section>

      <Section title="3 · De baan">
        <KV k="Halve lange as a / excentriciteit e" v={`${plan.a.toFixed(0)} km / ${f(plan.e, 4)}`} />
        <KV k="Omlooptijd" v={fmtDuration(plan.period)} />
        <KV k="Snelheid perigeum / apogeum" v={`${f(plan.vPer, 3)} / ${f(plan.vApo, 3)} km/s`} />
        <Tex block tex={`T = 2\\pi\\sqrt{a^3/\\mu} ,\\quad v = \\sqrt{\\mu\\left(\\tfrac{2}{r} - \\tfrac{1}{a}\\right)}`} />
      </Section>

      <Section title="4 · Precessie door afplatting (J2)">
        <KV k="Knoopsdrift dΩ/dt" v={`${f(perDay(r.dO), 4)} °/dag`} />
        <KV k="Perigeumdrift dω/dt" v={`${f(perDay(r.dw), 4)} °/dag`} />
        <KV k="Zonsynchrone inclinatie voor deze a" v={Number.isFinite(r.ssoInc) ? `${f(r.ssoInc / DEG, 2)}°` : 'niet mogelijk'} />
        <Tex block tex={`\\dot\\Omega = -\\tfrac{3}{2} n J_2 \\left(\\tfrac{R_\\oplus}{p}\\right)^2 \\cos i ,\\quad \\dot\\omega = \\tfrac{3}{4} n J_2 \\left(\\tfrac{R_\\oplus}{p}\\right)^2 (5\\cos^2 i - 1)`} />
        <p className="text-[10.5px] text-muted-foreground">In de 3D-weergave draait het baanvlak werkelijk mee met deze drift (zichtbaar bij dag/maand per seconde). Molniya gebruikt 63,4° zodat dω/dt = 0.</p>
      </Section>

      <Eclipse plan={plan} />
      <PerturbSection plan={plan} />
      <Section title="5 · Luchtweerstand (massa, Cd, frontaal oppervlak)">
        <KV k="Ballistische parameter B = Cd·A/m" v={`${f(plan.B, 5)} m²/kg`} />
        <KV k="Dichtheid in perigeum" v={`${density(o.rpAlt).toExponential(2)} kg/m³`} />
        <KV k="Geschatte levensduur (tot 100 km)" v={Number.isFinite(plan.lifetime) ? (plan.lifetime > 2 * YEAR ? `${f(plan.lifetime / YEAR, 1)} jaar` : fmtDuration(plan.lifetime)) : '> 10 000 jaar'} strong />
        <KV k="Δv per jaar om hoogte te houden" v={`${plan.makeup < 0.01 ? plan.makeup.toExponential(1) : f(plan.makeup, 2)} m/s`} />
        <Tex block tex={`\\frac{da}{dt} = -\\rho(h)\\, B \\sqrt{\\mu a},\\quad \\rho = \\rho_0 e^{-(h-h_0)/H}`} />
        <p className="text-[10.5px] text-muted-foreground">Exponentieel atmosfeermodel (Vallado, gemiddelde zonneactiviteit). Bij elliptische banen wordt conservatief met de perigeumhoogte gerekend. De massa/Cd/A van de satelliet spelen tijdens de lancering geen rol (die zit in de neuskegel).</p>
      </Section>
      <p className="text-[10.5px] text-muted-foreground">μ⊕ = {MU_EARTH} km³/s² · R⊕ = {RE} km · J2 = 1,0826·10⁻³</p>
    </div>
  )
}
