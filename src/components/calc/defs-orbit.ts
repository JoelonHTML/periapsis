import { AU, DEG, MU_SUN, departDv, visViva } from '@/lib/astro'
import * as C from '@/lib/calc'
import { CENTRALS, PLANETS, needPositive } from '@/lib/calc'
import { N, U, dur, durTex, tu, type Calc, type Opt, type V } from './core'

const cOpts: Opt[] = CENTRALS.map((c, i) => ({ value: i, label: c.name }))
const EARTH = 3
const manual: Opt = { value: -1, label: 'Handmatig' }
const pOpts: Opt[] = [...PLANETS.map((p, i) => ({ value: i, label: p.name })), manual]
const MU = (mu: number) => `\\mu=${tu(mu, 'km^3/s^2')}`
const KMS = 'km/s'
const AUstr = (km: number) => U(km / AU, 'AU')
const sunish = (v: V) => v.c === 0
const pi = (id: string) => PLANETS.findIndex((p) => p.id === id)
const P_EARTH = pi('earth'), P_MARS = pi('mars')

export const ORBIT_CALCS: Calc[] = [
  // ------------------------------------------------------------ Baanmechanica
  {
    id: 'vcirc', title: 'Cirkel- en ontsnappingssnelheid', cat: 'Baanmechanica', kw: 'circular escape orbit snelheid',
    blurb: 'v_c en v_esc op een hoogte boven een willekeurig hemellichaam',
    inputs: [
      { k: 'c', label: 'Hemellichaam', def: EARTH, options: cOpts },
      { k: 'h', label: 'Hoogte boven oppervlak', unit: 'km', def: 400 },
    ],
    compute: (v) => {
      const c = CENTRALS[v.c], r = c.radius + v.h
      const err = needPositive(['De baanstraal r (lichaamsstraal + hoogte)', r])
      if (err) return { err }
      const vc = C.vCirc(c.mu, r), ve = C.vEsc(c.mu, r)
      return {
        rows: [['Baanstraal r', U(r, 'km')], ['Cirkelsnelheid v_c', U(vc, KMS), true], ['Ontsnappingssnelheid v_esc', U(ve, KMS), true],
          ['Δv van cirkelbaan naar ontsnapping', U(ve - vc, KMS)], ['Omlooptijd cirkelbaan', dur(C.orbitPeriod(c.mu, r))]],
        tex: [MU(c.mu) + `,\\; r=${tu(c.radius, 'km')}+${tu(v.h, 'km')}=${tu(r, 'km')}`,
          `v_c=\\sqrt{\\frac{\\mu}{r}}=\\sqrt{\\frac{${N(c.mu)}}{${N(r)}}}=${tu(vc, KMS)}`,
          `v_{esc}=\\sqrt{\\frac{2\\mu}{r}}=\\sqrt{2}\\,v_c=${tu(ve, KMS)}`,
          `T=2\\pi\\sqrt{\\frac{r^3}{\\mu}}=${durTex(C.orbitPeriod(c.mu, r))}`],
        note: 'Aarde: equatoriale straal 6378,137 km (met 6371 km gemiddeld wordt v_esc 11,186 km/s).',
      }
    },
    src: 'Curtis, Orbital Mechanics for Engineering Students, hfst. 2 (cirkelbaan en ontsnappingsbaan).',
  },
  {
    id: 'kepler', title: 'Omlooptijd en halve lange as (Kepler III)', cat: 'Baanmechanica', kw: 'period semi-major axis',
    blurb: 'T uit a, of a uit T, om een willekeurig lichaam',
    inputs: [
      { k: 'c', label: 'Centrale massa', def: EARTH, options: cOpts },
      { k: 'mode', label: 'Gegeven', def: 0, options: [{ value: 0, label: 'a → T' }, { value: 1, label: 'T → a' }] },
      { k: 'a', label: 'Halve lange as a', unit: 'km', def: 42164, show: (v) => v.mode === 0 },
      { k: 'T', label: 'Omlooptijd T', unit: 'uur', def: 23.934, step: 0.1, show: (v) => v.mode === 1 },
    ],
    compute: (v) => {
      const c = CENTRALS[v.c]
      const err = needPositive([v.mode === 0 ? 'De halve lange as a' : 'De omlooptijd T', v.mode === 0 ? v.a : v.T])
      if (err) return { err }
      const a = v.mode === 0 ? v.a : C.semiMajorFromPeriod(c.mu, v.T * 3600)
      const T = C.orbitPeriod(c.mu, a)
      return {
        rows: [['Halve lange as a', U(a, 'km'), v.mode === 1], ['Omlooptijd T', dur(T) + ` (${U(T, 's')})`, v.mode === 0],
          ['Hoogte bij cirkelbaan', U(a - c.radius, 'km')], ['Cirkelsnelheid', U(C.vCirc(c.mu, a), KMS)]],
        tex: [MU(c.mu),
          v.mode === 0
            ? `T=2\\pi\\sqrt{\\frac{a^3}{\\mu}}=2\\pi\\sqrt{\\frac{(${N(a)})^3}{${N(c.mu)}}}=${tu(T, 's')}`
            : `a=\\left(\\frac{\\mu T^2}{4\\pi^2}\\right)^{1/3}=\\left(\\frac{${N(c.mu)}\\cdot(${N(v.T * 3600)})^2}{4\\pi^2}\\right)^{1/3}=${tu(a, 'km')}`],
        note: 'Siderische dag 23,934 u geeft de geostationaire baan: a = 42 164 km.',
      }
    },
    src: 'Kepler (1619), Harmonices Mundi; Curtis, hfst. 2 (periode van een ellips).',
  },
  {
    id: 'visviva', title: 'Vis-viva: snelheid op straal r', cat: 'Baanmechanica', kw: 'vis viva energy ellipse speed',
    blurb: 'Snelheid op afstand r in een ellips met a en e',
    inputs: [
      { k: 'c', label: 'Centrale massa', def: EARTH, options: cOpts },
      { k: 'a', label: 'Halve lange as a', unit: 'km', def: 24400 },
      { k: 'e', label: 'Excentriciteit e', def: 0.73, step: 0.01 },
      { k: 'r', label: 'Straal r vanaf het centrum', unit: 'km', def: 7000, wide: true },
    ],
    compute: (v) => {
      const c = CENTRALS[v.c]
      const err = needPositive(['De halve lange as a', v.a], ['De straal r', v.r])
      if (err) return { err }
      if (!(v.e >= 0 && v.e < 1)) return { err: 'Excentriciteit moet in [0, 1) liggen (ellips of cirkel).' }
      const rp = v.a * (1 - v.e), ra = v.a * (1 + v.e)
      if (v.r < rp * (1 - 1e-9) || v.r > ra * (1 + 1e-9)) return { err: `r ligt buiten de baan: kies r tussen ${U(rp)} en ${U(ra)} km.` }
      const vv = C.vCirc(c.mu, v.r) * Math.sqrt(2 - v.r / v.a)
      return {
        rows: [['Snelheid v op r', U(vv, KMS), true], ['Pericentrum rp / apocentrum ra', `${U(rp)} / ${U(ra)} km`],
          ['v in pericentrum / apocentrum', `${U(visViva(c.mu, rp, v.a))} / ${U(visViva(c.mu, ra, v.a))} km/s`],
          ['Cirkelsnelheid op r', U(C.vCirc(c.mu, v.r), KMS)], ['Omlooptijd', dur(C.orbitPeriod(c.mu, v.a))],
          ['Specifieke energie ε', U(-c.mu / (2 * v.a), 'km²/s²')]],
        tex: [MU(c.mu),
          `v=\\sqrt{\\mu\\left(\\frac{2}{r}-\\frac{1}{a}\\right)}=\\sqrt{${N(c.mu)}\\left(\\frac{2}{${N(v.r)}}-\\frac{1}{${N(v.a)}}\\right)}=${tu(vv, KMS)}`,
          `\\varepsilon=-\\frac{\\mu}{2a}=\\frac{v^2}{2}-\\frac{\\mu}{r}=${tu(-c.mu / (2 * v.a), 'km^2/s^2')}`],
      }
    },
    src: 'Curtis, hfst. 2 (energievergelijking / vis-viva); Vallado, Fundamentals of Astrodynamics, §1.',
  },
  {
    id: 'ellipse', title: 'Ellips uit pericentrum en apocentrum', cat: 'Baanmechanica', kw: 'periapsis apoapsis eccentricity',
    blurb: 'a, e, T, snelheden en energie uit twee hoogtes',
    inputs: [
      { k: 'c', label: 'Centrale massa', def: EARTH, options: cOpts },
      { k: 'hp', label: 'Pericentrumhoogte', unit: 'km', def: 250 },
      { k: 'ha', label: 'Apocentrumhoogte', unit: 'km', def: 35786, wide: true },
    ],
    compute: (v) => {
      const c = CENTRALS[v.c], rp = c.radius + v.hp, ra = c.radius + v.ha
      const err = needPositive(['De pericentrumstraal', rp], ['De apocentrumstraal', ra])
      if (err) return { err }
      if (ra < rp) return { err: 'Het apocentrum moet hoger liggen dan het pericentrum.' }
      const o = C.ellipseFromRadii(c.mu, rp, ra)
      return {
        rows: [['Halve lange as a', U(o.a, 'km')], ['Excentriciteit e', U(o.e, '', 5), true], ['Omlooptijd T', dur(o.T), true],
          ['v in pericentrum', U(o.vp, KMS)], ['v in apocentrum', U(o.va, KMS)], ['Specifieke energie ε', U(o.energy, 'km²/s²')]],
        tex: [MU(c.mu) + `,\\; r_p=${tu(rp, 'km')},\\; r_a=${tu(ra, 'km')}`,
          `a=\\frac{r_p+r_a}{2}=${tu(o.a, 'km')},\\quad e=\\frac{r_a-r_p}{r_a+r_p}=${N(o.e, 5)}`,
          `v_p=\\sqrt{\\mu\\left(\\frac{2}{r_p}-\\frac1a\\right)}=${tu(o.vp, KMS)},\\quad v_a=\\sqrt{\\mu\\left(\\frac{2}{r_a}-\\frac1a\\right)}=${tu(o.va, KMS)}`,
          `T=2\\pi\\sqrt{\\frac{a^3}{\\mu}}=${durTex(o.T)},\\quad \\varepsilon=-\\frac{\\mu}{2a}=${tu(o.energy, 'km^2/s^2')}`],
        note: 'Standaardwaarden: GTO (250 × 35 786 km).',
      }
    },
    src: 'Curtis, hfst. 2 (baanelementen uit rp en ra).',
  },
  {
    id: 'hohmann-body', title: 'Hohmann-transfer om een lichaam', cat: 'Baanmechanica', kw: 'LEO GEO transfer hohmann',
    blurb: 'Twee burns tussen cirkelbanen, bv. LEO → GEO',
    inputs: [
      { k: 'c', label: 'Centrale massa', def: EARTH, options: cOpts.slice(1) },
      { k: 'h1', label: 'Beginhoogte', unit: 'km', def: 300 },
      { k: 'h2', label: 'Eindhoogte', unit: 'km', def: 35786 },
    ],
    compute: (v) => {
      const c = CENTRALS[v.c], r1 = c.radius + v.h1, r2 = c.radius + v.h2
      const err = needPositive(['De beginstraal', r1], ['De eindstraal', r2])
      if (err) return { err }
      if (r1 === r2) return { err: 'Begin- en eindhoogte zijn gelijk: geen transfer nodig.' }
      const h = C.hohmannFull(c.mu, r1, r2)
      return {
        rows: [['Transfer-as a', U(h.a, 'km')], ['v cirkelbaan 1 → v transfer (begin)', `${U(h.vc1)} → ${U(h.vt1)} km/s`],
          ['Δv₁', U(h.dv1, KMS), true], ['v transfer (eind) → v cirkelbaan 2', `${U(h.vt2)} → ${U(h.vc2)} km/s`], ['Δv₂', U(h.dv2, KMS), true],
          ['Totaal Δv', U(h.dv, KMS), true], ['Transfertijd', dur(h.tof)]],
        tex: [MU(c.mu) + `,\\; r_1=${tu(r1, 'km')},\\; r_2=${tu(r2, 'km')}`,
          `a=\\frac{r_1+r_2}{2}=${tu(h.a, 'km')}`,
          `\\Delta v_1=\\left|\\sqrt{\\mu\\left(\\frac{2}{r_1}-\\frac1a\\right)}-\\sqrt{\\frac{\\mu}{r_1}}\\right|=|${N(h.vt1)}-${N(h.vc1)}|=${tu(h.dv1, KMS)}`,
          `\\Delta v_2=\\left|\\sqrt{\\frac{\\mu}{r_2}}-\\sqrt{\\mu\\left(\\frac{2}{r_2}-\\frac1a\\right)}\\right|=|${N(h.vc2)}-${N(h.vt2)}|=${tu(h.dv2, KMS)}`,
          `t=\\pi\\sqrt{\\frac{a^3}{\\mu}}=${durTex(h.tof)}`],
        note: 'Impulsieve burns, coplanaire cirkelbanen. Voor LEO → GEO komt daar nog een inclinatiewijziging bij (zie Vlakverandering).',
      }
    },
    src: 'Hohmann (1925); Curtis, §6.2.',
  },
  {
    id: 'bielliptic', title: 'Bi-elliptisch versus Hohmann', cat: 'Baanmechanica', kw: 'bi-elliptic transfer',
    blurb: 'Drie burns via een verre tussenbaan, vergeleken met twee',
    inputs: [
      { k: 'c', label: 'Centrale massa', def: EARTH, options: cOpts.slice(1) },
      { k: 'h1', label: 'Beginhoogte', unit: 'km', def: 300 },
      { k: 'h2', label: 'Eindhoogte', unit: 'km', def: 200000 },
      { k: 'hb', label: 'Apocentrum tussenbaan', unit: 'km', def: 1000000, wide: true },
    ],
    compute: (v) => {
      const c = CENTRALS[v.c], r1 = c.radius + v.h1, r2 = c.radius + v.h2, rb = c.radius + v.hb
      const err = needPositive(['De beginstraal', r1], ['De eindstraal', r2], ['De apocentrumstraal r_b', rb])
      if (err) return { err }
      if (rb < Math.max(r1, r2)) return { err: 'r_b moet minstens zo groot zijn als de grootste van r₁ en r₂.' }
      if (r1 === r2) return { err: 'Begin- en eindhoogte zijn gelijk: geen transfer nodig.' }
      const h = C.hohmannFull(c.mu, r1, r2), b = C.biElliptic(c.mu, r1, r2, rb)
      const win = h.dv - b.dv
      return {
        rows: ['Hohmann', ['Totaal Δv', U(h.dv, KMS), true], ['Tijd', dur(h.tof)], 'Bi-elliptisch',
          ['Δv₁ / Δv₂ / Δv₃', `${U(b.dv1)} / ${U(b.dv2)} / ${U(b.dv3)} km/s`], ['Totaal Δv', U(b.dv, KMS), true], ['Tijd', dur(b.tof)],
          'Vergelijking', [win > 0 ? 'Bi-elliptisch bespaart' : 'Hohmann bespaart', `${U(Math.abs(win) * 1000, 'm/s')} (${U((Math.abs(win) / Math.max(h.dv, b.dv)) * 100, '%', 3)})`, true],
          ['Verhouding r₂/r₁', U(r2 / r1, '', 4)]],
        tex: [MU(c.mu),
          `\\Delta v_1=\\sqrt{\\mu\\left(\\tfrac{2}{r_1}-\\tfrac{2}{r_1+r_b}\\right)}-\\sqrt{\\tfrac{\\mu}{r_1}}=${tu(b.dv1, KMS)}`,
          `\\Delta v_2=\\sqrt{\\mu\\left(\\tfrac{2}{r_b}-\\tfrac{2}{r_b+r_2}\\right)}-\\sqrt{\\mu\\left(\\tfrac{2}{r_b}-\\tfrac{2}{r_1+r_b}\\right)}=${tu(b.dv2, KMS)}`,
          `\\Delta v_3=\\sqrt{\\tfrac{\\mu}{r_2}}-\\sqrt{\\mu\\left(\\tfrac{2}{r_2}-\\tfrac{2}{r_b+r_2}\\right)}=${tu(b.dv3, KMS)}`,
          `\\Delta v_{tot}=${N(b.dv)}\\ \\text{vs. Hohmann}\\ ${tu(h.dv, KMS)}`],
        note: 'Bi-elliptisch wint alleen als r₂/r₁ > 11,94, en bij r₂/r₁ > 15,58 altijd (met r_b ver genoeg); de reistijd is wel veel langer.',
      }
    },
    src: 'Hoelker & Silber (1959); Curtis, §6.3.',
  },
  {
    id: 'plane', title: 'Vlakverandering (inclinatie)', cat: 'Baanmechanica', kw: 'plane change inclination',
    blurb: 'Δv voor een inclinatiewijziging, alleen of gecombineerd met een burn',
    inputs: [
      { k: 'v1', label: 'Snelheid vóór de burn v₁', unit: 'km/s', def: 7.67, step: 0.01 },
      { k: 'v2', label: 'Snelheid ná de burn v₂', unit: 'km/s', def: 7.67, step: 0.01 },
      { k: 'di', label: 'Inclinatieverandering Δi', unit: '°', def: 28.5, step: 0.1, wide: true },
    ],
    compute: (v) => {
      const err = needPositive(['v₁', v.v1], ['v₂', v.v2])
      if (err) return { err }
      if (v.di < 0 || v.di > 180) return { err: 'Δi moet tussen 0° en 180° liggen.' }
      const di = v.di * DEG, pure = C.planeChange(v.v1, di), comb = C.combinedChange(v.v1, v.v2, di), sep = Math.abs(v.v2 - v.v1) + pure
      return {
        rows: [['Alleen vlakverandering (bij v₁)', U(pure, KMS), true], ['Gecombineerd (snelheid + vlak)', U(comb, KMS), true],
          ['Apart: |v₂ − v₁| + vlak', U(sep, KMS)], ['Besparing door combineren', U(sep - comb, KMS)]],
        tex: [`\\Delta v_{vlak}=2\\,v_1\\sin\\frac{\\Delta i}{2}=2\\cdot${N(v.v1)}\\cdot\\sin\\frac{${N(v.di)}^\\circ}{2}=${tu(pure, KMS)}`,
          `\\Delta v_{comb}=\\sqrt{v_1^2+v_2^2-2v_1v_2\\cos\\Delta i}=${tu(comb, KMS)}`],
        note: 'Doe vlakveranderingen waar de snelheid laag is (apocentrum), en combineer ze met een burn. Standaard: LEO-snelheid, 28,5° (Kaap Canaveral → equator).',
      }
    },
    src: 'Curtis, §6.8 (plane change manoeuvres).',
  },
  {
    id: 'soi', title: 'Invloedssfeer en Hill-straal', cat: 'Baanmechanica', kw: 'sphere of influence hill laplace',
    blurb: 'r_SOI = a(m/M)^{2/5} en r_H = a(m/3M)^{1/3}',
    inputs: [
      { k: 's', label: 'Lichaam', def: P_EARTH, options: [...pOpts.slice(0, -1), { value: 100, label: 'Maan (om Aarde)' }, manual] },
      { k: 'a', label: 'Afstand tot moederlichaam a', unit: 'km', def: AU, show: (v) => v.s === -1 },
      { k: 'm', label: 'μ van het lichaam', unit: 'km³/s²', def: 398600.4418, show: (v) => v.s === -1 },
      { k: 'M', label: 'μ van het moederlichaam', unit: 'km³/s²', def: MU_SUN, show: (v) => v.s === -1 },
    ],
    compute: (v) => {
      let a: number, m: number, M: number, name: string, radius = NaN
      if (v.s === -1) { a = v.a; m = v.m; M = v.M; name = 'handmatig' } else if (v.s === 100) { a = 384400; m = CENTRALS[4].mu; M = CENTRALS[EARTH].mu; name = 'Maan'; radius = CENTRALS[4].radius } else { const p = PLANETS[v.s]; a = p.a; m = p.mu; M = MU_SUN; name = p.name; radius = p.radius }
      const err = needPositive(['De afstand a', a], ['μ van het lichaam', m], ['μ van het moederlichaam', M])
      if (err) return { err }
      if (m >= M) return { err: 'Het lichaam moet lichter zijn dan het moederlichaam (m < M).' }
      const soi = C.soiRadius(a, m, M), hill = C.hillRadius(a, m, M)
      return {
        rows: [['Massaverhouding m/M', U(m / M, '', 4)], ['Invloedssfeer r_SOI', U(soi, 'km'), true], ['Hill-straal r_H', U(hill, 'km'), true],
          ...(Number.isFinite(radius) ? [['r_SOI in lichaamsstralen', U(soi / radius, '×R', 4)] as [string, string]] : [])],
        tex: [`\\frac{m}{M}=\\frac{${N(m)}}{${N(M)}}=${N(m / M)},\\quad a=${tu(a, 'km')}\\ (${name})`,
          `r_{SOI}=a\\left(\\frac{m}{M}\\right)^{2/5}=${N(a)}\\cdot(${N(m / M)})^{0.4}=${tu(soi, 'km')}`,
          `r_{H}=a\\left(\\frac{m}{3M}\\right)^{1/3}=${tu(hill, 'km')}`],
        note: 'SOI voor patched conics (Laplace); Hill-straal is de grens voor stabiele satellietbanen (cirkelvormige baan, e = 0). Aarde: ≈ 925 000 km en ≈ 1,5 milj. km.',
      }
    },
    src: 'Laplace; Curtis, §8.4 (sphere of influence); Hill (1878) voor de Hill-straal.',
  },
  {
    id: 'spiral', title: 'Lage-stuwkracht spiraal (Edelbaum)', cat: 'Baanmechanica', kw: 'low thrust ion electric spiral',
    blurb: 'Δv en tijd tussen cirkelbanen met continue stuwkracht',
    inputs: [
      { k: 'c', label: 'Centrale massa', def: EARTH, options: cOpts.slice(1) },
      { k: 'h1', label: 'Beginhoogte', unit: 'km', def: 400 },
      { k: 'h2', label: 'Eindhoogte', unit: 'km', def: 35786 },
      { k: 'di', label: 'Inclinatieverandering', unit: '°', def: 0, step: 0.1 },
      { k: 'acc', label: 'Versnelling (stuwkracht/massa)', unit: 'mm/s²', def: 0.2, step: 0.05, wide: true },
    ],
    compute: (v) => {
      const c = CENTRALS[v.c], r1 = c.radius + v.h1, r2 = c.radius + v.h2
      const err = needPositive(['De beginstraal', r1], ['De eindstraal', r2], ['De versnelling', v.acc])
      if (err) return { err }
      if (v.di < 0 || v.di > 180) return { err: 'De inclinatieverandering moet tussen 0° en 180° liggen.' }
      const v1 = C.vCirc(c.mu, r1), v2 = C.vCirc(c.mu, r2), dv = C.edelbaum(v1, v2, v.di * DEG), t = (dv * 1000) / (v.acc * 1e-3)
      const hoh = C.hohmannFull(c.mu, r1, r2).dv
      return {
        rows: [['Cirkelsnelheid begin / eind', `${U(v1)} / ${U(v2)} km/s`], ['Δv spiraal (Edelbaum)', U(dv, KMS), true], ['Duur bij deze versnelling', dur(t), true],
          ['Ter vergelijking: Hohmann (impulsief)', U(hoh, KMS)], ['Extra Δv t.o.v. Hohmann', U(dv - hoh, KMS)]],
        tex: [`v_i=\\sqrt{\\mu/r_i}:\\quad v_1=${tu(v1, KMS)},\\; v_2=${tu(v2, KMS)}`,
          `\\Delta v=\\sqrt{v_1^2+v_2^2-2v_1v_2\\cos\\!\\left(\\tfrac{\\pi}{2}\\Delta i\\right)}\\;\\overset{\\Delta i=0}{=}\\;|v_1-v_2|=${tu(dv, KMS)}`,
          `t=\\frac{\\Delta v}{a_{stuw}}=\\frac{${N(dv * 1000)}\\,\\mathrm{m/s}}{${N(v.acc * 1e-3)}\\,\\mathrm{m/s^2}}=${durTex(t)}`],
        note: 'Constante tangentiële stuwkracht, bijna-cirkelbanen, geen schaduw- of J2-effecten; de versnelling is hier constant gehouden (massaverlies genegeerd).',
      }
    },
    src: 'Edelbaum (1961), ARS Journal 31(8); Wertz, Space Mission Engineering: The New SMAD, §Low-thrust.',
  },

  // ------------------------------------------------------------ Interplanetair
  {
    id: 'transfer', title: 'Transfersnelheid tussen twee planeten', cat: 'Interplanetair', kw: 'hohmann heliocentric earth mars venus jupiter planeet',
    blurb: 'a, v op de transferbaan, v∞, Δv, reistijd, synodisch, fasehoek',
    inputs: [
      { k: 'c', label: 'Centrale massa', def: 0, options: cOpts, wide: true },
      { k: 'p1', label: 'Planeet 1 (vertrek)', def: P_EARTH, options: pOpts, show: sunish },
      { k: 'p2', label: 'Planeet 2 (aankomst)', def: P_MARS, options: pOpts, show: sunish },
      { k: 'r1', label: 'r₁ vanaf centrum', unit: 'km', def: AU, show: (v) => !(v.c === 0 && v.p1 >= 0) },
      { k: 'r2', label: 'r₂ vanaf centrum', unit: 'km', def: 1.523679 * AU, show: (v) => !(v.c === 0 && v.p2 >= 0) },
      { k: 'hp1', label: 'Parkeerbaan bij 1 (hoogte)', unit: 'km', def: 300, show: (v) => v.c === 0 && v.p1 >= 0 },
      { k: 'hp2', label: 'Parkeerbaan bij 2 (hoogte)', unit: 'km', def: 300, show: (v) => v.c === 0 && v.p2 >= 0 },
    ],
    onChange: (k, v) => {
      if (k !== 'c') return
      if (v.c === 0) return { p1: P_EARTH, p2: P_MARS, r1: AU, r2: 1.523679 * AU }
      const R = CENTRALS[v.c].radius
      return { p1: -1, p2: -1, r1: Math.round(1.1 * R), r2: Math.round(5 * R) }
    },
    compute: (v) => {
      const c = CENTRALS[v.c], sun = v.c === 0
      const P1 = sun && v.p1 >= 0 ? PLANETS[v.p1] : null, P2 = sun && v.p2 >= 0 ? PLANETS[v.p2] : null
      const r1 = P1 ? P1.a : v.r1, r2 = P2 ? P2.a : v.r2
      const err = needPositive(['r₁', r1], ['r₂', r2])
      if (err) return { err }
      if (r1 === r2) return { err: 'r₁ en r₂ zijn gelijk: geen transfer nodig.' }
      const h = C.hohmannFull(c.mu, r1, r2)
      const km = (r: number) => (sun ? `${U(r, 'km')} = ${AUstr(r)}` : U(r, 'km'))
      const rows: (string | [string, string, boolean?])[] = [
        'Baan', ['r₁' + (P1 ? ` (${P1.name})` : ''), km(r1)], ['r₂' + (P2 ? ` (${P2.name})` : ''), km(r2)], ['Transfer-as a = (r₁+r₂)/2', km(h.a)],
        'Snelheden', ['Cirkelsnelheid bij 1 / bij 2', `${U(h.vc1)} / ${U(h.vc2)} km/s`],
        ['v transfer bij vertrek (r = r₁)', U(h.vt1, KMS), true], ['v transfer bij aankomst (r = r₂)', U(h.vt2, KMS), true],
        ['v∞ vertrek = |v_transfer − v_cirkel|', U(Math.abs(h.vinf1), KMS)], ['v∞ aankomst', U(Math.abs(h.vinf2), KMS)],
        'Δv en tijd', ['Δv₁ (boost bij vertrek)', U(h.dv1, KMS)], ['Δv₂ (boost bij aankomst)', U(h.dv2, KMS)], ['Totaal Δv₁ + Δv₂', U(h.dv, KMS), true],
        ['Reistijd π√(a³/μ)', `${U(h.tof / 86400, 'd')}${h.tof > 365.25 * 86400 ? ` = ${U(h.tof / 86400 / 365.25, 'jaar')}` : ''}`, true], ['Synodische periode', `${U(h.synodic / 86400, 'd')} = ${U(h.synodic / 86400 / 365.25, 'jaar')}`],
        ['Fasehoek bij vertrek (doel t.o.v. vertrekbaan)', `${U(h.phase, '°', 3)}${h.phase < 0 ? ' (doel loopt achter)' : ' (doel loopt voor)'}`],
      ]
      const tex = [MU(c.mu),
        `a=\\frac{r_1+r_2}{2}=\\frac{${N(r1)}+${N(r2)}}{2}=${tu(h.a, 'km')}`,
        `v_{t,1}=\\sqrt{\\mu\\left(\\frac{2}{r_1}-\\frac{1}{a}\\right)}=\\sqrt{${N(c.mu)}\\left(\\frac{2}{${N(r1)}}-\\frac{1}{${N(h.a)}}\\right)}=${tu(h.vt1, KMS)}`,
        `v_{t,2}=\\sqrt{\\mu\\left(\\frac{2}{r_2}-\\frac{1}{a}\\right)}=\\sqrt{${N(c.mu)}\\left(\\frac{2}{${N(r2)}}-\\frac{1}{${N(h.a)}}\\right)}=${tu(h.vt2, KMS)}`,
        `v_{c,i}=\\sqrt{\\mu/r_i}:\\ ${N(h.vc1)}\\ \\text{en}\\ ${N(h.vc2)}\\,\\mathrm{km/s}`,
        `v_{\\infty,1}=v_{t,1}-v_{c,1}=${tu(h.vt1 - h.vc1, KMS)},\\quad v_{\\infty,2}=v_{t,2}-v_{c,2}=${tu(h.vt2 - h.vc2, KMS)}`,
        `\\Delta v=|\\Delta v_1|+|\\Delta v_2|=${N(h.dv1)}+${N(h.dv2)}=${tu(h.dv, KMS)}`,
        `t=\\pi\\sqrt{\\frac{a^3}{\\mu}}=${durTex(h.tof)},\\quad T_{syn}=\\left|\\frac{1}{1/T_1-1/T_2}\\right|=${tu(h.synodic / 86400, 'd')}`,
        `\\varphi=180^\\circ-360^\\circ\\frac{t}{T_2}=180^\\circ-360^\\circ\\frac{${N(h.tof / 86400)}}{${N(h.T2 / 86400)}}=${N(h.phase, 3)}^\\circ`]
      if (P1 && P2) {
        const d1 = departDv(Math.abs(h.vinf1), P1.radius + v.hp1, P1.mu), d2 = departDv(Math.abs(h.vinf2), P2.radius + v.hp2, P2.mu)
        rows.push('Vanuit/naar parkeerbaan (cirkelvormig)', [`Δv vertrek uit ${v.hp1} km baan om ${P1.name}`, U(d1, KMS)], [`Δv insertie in ${v.hp2} km baan om ${P2.name}`, U(d2, KMS)], ['Totaal incl. parkeerbanen', U(d1 + d2, KMS), true])
        tex.push(`\\Delta v_{park}=\\sqrt{v_\\infty^2+\\frac{2\\mu_p}{r_p}}-\\sqrt{\\frac{\\mu_p}{r_p}}:\\ ${tu(d1, KMS)}\\ \\text{(vertrek)},\\ ${tu(d2, KMS)}\\ \\text{(aankomst)}`)
      }
      return { rows, tex, note: 'Impulsieve burns in coplanaire cirkelbanen (Hohmann). In dit model is Δv₁ = v∞ vertrek: de boost tussen de cirkelbaan en de transferellips.' }
    },
    src: 'Hohmann (1925); Curtis, §8.2–8.3; Wertz, SMAD ch. 6. Banen: gemiddelde halve lange assen (JPL Standish, J2000).',
  },
  {
    id: 'vinf', title: 'Excess-snelheid v∞ en C3', cat: 'Interplanetair', kw: 'excess velocity c3 characteristic energy escape hyperbolic departure',
    blurb: 'Vertrek-Δv uit een parkeerbaan voor gegeven v∞ of C3, en omgekeerd',
    inputs: [
      { k: 'c', label: 'Lichaam', def: EARTH, options: cOpts.slice(1) },
      { k: 'h', label: 'Hoogte parkeerbaan', unit: 'km', def: 300 },
      { k: 'mode', label: 'Gegeven', def: 0, wide: true, options: [{ value: 0, label: 'v∞ → Δv en C3' }, { value: 1, label: 'Δv → v∞ en C3' }, { value: 2, label: 'C3 → v∞ en Δv' }] },
      { k: 'vinf', label: 'v∞', unit: 'km/s', def: 3.5, step: 0.1, show: (v) => v.mode === 0 },
      { k: 'dv', label: 'Δv (burn)', unit: 'km/s', def: 3.6, step: 0.05, show: (v) => v.mode === 1 },
      { k: 'c3', label: 'C3', unit: 'km²/s²', def: 12.25, step: 0.5, show: (v) => v.mode === 2 },
    ],
    compute: (v) => {
      const c = CENTRALS[v.c], r = c.radius + v.h
      const err = needPositive(['De parkeerbaanstraal', r])
      if (err) return { err }
      const vc = C.vCirc(c.mu, r)
      let vinf: number
      if (v.mode === 0) vinf = v.vinf
      else if (v.mode === 2) { if (v.c3 < 0) return { err: 'C3 moet ≥ 0 zijn voor een ontsnappingsbaan.' }; vinf = Math.sqrt(v.c3) } else {
        if (v.dv <= 0) return { err: 'Δv moet groter dan 0 zijn.' }
        vinf = C.vinfFromDv(v.dv, r, c.mu)
        if (!Number.isFinite(vinf)) return { err: `Δv te klein: de minimale Δv voor ontsnapping is ${U(departDv(0, r, c.mu), KMS)}.` }
      }
      if (vinf < 0) return { err: 'v∞ moet ≥ 0 zijn.' }
      const dv = departDv(vinf, r, c.mu), e = C.hypEcc(r, vinf, c.mu), delta = vinf > 0 ? 2 * Math.asin(1 / e) : Math.PI
      return {
        rows: [['v∞', U(vinf, KMS), v.mode !== 0], ['C3 = v∞²', U(vinf * vinf, 'km²/s²'), v.mode !== 2], ['Vertrek-Δv', U(dv, KMS), v.mode !== 1],
          ['Cirkelsnelheid parkeerbaan', U(vc, KMS)], ['Snelheid na de burn (pericentrum)', U(vc + dv, KMS)], ['Excentriciteit hyperbool', U(e, '', 5)],
          ['Draaihoek asymptoten δ = 2·asin(1/e)', U(delta / DEG, '°', 4)], ['Ware anomalie asymptoot', U(Math.acos(-1 / e) / DEG, '°', 4)]],
        tex: [MU(c.mu) + `,\\; r=${tu(r, 'km')}`,
          `C_3=v_\\infty^2=(${N(vinf)})^2=${tu(vinf * vinf, 'km^2/s^2')}`,
          `\\Delta v=\\sqrt{v_\\infty^2+\\frac{2\\mu}{r}}-\\sqrt{\\frac{\\mu}{r}}=\\sqrt{${N(vinf * vinf)}+\\frac{2\\cdot${N(c.mu)}}{${N(r)}}}-${N(vc)}=${tu(dv, KMS)}`,
          `v_\\infty=\\sqrt{(v_c+\\Delta v)^2-\\frac{2\\mu}{r}}=${tu(vinf, KMS)}`,
          `e=1+\\frac{r\\,v_\\infty^2}{\\mu}=${N(e, 5)},\\quad \\delta=2\\arcsin\\frac1e=${N(delta / DEG, 4)}^\\circ`],
        note: 'Burn vanuit een cirkelbaan, in het pericentrum van de hyperbool. Aarde → Mars (Hohmann) heeft v∞ ≈ 2,94 km/s (C3 ≈ 8,7 km²/s²).',
      }
    },
    src: 'Curtis, §8.6 (planetary departure); Wertz, SMAD ch. 6 (C3).',
  },
  {
    id: 'synodic', title: 'Synodische periode', cat: 'Interplanetair', kw: 'synodic launch window opposition',
    blurb: 'Tijd tussen twee gelijke onderlinge standen (lanceervensters)',
    inputs: [
      { k: 'p1', label: 'Lichaam 1', def: P_EARTH, options: pOpts },
      { k: 'p2', label: 'Lichaam 2', def: P_MARS, options: pOpts },
      { k: 'T1', label: 'Omlooptijd 1', unit: 'dagen', def: 365.256, show: (v) => v.p1 === -1 },
      { k: 'T2', label: 'Omlooptijd 2', unit: 'dagen', def: 686.98, show: (v) => v.p2 === -1 },
    ],
    compute: (v) => {
      const T1 = (v.p1 >= 0 ? C.orbitPeriod(MU_SUN, PLANETS[v.p1].a) : v.T1 * 86400) / 86400
      const T2 = (v.p2 >= 0 ? C.orbitPeriod(MU_SUN, PLANETS[v.p2].a) : v.T2 * 86400) / 86400
      const err = needPositive(['Omlooptijd 1', T1], ['Omlooptijd 2', T2])
      if (err) return { err }
      if (Math.abs(T1 - T2) < 1e-9) return { err: 'De twee omlooptijden zijn gelijk: de synodische periode is oneindig.' }
      const S = C.synodicPeriod(T1, T2)
      return {
        rows: [['Omlooptijd 1', `${U(T1, 'd')} = ${U(T1 / 365.25, 'jaar')}`], ['Omlooptijd 2', `${U(T2, 'd')} = ${U(T2 / 365.25, 'jaar')}`],
          ['Synodische periode', `${U(S, 'd')} = ${U(S / 365.25, 'jaar')}`, true], ['Per 10 jaar', `${U(3652.5 / S, '×', 3)} een conjunctie/opstelling`]],
        tex: [`T_{syn}=\\left|\\frac{1}{\\frac{1}{T_1}-\\frac{1}{T_2}}\\right|=\\left|\\frac{1}{\\frac{1}{${N(T1)}}-\\frac{1}{${N(T2)}}}\\right|=${tu(S, 'd')}`,
          `T_i=2\\pi\\sqrt{\\frac{a_i^3}{\\mu_\\odot}}\\quad(\\text{uit de halve lange as})`],
        note: 'Aarde–Mars ≈ 780 d (2,13 jaar): dat is de kadans van marsvensters. Omlooptijden volgen uit Kepler III met de halve lange assen van de planeten.',
      }
    },
    src: 'Curtis, §8.3 (rendezvous opportunities).',
  },
  {
    id: 'flyby', title: 'Zwaartekrachtsslinger: max. afbuiging', cat: 'Interplanetair', kw: 'gravity assist flyby swing-by deflection',
    blurb: 'Afbuighoek δ en Δv-equivalent 2v∞·sin(δ/2) bij een flyby',
    inputs: [
      { k: 'c', label: 'Planeet / lichaam', def: EARTH, options: cOpts },
      { k: 'vinf', label: 'v∞ (t.o.v. het lichaam)', unit: 'km/s', def: 5, step: 0.1 },
      { k: 'h', label: 'Flyby-hoogte (pericentrum)', unit: 'km', def: 300, wide: true },
    ],
    compute: (v) => {
      const c = CENTRALS[v.c], rp = c.radius + v.h
      const err = needPositive(['v∞', v.vinf], ['De pericentrumstraal', rp])
      if (err) return { err }
      const g = C.flyby(v.vinf, rp, c.mu)
      return {
        rows: [['Excentriciteit e', U(g.e, '', 5)], ['Afbuiging δ', U(g.delta / DEG, '°', 4), true], ['Δv-equivalent 2v∞·sin(δ/2)', U(g.dvEq, KMS), true],
          ['Snelheid in pericentrum', U(g.vp, KMS)], ['Pericentrumstraal', `${U(rp, 'km')} = ${U(rp / c.radius, '×R', 4)}`]],
        tex: [MU(c.mu) + `,\\; r_p=${tu(rp, 'km')}`,
          `e=1+\\frac{r_p\\,v_\\infty^2}{\\mu}=1+\\frac{${N(rp)}\\cdot${N(v.vinf * v.vinf)}}{${N(c.mu)}}=${N(g.e, 5)}`,
          `\\delta=2\\arcsin\\frac{1}{e}=2\\arcsin\\frac{1}{1+r_pv_\\infty^2/\\mu}=${N(g.delta / DEG, 4)}^\\circ`,
          `\\Delta v_{eq}=2v_\\infty\\sin\\frac{\\delta}{2}=\\frac{2v_\\infty}{e}=${tu(g.dvEq, KMS)}`],
        note: 'Maximale afbuiging bij de laagste veilige hoogte. Dit is de heliocentrische Δv-winst die je gratis krijgt: de grootte van v∞ blijft gelijk, alleen de richting draait.',
      }
    },
    src: 'Curtis, §8.9 (planetary flyby); Vallado, Fundamentals of Astrodynamics, §12.',
  },
]
