import { AU, DEG, MU_EARTH, RE, decayLifetime, density, dragMakeupPerYear } from '@/lib/astro'
import * as C from '@/lib/calc'
import { needPositive } from '@/lib/calc'
import { N, U, dur, durTex, tu, type Calc, type Row } from './core'

const NM = 'N\\cdot m'
const burnList = (s: unknown) => String(s).split(/[\s;,]+/).filter(Boolean).map((x) => Number(x.replace(',', '.')))

export const SYS_CALCS: Calc[] = [
  // ------------------------------------------------------------ Aandrijving
  {
    id: 'tsiolkovsky', title: 'Raketvergelijking (Tsiolkovsky)', cat: 'Aandrijving', kw: 'rocket equation delta v isp propellant brandstof',
    blurb: 'Kies wat je zoekt: Δv, Isp, beginmassa, eindmassa of propellant',
    inputs: [
      { k: 'want', label: 'Zoek naar', def: 0, wide: true, options: [
        { value: 0, label: 'Δv (delta-v)' }, { value: 1, label: 'Isp (specifieke impuls)' }, { value: 2, label: 'm₀ (natte beginmassa)' },
        { value: 3, label: 'm_f (droge eindmassa)' }, { value: 4, label: 'Propellantmassa m_p' }] },
      { k: 'dv', label: 'Δv', unit: 'm/s', def: 3000, step: 50, show: (v) => v.want !== 0 },
      { k: 'isp', label: 'Isp', unit: 's', def: 320, step: 5, show: (v) => v.want !== 1 },
      { k: 'm0', label: 'm₀ (begin, nat)', unit: 'kg', def: 1000, show: (v) => v.want !== 2 },
      { k: 'mf', label: 'm_f (eind, droog)', unit: 'kg', def: 600, show: (v) => v.want <= 2 },
    ],
    craft: (c) => ({ m0: c.dry + c.prop, mf: c.dry, isp: c.isp }),
    compute: (v) => {
      const w = v.want as number, key = (['dv', 'isp', 'm0', 'mf', 'mf'] as const)[w]
      const err = (w !== 0 && !(v.dv > 0) ? 'Δv moet groter dan 0 zijn.' : null) ?? (w !== 1 ? needPositive(['Isp', v.isp]) : null) ??
        (w !== 2 ? needPositive(['m₀', v.m0]) : null) ?? (w <= 2 ? needPositive(['m_f', v.mf]) : null) ??
        (w <= 1 && v.m0 <= v.mf ? 'm₀ moet groter zijn dan m_f (er moet propellant zijn).' : null)
      if (err) return { err }
      const r = C.rocketSolve(key, { dv: v.dv, isp: v.isp, m0: v.m0, mf: v.mf })
      const hl = (k: string) => k === (w === 4 ? 'mp' : key)
      const g = '9.80665'
      const main = [
        `\\Delta v=I_{sp}\\,g_0\\ln\\frac{m_0}{m_f}=${N(r.isp)}\\cdot${g}\\cdot\\ln\\frac{${N(r.m0)}}{${N(r.mf)}}=${tu(r.dv, 'm/s')}`,
        `I_{sp}=\\frac{\\Delta v}{g_0\\ln(m_0/m_f)}=\\frac{${N(r.dv)}}{${g}\\cdot${N(Math.log(r.ratio))}}=${tu(r.isp, 's')}`,
        `m_0=m_f\\,e^{\\Delta v/(I_{sp}g_0)}=${N(r.mf)}\\cdot e^{${N(r.dv)}/(${N(r.isp)}\\cdot${g})}=${tu(r.m0, 'kg')}`,
        `m_f=m_0\\,e^{-\\Delta v/(I_{sp}g_0)}=${N(r.m0)}\\cdot e^{-${N(r.dv)}/(${N(r.isp)}\\cdot${g})}=${tu(r.mf, 'kg')}`,
        `m_p=m_0\\left(1-e^{-\\Delta v/(I_{sp}g_0)}\\right)=${N(r.m0)}\\cdot(1-${N(r.mf / r.m0, 5)})=${tu(r.mp, 'kg')}`,
      ][w]
      return {
        rows: [['Δv', U(r.dv, 'm/s'), hl('dv')], ['Isp', U(r.isp, 's'), hl('isp')], ['m₀ (begin)', U(r.m0, 'kg'), hl('m0')], ['m_f (eind)', U(r.mf, 'kg'), hl('mf')],
          ['Propellant m_p', U(r.mp, 'kg'), hl('mp')], ['Propellantfractie m_p/m₀', U(r.fraction * 100, '%', 4)], ['Massaverhouding m₀/m_f', U(r.ratio, '', 4)],
          ['Uitlaatsnelheid v_e = Isp·g₀', U(r.ve, 'm/s')]],
        tex: [main, `m_p=m_0-m_f=${tu(r.mp, 'kg')},\\quad \\frac{m_0}{m_f}=e^{\\Delta v/v_e}=${N(r.ratio, 4)}`],
        note: 'g₀ = 9,80665 m/s². Ideale raketvergelijking: geen zwaartekracht- of weerstandsverlies, één burn.',
      }
    },
    src: 'Tsiolkovsky (1903); Sutton & Biblarz, Rocket Propulsion Elements, hfst. 2.',
  },
  {
    id: 'burns', title: 'Burn-sequentie (massa na elke burn)', cat: 'Aandrijving', kw: 'burn sequence staging propellant budget',
    blurb: 'Lijst van Δv\'s → massa na elke burn en totaal propellant',
    inputs: [
      { k: 'm0', label: 'Startmassa m₀', unit: 'kg', def: 5000 },
      { k: 'isp', label: 'Isp', unit: 's', def: 320 },
      { k: 'list', label: 'Δv\'s in volgorde (m/s, gescheiden door komma)', def: '3200, 800, 450, 60', text: true, wide: true },
    ],
    craft: (c) => ({ m0: c.dry + c.prop, isp: c.isp }),
    compute: (v) => {
      const dvs = burnList(v.list)
      const err = needPositive(['m₀', v.m0], ['Isp', v.isp])
      if (err) return { err }
      if (!dvs.length || dvs.some((x) => !Number.isFinite(x) || x < 0)) return { err: 'Geef een lijst van positieve Δv-waarden in m/s, bv. 3200, 800, 450.' }
      if (dvs.length > 30) return { err: 'Maximaal 30 burns.' }
      const s = C.burnSequence(v.m0, v.isp, dvs)
      return {
        rows: [...s.steps.map((b, i): Row => [`Burn ${i + 1} · Δv ${U(b.dv, 'm/s')}`, `${U(b.before, '', 5)} → ${U(b.after, 'kg', 5)} (−${U(b.prop, 'kg')})`]),
          'Totaal', ['Σ Δv', U(s.dv, 'm/s'), true], ['Eindmassa', U(s.final, 'kg'), true], ['Totale propellant', U(s.prop, 'kg'), true], ['Propellantfractie', U((s.prop / v.m0) * 100, '%')]],
        tex: [`m_{k+1}=m_k\\,e^{-\\Delta v_k/(I_{sp}g_0)},\\quad v_e=I_{sp}g_0=${tu(v.isp * C.G0_MS, 'm/s')}`,
          `m_1=${N(s.steps[0].before)}\\,e^{-${N(dvs[0])}/${N(v.isp * C.G0_MS)}}=${tu(s.steps[0].after, 'kg')}`,
          `m_f=m_0\\,e^{-\\Sigma\\Delta v/v_e}=${N(v.m0)}\\,e^{-${N(s.dv)}/${N(v.isp * C.G0_MS)}}=${tu(s.final, 'kg')}`],
        note: 'Voor één Isp is de som van losse burns gelijk aan één burn met Σ Δv. Voor verschillende motoren per fase: bereken de fasen apart.',
      }
    },
    src: 'Tsiolkovsky (1903); Wertz & Larson, SMAD, hfst. 10 (propellantbudget).',
  },

  // ------------------------------------------------------------ Stand & rotatie
  {
    id: 'slew', title: 'Draaitijd van het ruimtevaartuig (slew)', cat: 'Stand & rotatie', kw: 'slew rotation attitude thruster torque 180 graden draaien moment of inertia',
    blurb: 'Hoe lang duurt een draai van θ met x newton op afstand d van de as?',
    inputs: [
      { k: 'theta', label: 'Draaihoek θ', unit: '°', def: 180, step: 5 },
      { k: 'F', label: 'Kracht per thruster F', unit: 'N', def: 10 },
      { k: 'n', label: 'Aantal thrusters (koppel)', def: 2, options: [{ value: 1, label: '1 (enkele thruster)' }, { value: 2, label: '2 (koppel)' }] },
      { k: 'd', label: 'Hefboom d (thruster ↔ draaias)', unit: 'm', def: 1, step: 0.1 },
      { k: 'shape', label: 'Traagheidsmoment', def: 0, wide: true, options: [
        { value: 0, label: 'Direct invoeren' }, { value: 1, label: 'Massieve cilinder, dwarsas' }, { value: 2, label: 'Balk (as ∥ derde ribbe)' }, { value: 3, label: 'Massieve bol' }] },
      { k: 'I', label: 'I', unit: 'kg·m²', def: 1000, show: (v) => v.shape === 0 },
      { k: 'mass', label: 'Massa m', unit: 'kg', def: 1000, show: (v) => v.shape > 0 },
      { k: 'r', label: 'Straal r', unit: 'm', def: 1, step: 0.1, show: (v) => v.shape === 1 || v.shape === 3 },
      { k: 'h', label: 'Lengte h', unit: 'm', def: 3, step: 0.1, show: (v) => v.shape === 1 },
      { k: 'a', label: 'Ribbe a (⊥ as)', unit: 'm', def: 2, step: 0.1, show: (v) => v.shape === 2 },
      { k: 'b', label: 'Ribbe b (⊥ as)', unit: 'm', def: 1, step: 0.1, show: (v) => v.shape === 2 },
      { k: 'wmax', label: 'Max. draaisnelheid (0 = geen)', unit: '°/s', def: 0, step: 0.5 },
      { k: 'isp', label: 'Isp thruster', unit: 's', def: 220, step: 5 },
    ],
    craft: (c) => ({ shape: 1, mass: c.dry + c.prop, isp: c.isp }),
    compute: (v) => {
      const m = v.shape
      const err = needPositive(['De draaihoek θ', v.theta], ['De kracht F', v.F], ['De hefboom d', v.d]) ??
        (m === 0 ? needPositive(['I', v.I]) : needPositive(['De massa', v.mass])) ??
        (m === 1 ? needPositive(['De straal r', v.r], ['De lengte h', v.h]) : m === 2 ? needPositive(['Ribbe a', v.a], ['Ribbe b', v.b]) : m === 3 ? needPositive(['De straal r', v.r]) : null)
      if (err) return { err }
      if (v.wmax < 0) return { err: 'De maximale draaisnelheid mag niet negatief zijn.' }
      const I = m === 0 ? v.I : m === 1 ? C.inertia.cylinder(v.mass, v.r, v.h) : m === 2 ? C.inertia.box(v.mass, v.a, v.b) : C.inertia.sphere(v.mass, v.r)
      const th = v.theta * DEG, wmax = v.wmax * DEG
      const s = C.slew({ theta: th, F: v.F, n: v.n, d: v.d, I, wMax: wmax, isp: v.isp })
      const iTex = m === 1 ? `I=\\frac{m}{12}(3r^2+h^2)=\\frac{${N(v.mass)}}{12}(3\\cdot${N(v.r)}^2+${N(v.h)}^2)=${tu(I, 'kg\\,m^2')}`
        : m === 2 ? `I=\\frac{m}{12}(a^2+b^2)=\\frac{${N(v.mass)}}{12}(${N(v.a)}^2+${N(v.b)}^2)=${tu(I, 'kg\\,m^2')}` : m === 3 ? `I=\\tfrac{2}{5}mr^2=${tu(I, 'kg\\,m^2')}` : null
      const rows: Row[] = [['Koppel τ = n·F·d', U(s.tau, 'N·m')], ...(m > 0 ? [['Traagheidsmoment I', U(I, 'kg·m²')] as Row] : []),
        ['Hoekversnelling α = τ/I', `${U(s.alpha, 'rad/s²')} = ${U(s.alpha / DEG, '°/s²')}`],
        ['Draaitijd t', `${U(s.t, 's')}${s.t >= 120 ? ` = ${dur(s.t)}` : ''}`, true], ['Piek-draaisnelheid', `${U(s.w, 'rad/s')} = ${U(s.w / DEG, '°/s')}`],
        ['Thrusters aan (versnellen + remmen)', U(s.tBurn, 's')]]
      if (s.limited) rows.push(['Uitrollen op max. snelheid', U(s.tCoast, 's')], ['Zonder snelheidslimiet', U(s.tFree, 's')])
      rows.push(['Propellant', U(s.prop, 'kg', 3)])
      return {
        rows,
        tex: [`\\tau=n\\,F\\,d=${N(v.n)}\\cdot${N(v.F)}\\cdot${N(v.d)}=${tu(s.tau, NM)}`, ...(iTex ? [iTex] : []),
          `\\alpha=\\frac{\\tau}{I}=\\frac{${N(s.tau)}}{${N(I)}}=${tu(s.alpha, 'rad/s^2')}`,
          `t=2\\sqrt{\\frac{\\theta}{\\alpha}}=2\\sqrt{\\frac{${N(th)}}{${N(s.alpha)}}}=${tu(s.tFree, 's')}`,
          `\\omega_{piek}=\\frac{\\alpha t}{2}=\\sqrt{\\theta\\alpha}=${tu(Math.sqrt(th * s.alpha), 'rad/s')}`,
          ...(s.limited ? [`t=\\frac{\\theta}{\\omega_{max}}+\\frac{\\omega_{max}}{\\alpha}=\\frac{${N(th)}}{${N(wmax)}}+\\frac{${N(wmax)}}{${N(s.alpha)}}=${tu(s.t, 's')}`] : []),
          `m_p=\\frac{n\\,F}{I_{sp}\\,g_0}\\,t_{aan}=\\frac{${N(v.n * v.F)}}{${N(v.isp)}\\cdot9.80665}\\cdot${N(s.tBurn)}=${tu(s.prop, 'kg')}`],
        note: 'Bang-bang: versnellen tot halverwege, dan remmen met hetzelfde koppel (θ in rad). Starre romp, constante stuwkracht, geen aflaten van massa, geen stuurwet-vertraging. Standaard: I = 1000 kg·m², 2 × 10 N op 1 m ⇒ 25 s voor 180°.',
      }
    },
    src: 'Euler/Newton voor rotatie, τ = I·α; minimum-time (bang-bang) slew: Wie, Space Vehicle Dynamics and Control; Wertz, SMAD hfst. 11.',
  },

  // ------------------------------------------------------------ Aardomgeving
  {
    id: 'magfield', title: 'Magnetisch veld van de Aarde (dipool)', cat: 'Aardomgeving', kw: 'magnetic field dipole geomagnetic igrf L-shell magnetometer',
    blurb: 'Veldsterkte en L-schil op afstand r en breedte λ',
    inputs: [
      { k: 'r', label: 'Afstand tot middelpunt Aarde r', unit: 'km', def: 7000 },
      { k: 'lm', label: 'Breedte invoeren als', def: 0, wide: true, options: [{ value: 0, label: 'Magnetische breedte λ' }, { value: 1, label: 'Geografische breedte/lengte' }] },
      { k: 'lat', label: 'Magnetische breedte λ', unit: '°', def: 30, show: (v) => v.lm === 0 },
      { k: 'glat', label: 'Geografische breedte', unit: '°', def: 52, show: (v) => v.lm === 1 },
      { k: 'glon', label: 'Geografische lengte', unit: '°', def: 5, show: (v) => v.lm === 1 },
      { k: 'fm', label: 'Veldsterkte opgeven als', def: 0, wide: true, options: [{ value: 0, label: 'B₀ (equator, oppervlak)' }, { value: 1, label: 'Magnetisch moment M' }] },
      { k: 'B0', label: 'B₀', unit: 'T', def: C.B0_EARTH, step: 1e-6, show: (v) => v.fm === 0 },
      { k: 'M', label: 'M', unit: 'A·m²', def: C.M_EARTH, show: (v) => v.fm === 1 },
      { k: 'R', label: 'Aardstraal R_E', unit: 'km', def: RE },
    ],
    compute: (v) => {
      const err = needPositive(['De afstand r', v.r], ['R_E', v.R], v.fm === 0 ? ['B₀', v.B0] : ['M', v.M])
      if (err) return { err }
      const lam = v.lm === 1 ? C.magneticLatitude(v.glat, v.glon) : v.lat
      if (Math.abs(lam) > 90) return { err: 'De breedte moet tussen −90° en 90° liggen.' }
      const B0 = v.fm === 1 ? C.dipoleB0FromMoment(v.M, v.R) : v.B0
      const d = C.dipoleField(v.r, lam, B0, v.R)
      const polar = Math.cos(lam * DEG) < 1e-6
      const T = (x: number) => `${U(x * 1e6, 'µT', 4)} = ${U(x, 'T', 4)}`
      const eqB = B0 * (v.R / v.r) ** 3
      const rows: Row[] = [...(v.lm === 1 ? [['Magnetische breedte λ (uit geografisch)', U(lam, '°', 4), true] as Row] : []),
        ['Totaal B', T(d.B), true], ['Radiaal B_r (+ = omhoog)', T(d.Br)], ['Horizontaal B_λ (noord)', T(d.Bl)], ['Equatorwaarde op deze r', T(eqB)],
        ['L-schil L = r/(R_E·cos²λ)', polar ? '∞ (pool)' : U(d.L, '', 4)], ...(v.fm === 1 ? [['B₀ uit M', T(B0)] as Row] : [])]
      return {
        rows,
        tex: [...(v.lm === 1 ? [`\\sin\\lambda=\\sin\\varphi\\sin\\varphi_p+\\cos\\varphi\\cos\\varphi_p\\cos(\\ell-\\ell_p)\\Rightarrow\\lambda=${N(lam, 4)}^\\circ\\quad(\\varphi_p=${N(C.POLE_LAT)}^\\circ,\\ \\ell_p=${N(C.POLE_LON)}^\\circ)`] : []),
          ...(v.fm === 1 ? [`B_0=\\frac{\\mu_0M}{4\\pi R_E^3}=\\frac{4\\pi\\!\\cdot\\!10^{-7}\\cdot${N(v.M)}}{4\\pi\\,(${N(v.R * 1000)}\\,\\mathrm{m})^3}=${tu(B0, 'T')}`] : []),
          `B=B_0\\left(\\frac{R_E}{r}\\right)^3\\sqrt{1+3\\sin^2\\lambda}=${N(B0)}\\cdot(${N(v.R / v.r)})^3\\cdot${N(Math.sqrt(1 + 3 * Math.sin(lam * DEG) ** 2))}=${tu(d.B, 'T')}`,
          `B_r=-2B_0\\left(\\frac{R_E}{r}\\right)^3\\sin\\lambda=${tu(d.Br, 'T')},\\quad B_\\lambda=B_0\\left(\\frac{R_E}{r}\\right)^3\\cos\\lambda=${tu(d.Bl, 'T')}`,
          `L=\\frac{r}{R_E\\cos^2\\lambda}=${polar ? '\\infty' : N(d.L, 4)}`],
        note: `${v.r < v.R ? 'Let op: r < R_E, het punt ligt binnen de Aarde. ' : ''}Een zuivere dipool wijkt af van IGRF met enkele tot ~10–20 % (meer vlak bij het oppervlak, bv. de Zuid-Atlantische Anomalie). B₀ = 31,2 µT is het gemiddelde equatoriale oppervlakteveld; het IGRF-dipoolmoment 7,94×10²² A·m² geeft 30,6 µT. Dipoolas (IGRF-13, 2020): 80,65°N, 72,68°W.`,
      }
    },
    src: 'Dipoolmodel: Wertz, SMAD, bijlage (Earth magnetic field); IGRF-13: Alken et al. (2021), Earth, Planets and Space 73:49.',
  },
  {
    id: 'ballistic', title: 'Ballistische coëfficiënt en luchtweerstand', cat: 'Aardomgeving', kw: 'ballistic coefficient drag decay lifetime atmosphere',
    blurb: 'BC = m/(Cd·A), weerstand op een hoogte en baanlevensduur',
    inputs: [
      { k: 'm', label: 'Massa m', unit: 'kg', def: 1000 },
      { k: 'cd', label: 'Weerstandscoëfficiënt Cd', def: 2.2, step: 0.1 },
      { k: 'A', label: 'Frontaal oppervlak A', unit: 'm²', def: 5, step: 0.5 },
      { k: 'h', label: 'Hoogte (cirkelbaan)', unit: 'km', def: 400, step: 10 },
    ],
    craft: (c) => ({ m: c.dry + c.prop, cd: c.cd, A: c.area }),
    compute: (v) => {
      const err = needPositive(['De massa m', v.m], ['Cd', v.cd], ['Het oppervlak A', v.A])
      if (err) return { err }
      if (!(v.h >= 0 && v.h <= 2000)) return { err: 'De hoogte moet tussen 0 en 2000 km liggen.' }
      const bc = C.ballistic(v.m, v.cd, v.A), B = 1 / bc, rho = density(v.h), vc = Math.sqrt(MU_EARTH / (RE + v.h)) * 1000
      const a = C.dragDecel(rho, vc, bc), life = decayLifetime(v.h, B)
      return {
        rows: [['Ballistische coëfficiënt BC', U(bc, 'kg/m²'), true], ['Inverse B = Cd·A/m', U(B, 'm²/kg', 4)], ['Dichtheid ρ(h)', U(rho, 'kg/m³', 4)], ['Cirkelsnelheid', U(vc / 1000, 'km/s')],
          ['Weerstandsvertraging a', `${U(a, 'm/s²')} = ${U(a / 9.80665, 'g', 3)}`, true], ['Δv om weerstand te compenseren', U(dragMakeupPerYear(v.h, B), 'm/s per jaar')],
          ['Baanlevensduur (tot 100 km)', Number.isFinite(life) ? dur(life) : '> 10 000 jaar', true]],
        tex: [`BC=\\frac{m}{C_d\\,A}=\\frac{${N(v.m)}}{${N(v.cd)}\\cdot${N(v.A)}}=${tu(bc, 'kg/m^2')},\\quad B=\\frac{C_dA}{m}=${tu(B, 'm^2/kg')}`,
          `\\rho(${N(v.h)}\\,\\mathrm{km})=${tu(rho, 'kg/m^3')}`,
          `a=\\frac{1}{2}\\frac{\\rho\\,v^2}{BC}=\\frac{\\rho\\,v^2\\,C_dA}{2m}=\\frac{0.5\\cdot${N(rho)}\\cdot(${N(vc)})^2}{${N(bc)}}=${tu(a, 'm/s^2')}`],
        note: 'Dichtheid uit een gemiddelde standaardatmosfeer (zonder zonne-activiteit; op dezelfde hoogte kan ρ een factor 10 variëren met de zonnecyclus). Levensduur: cirkelbaan die door weerstand zakt tot 100 km.',
      }
    },
    src: 'Vallado, Fundamentals of Astrodynamics, §8.6; Montenbruck & Gill, Satellite Orbits, §3.5; US Standard Atmosphere 1976.',
  },

  // ------------------------------------------------------------ Overig
  {
    id: 'light', title: 'Lichttijd / signaalvertraging', cat: 'Overig', kw: 'light time signal delay communication latency',
    blurb: 'Hoe lang doet een radiosignaal over een afstand d',
    inputs: [
      { k: 'd', label: 'Afstand', def: 1, step: 0.1 },
      { k: 'u', label: 'Eenheid', def: 2, options: [{ value: 0, label: 'km' }, { value: 1, label: '10⁶ km' }, { value: 2, label: 'AU' }] },
    ],
    compute: (v) => {
      const err = needPositive(['De afstand', v.d])
      if (err) return { err }
      const km = v.d * [1, 1e6, AU][v.u], t = C.lightTime(km)
      return {
        rows: [['Afstand', `${U(km, 'km')} = ${U(km / AU, 'AU')}`], ['Enkele reis', `${dur(t)}${t >= 120 ? ` (${U(t, 's')})` : ''}`, true], ['Heen en terug', dur(2 * t), true]],
        tex: [`t=\\frac{d}{c}=\\frac{${N(km)}\\,\\mathrm{km}}{299\\,792{,}458\\,\\mathrm{km/s}}=${durTex(t)}`],
        note: 'Ter vergelijking: Maan 384 400 km → 1,28 s; Mars 0,37–2,67 AU → 3–22 min; Jupiter ≈ 4,2–6,2 AU. Alleen de lichtreistijd, zonder vertraging in apparatuur of de ionosfeer.',
      }
    },
    src: 'c = 299 792 458 m/s (SI-definitie).',
  },
  {
    id: 'solar', title: 'Zonneflux en evenwichtstemperatuur', cat: 'Overig', kw: 'solar flux irradiance temperature thermal equilibrium plate',
    blurb: 'S op afstand r van de Zon en de temperatuur van een passieve plaat of bol',
    inputs: [
      { k: 'r', label: 'Afstand tot de Zon', unit: 'AU', def: 1, step: 0.1 },
      { k: 'al', label: 'Absorptie α (zon)', def: 0.9, step: 0.05 },
      { k: 'ep', label: 'Emissie ε (infrarood)', def: 0.9, step: 0.05 },
      { k: 'g', label: 'Vorm', def: 0, wide: true, options: [
        { value: 0, label: 'Bol (A_abs/A_str = 1/4)' }, { value: 1, label: 'Plaat, beide zijden stralen (1/2)' }, { value: 2, label: 'Plaat, achterkant geïsoleerd (1)' }] },
    ],
    compute: (v) => {
      const err = needPositive(['De afstand', v.r], ['α', v.al], ['ε', v.ep])
      if (err) return { err }
      if (v.al > 1 || v.ep > 1) return { err: 'α en ε liggen tussen 0 en 1.' }
      const S = C.solarFlux(v.r), k = [0.25, 0.5, 1][v.g], T = C.equilibriumTemp(S, v.al, v.ep, k)
      return {
        rows: [['Zonneflux S', U(S, 'W/m²'), true], ['Verhouding tot 1 AU', U(S / C.solarFlux(1), '×', 4)], ['Evenwichtstemperatuur', `${U(T, 'K', 4)} = ${U(T - 273.15, '°C', 4)}`, true]],
        tex: [`S=\\frac{L_\\odot}{4\\pi r^2}=\\frac{${N(C.L_SUN)}}{4\\pi\\,(${N(v.r * AU * 1000)})^2}=${tu(S, 'W/m^2')}`,
          `S\\,\\alpha\\,A_{abs}=\\varepsilon\\,\\sigma\\,A_{str}\\,T^4\\ \\Rightarrow\\ T=\\left(\\frac{S\\,\\alpha}{\\varepsilon\\,\\sigma}\\frac{A_{abs}}{A_{str}}\\right)^{1/4}`,
          `T=\\left(\\frac{${N(S)}\\cdot${N(v.al)}\\cdot${N(k)}}{${N(v.ep)}\\cdot${N(C.SIGMA, 4)}}\\right)^{1/4}=${tu(T, 'K')}`],
        note: 'Alleen directe zonnestraling, zonder albedo of interne warmte. Een zwarte bol op 1 AU: 278 K; een vlakke plaat met α = ε die recht op de Zon staat: ≈ 394 K (zon op één kant, achterkant geïsoleerd).',
      }
    },
    src: 'Wertz & Larson, SMAD, hfst. 11; L☉ = 3,828×10²⁶ W (IAU 2015 B3), σ = 5,670374×10⁻⁸ W/m²/K⁴ (CODATA 2018).',
  },
]
