// Aerocapture and aerobraking estimators. Physics: src/features/perturb/aero.ts (tested in Node).
import { AERO_BODIES, aerobrake, aerocapture } from '@/features/perturb/aero'
import { N, U, dur, tu, type Calc, type Opt } from './core'

const bOpts: Opt[] = AERO_BODIES.map((b, i) => ({ value: i, label: b.name }))
const KMS = 'km/s'
const MARS = 0
const brakeRp = [110, 120, 140, 900] // example periapsis altitudes (placeholders, not corridors), same order as AERO_BODIES
const err1 = (msgs: [boolean, string][]) => msgs.find((m) => m[0])?.[1]

export const AERO_CALCS: Calc[] = [
  {
    id: 'aerocapture', title: 'Aerocapture: Δv-besparing en piekvertraging', cat: 'Interplanetair', kw: 'aerocapture aerobraking mars venus titan earth capture entry allen eggers deceleration',
    blurb: 'Een atmosfeerpassage in plaats van een capture-burn; Allen–Eggers-schatting van de piekvertraging',
    inputs: [
      { k: 'b', label: 'Hemellichaam', def: MARS, options: bOpts },
      { k: 'vinf', label: 'Aankomst-v∞', unit: 'km/s', def: AERO_BODIES[MARS].def.vinf, step: 0.1 },
      { k: 'ra', label: 'Doelbaan: apoapsishoogte', unit: 'km', def: AERO_BODIES[MARS].def.raAlt, step: 100 },
      { k: 'rp', label: 'Doelbaan: periapsishoogte', unit: 'km', def: AERO_BODIES[MARS].def.rpAlt, step: 10 },
      { k: 'he', label: 'Hoogte atmosferische grens', unit: 'km', def: AERO_BODIES[MARS].def.entryAlt },
      { k: 'hp', label: 'Periapsishoogte van de aanvliegroute', unit: 'km', def: AERO_BODIES[MARS].def.passAlt },
      { k: 'm', label: 'Massa m', unit: 'kg', def: 2000, step: 100 },
      { k: 'cd', label: 'Weerstandscoëfficiënt Cd', def: 1.5, step: 0.1 },
      { k: 'A', label: 'Frontaal oppervlak A', unit: 'm²', def: 10, step: 0.5 },
    ],
    craft: (c) => ({ m: c.dry + c.prop, cd: c.cd, A: c.area }),
    onChange: (k, v) => {
      if (k !== 'b') return
      const d = AERO_BODIES[v.b].def
      return { vinf: d.vinf, ra: d.raAlt, rp: d.rpAlt, he: d.entryAlt, hp: d.passAlt }
    },
    compute: (v) => {
      const b = AERO_BODIES[v.b]
      const err = err1([
        [!(v.vinf > 0), 'De aankomst-v∞ moet groter dan 0 zijn.'], [!(v.m > 0 && v.cd > 0 && v.A > 0), 'Massa, Cd en oppervlak moeten groter dan 0 zijn.'],
        [!(v.ra > v.rp && v.rp >= 0), 'De apoapsishoogte moet groter zijn dan de periapsishoogte (en die minstens 0).'],
        [!(v.hp >= 0 && v.hp < v.he), 'De periapsishoogte van de aanvliegroute moet tussen 0 en de hoogte van de atmosferische grens liggen.'],
      ])
      if (err) return { err }
      const r = aerocapture({ mu: b.mu, radius: b.radius, vinf: v.vinf, raAlt: v.ra, rpAlt: v.rp, entryAlt: v.he, passAlt: v.hp, m: v.m, cd: v.cd, area: v.A, rho0: b.rho0, H: b.H })
      const notes: string[] = []
      if (r.gamma < 0.5 * Math.PI / 180) notes.push('Zeer ondiepe invalshoek: de rechtlijnige Allen–Eggers-aanname is dan slecht.')
      if (r.hPeak < v.hp) notes.push('De berekende piek ligt onder het periapsis van de route: de vlucht bereikt die diepte niet, dus de piekvertraging is een bovengrens.')
      return {
        rows: [
          'Aankomst en doelbaan',
          ['Snelheid aan atmosferische grens v_e', U(r.ve, KMS)], ['Snelheid in periapsis van de aanvliegroute', U(r.vPass, KMS)],
          ['Invalshoek γ_e (onder de horizon)', U(r.gamma * 180 / Math.PI, '°')], ['Doelbaan: e, periapsis × apoapsis', `${U(r.eT, '', 4)}, ${U(v.rp, 'km')} × ${U(v.ra, 'km')}`],
          'Δv-besparing',
          ['Δv propulsieve capture = Δv bespaard', U(r.dvSaved, KMS), true], ['Snelheid die de atmosfeer moet wegnemen', U(r.dvAtm, KMS)],
          ['Δv om periapsis na de passage te verhogen', U(r.dvRaise, KMS)], ['Netto besparing (na die burn)', U(r.dvNet, KMS), true],
          'Ballistiek en Allen–Eggers (schatting)',
          ['Ballistische coëfficiënt β = m/(Cd·A)', U(r.beta, 'kg/m²')],
          ['Piekvertraging a_max', `${U(r.aMax, 'm/s²')} = ${U(r.gLoad, 'g', 3)}`, true], ['Hoogte van de piek (exp. atmosfeer)', U(r.hPeak, 'km')],
          ['Snelheid bij de piek', U(r.vPeak, KMS)], ['Dynamische druk bij de piek q = β·a_max', U(r.qPeak / 1000, 'kPa')],
        ],
        tex: [
          `\\mu=${tu(b.mu, 'km^3/s^2')},\\; R=${tu(b.radius, 'km')},\\; r_p=${tu(r.rT, 'km')},\\; r_a=${tu(r.raT, 'km')},\\; e=\\frac{r_a-r_p}{r_a+r_p}=${N(r.eT)}`,
          `v_e=\\sqrt{v_\\infty^2+\\frac{2\\mu}{r_e}}=${tu(r.ve, KMS)},\\qquad \\cos\\gamma_e=\\frac{r_{pas}\\,v_{pas}}{r_e\\,v_e}\\Rightarrow\\gamma_e=${N(r.gamma * 180 / Math.PI)}^\\circ`,
          `\\Delta v_{capture}=\\sqrt{v_\\infty^2+\\frac{2\\mu}{r_p}}-\\sqrt{\\frac{\\mu(1+e)}{r_p}}=${tu(r.dvSaved, KMS)}`,
          `\\beta=\\frac{m}{C_d A}=${tu(r.beta, 'kg/m^2')},\\quad a_{max}=\\frac{v_e^2\\sin\\gamma_e}{2e\\,H}=${tu(r.aMax, 'm/s^2')},\\quad \\rho_{piek}=\\frac{\\beta\\sin\\gamma_e}{H}=${tu(r.rhoPeak, 'kg/m^3')}`,
        ],
        note: `Allen–Eggers: ballistische instap (geen lift) in een exponentiële atmosfeer ρ = ρ₀·e^(−h/H), met ρ₀ = ${U(b.rho0, 'kg/m³')} en H = ${U(b.H, 'km')} voor ${b.name}; de piekvertraging hangt niet van β af, de hoogte van de piek wel. Echte aerocapture vliegt ondiep en gestuurd (lift) en de exponentiële fit vanaf het oppervlak is op grote hoogte grof, dus lees dit als orde van grootte, niet als corridorontwerp. De voorbeeldwaarden voor v∞, doelbaan en routehoogte zijn plaatsvervangers, geen missiegegevens. De Δv-besparing is de burn in periapsis van de doelbaan (Oberth meegerekend); na de passage is nog een kleine burn nodig om het periapsis te verhogen.${notes.length ? ' ' + notes.join(' ') : ''}`,
      }
    },
    src: 'Allen & Eggers, NACA Report 1381 (1958); Regan & Anandakrishnan, Dynamics of Atmospheric Re-Entry (AIAA, 1993); Curtis, Orbital Mechanics for Engineering Students, hfst. 2 (hyperbolische baan en vis-viva). Atmosfeer: NASA Planetary Fact Sheets.',
  },
  {
    id: 'aerobrake', title: 'Aerobraking-campagne: aantal passages', cat: 'Interplanetair', kw: 'aerobraking campaign passes apoapsis lowering dynamic pressure heating drag pass',
    blurb: 'Hoeveel periapsispassages om de apoapsis van A naar B te brengen, plus q en warmtestroom',
    inputs: [
      { k: 'b', label: 'Hemellichaam', def: MARS, options: bOpts },
      { k: 'a0', label: 'Start-apoapsishoogte A', unit: 'km', def: 20000, step: 100 },
      { k: 'a1', label: 'Doel-apoapsishoogte B', unit: 'km', def: 1000, step: 100 },
      { k: 'rp', label: 'Periapsishoogte (in de atmosfeer)', unit: 'km', def: brakeRp[MARS] },
      { k: 'dv', label: 'Δv per passage', unit: 'm/s', def: 2, step: 0.5 },
      { k: 'H', label: 'Schaalhoogte H bij periapsis', unit: 'km', def: 8, step: 0.5 },
      { k: 'm', label: 'Massa m', unit: 'kg', def: 1000, step: 100 },
      { k: 'cd', label: 'Weerstandscoëfficiënt Cd', def: 2.2, step: 0.1 },
      { k: 'A', label: 'Frontaal oppervlak A', unit: 'm²', def: 10, step: 0.5 },
    ],
    craft: (c) => ({ m: c.dry + c.prop, cd: c.cd, A: c.area }),
    onChange: (k, v) => { if (k === 'b') return { rp: brakeRp[v.b] } },
    compute: (v) => {
      const b = AERO_BODIES[v.b]
      const err = err1([
        [!(v.a0 > v.a1 && v.a1 > v.rp), 'Er moet gelden: start-apoapsis > doel-apoapsis > periapsishoogte.'],
        [!(v.rp >= 0), 'De periapsishoogte moet minstens 0 zijn.'], [!(v.dv > 0), 'Δv per passage moet groter dan 0 zijn.'],
        [!(v.H > 0 && v.m > 0 && v.cd > 0 && v.A > 0), 'H, massa, Cd en oppervlak moeten groter dan 0 zijn.'],
      ])
      if (err) return { err }
      const r = aerobrake({ mu: b.mu, radius: b.radius, raStartAlt: v.a0, raEndAlt: v.a1, rpAlt: v.rp, dvPass: v.dv, m: v.m, cd: v.cd, area: v.A, H: v.H })
      if (!r.reached) return { err: 'Met deze Δv per passage wordt de doel-apoapsis niet bereikt (de baan zou vóór die tijd een cirkel op periapsishoogte worden of de rekenlimiet is bereikt).' }
      return {
        rows: [
          'Campagne',
          ['Aantal passages', String(r.n), true], ['Totale Δv door weerstand', U(r.dvTotal * 1000, 'm/s')], ['Duur (som van de omlooptijden)', dur(r.time), true],
          ['Periapsissnelheid begin → eind', `${U(r.vp0, KMS)} → ${U(r.vpT, KMS)}`],
          'Per passage (hint)',
          ['Ballistische coëfficiënt β = m/(Cd·A)', U(r.beta, 'kg/m²')], ['Nodige periapsisdichtheid (begin)', U(r.rhoP, 'kg/m³', 3)],
          ['Dynamische druk q = ½ρv² (begin)', U(r.q, 'Pa', 3), true], ['Vrije-moleculenwarmtestroom ½ρv³ (begin)', U(r.heat / 1e4, 'W/cm²', 3), true],
        ],
        tex: [
          `r_p=${tu(b.radius + v.rp, 'km')},\\quad v_p=\\sqrt{\\mu\\left(\\frac{2}{r_p}-\\frac{2}{r_p+r_a}\\right)}:\\ ${tu(r.vp0, KMS)}\\to${tu(r.vpT, KMS)}`,
          `v_p\\to v_p-\\Delta v_{pas}\\ \\Rightarrow\\ \\frac1a=\\frac2{r_p}-\\frac{v_p^2}{\\mu},\\quad r_a=2a-r_p\\qquad N=${r.n}`,
          `\\Delta v_{pas}=\\tfrac12\\,\\frac{C_dA}{m}\\,\\rho_p\\,v_p\\sqrt{2\\pi r_pH}\\ \\Rightarrow\\ \\rho_p=${tu(r.rhoP, 'kg/m^3', 3)},\\quad q=\\tfrac12\\rho_pv_p^2=${tu(r.q, 'Pa', 3)}`,
          `\\dot q_{fm}=\\tfrac12\\rho_p v_p^3=${tu(r.heat / 1e4, 'W/cm^2', 3)}`,
        ],
        note: 'Elke passage haalt hier dezelfde Δv uit de periapsissnelheid (in werkelijkheid regel je dat met de periapsishoogte, omdat de dichtheid sterk varieert). Dichtheid volgt uit de gekozen Δv met een exponentiële atmosfeer en een door jou ingevulde schaalhoogte (geen atmosfeermodel); de warmtestroom is de bovengrens voor vrije-moleculenstroming met volledige accommodatie, geen ontwerpwaarde. Omlooptijden worden per passage bijgewerkt; de periapsishoogte blijft constant.',
      }
    },
    src: 'Vallado, Fundamentals of Astrodynamics, §8.6 (weerstand); Curtis, hfst. 2 (vis-viva). De Δv per passage volgt uit het padintegraal van een exponentiële dichtheid over een parabolische periapsisomgeving (eigen afleiding, Gauss-integraal).',
  },
]
