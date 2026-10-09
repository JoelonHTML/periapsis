// Calculators that follow the EPFL course "Space Mission Design and Operations" (3.3 special orbits, 3.4 rendezvous, 4.2 interplanetary, 4.3 slingshot).
// Physics: src/lib/course.ts (tested). Row labels follow the interface language through L(); formulas are language-neutral TeX.
import { DEG, J2, MU_EARTH, MU_SUN, RE } from '@/lib/astro'
import * as C from '@/lib/calc'
import { CENTRALS, PLANETS } from '@/lib/calc'
import * as K from '@/lib/course'
import { L, N, U, dur, durTex, tu, type Calc, type Opt, type Row } from './core'

const KMS = 'km/s'
const pos = (...p: [string, number][]) => {
  for (const [n, x] of p) if (!(x > 0) || !Number.isFinite(x)) return { err: L(`${n} moet groter dan 0 zijn.`, `${n} must be greater than 0.`, `Το ${n} πρέπει να είναι μεγαλύτερο από 0.`) }
  return null
}
const cOpts: Opt[] = CENTRALS.map((c, i) => ({ value: i, label: c.name }))
const pOpts: Opt[] = PLANETS.filter((p) => p.id !== 'pluto').map((p) => ({ value: PLANETS.indexOf(p), label: p.name }))
const EARTH = 3
const MU = (mu: number) => `\\mu=${tu(mu, 'km^3/s^2')}`

export const COURSE_CALCS: Calc[] = [
  {
    id: 'geo', title: 'Geostationaire baan en GTO-insertie', cat: 'Baanmechanica', kw: 'geo geostationary geosynchronous gto apogee combined plane change sidereal kourou kennedy',
    blurb: 'r, v, T van GEO, zichthoek, en apogeum-burn: apart of gecombineerd',
    loc: {
      en: { title: 'Geostationary orbit and GTO insertion', blurb: 'r, v, T of GEO, view angle, and the apogee burn: separate or combined',
        src: 'EPFL 3.3.1 (geosynchronous and geostationary orbits); Curtis, ch. 6 (plane change); SMAD.',
        labels: { hp: 'GTO perigee altitude', lat: 'Inclination of the GTO (= launch latitude)', T: 'Orbital period (sidereal day)' } },
      el: { title: 'Γεωστατική τροχιά και εισαγωγή από GTO', blurb: 'r, v, T της GEO, γωνία θέασης και καύση στο απόγειο: χωριστά ή συνδυασμένα',
        src: 'EPFL 3.3.1 (γεωσύγχρονες και γεωστατικές τροχιές)· Curtis, κεφ. 6· SMAD.',
        labels: { hp: 'Ύψος περιγείου GTO', lat: 'Κλίση της GTO (= γεωγραφικό πλάτος εκτόξευσης)', T: 'Περίοδος (αστρική ημέρα)' } },
    },
    inputs: [
      { k: 'T', label: 'Omlooptijd (siderische dag)', unit: 'uur', def: 23.934472, step: 0.01 },
      { k: 'hp', label: 'Perigeumhoogte van de GTO', unit: 'km', def: 300 },
      { k: 'lat', label: 'Inclinatie van de GTO (= breedte lanceerbasis)', unit: '°', def: 28.5, step: 0.1, wide: true },
    ],
    compute: (v) => {
      const err = pos(['T', v.T]) ?? pos([L('De perigeumhoogte', 'The perigee altitude', 'Το ύψος περιγείου'), v.hp + RE])
      if (err) return err
      if (v.lat < 0 || v.lat > 90) return { err: L('De inclinatie moet tussen 0° en 90° liggen.', 'The inclination must be between 0° and 90°.', 'Η κλίση πρέπει να είναι μεταξύ 0° και 90°.') }
      const T = v.T * 3600, r = K.geoRadius(MU_EARTH, T), vg = C.vCirc(MU_EARTH, r), rp = RE + v.hp
      if (rp >= r) return { err: L('De perigeumhoogte ligt boven GEO.', 'The perigee is above GEO.', 'Το περίγειο είναι πάνω από τη GEO.') }
      const g = K.geoInsertion(MU_EARTH, rp, r, v.lat * DEG), a = (rp + r) / 2, e = (r - rp) / (r + rp)
      const view = K.viewAngle(RE, r), maxLat = K.maxViewLatitude(RE, r)
      return {
        rows: [
          L('GEO', 'GEO', 'GEO'),
          [L('Straal r (omlooptijd = siderische dag)', 'Radius r (period = sidereal day)', 'Ακτίνα r (περίοδος = αστρική ημέρα)'), U(r, 'km'), true], [L('Hoogte boven de evenaar', 'Altitude above the equator', 'Ύψος πάνω από τον ισημερινό'), U(r - RE, 'km')],
          [L('Snelheid v', 'Speed v', 'Ταχύτητα v'), U(vg, KMS), true],
          [L('Aarde gezien onder hoek', 'Earth seen under an angle of', 'Η Γη φαίνεται υπό γωνία'), U(view / DEG, '°', 3)], [L('Zichtbaar tot breedtegraad', 'Visible up to latitude', 'Ορατή έως το γεωγραφικό πλάτος'), U(maxLat / DEG, '°', 3)],
          L('GTO → GEO bij het apogeum', 'GTO → GEO at the apogee', 'GTO → GEO στο απόγειο'),
          [L('GTO: a, e, T', 'GTO: a, e, T', 'GTO: a, e, T'), `${U(a, 'km')}, ${U(e, '', 4)}, ${dur(C.orbitPeriod(MU_EARTH, a))}`],
          [L('Snelheid in apogeum v_apogee', 'Apogee speed v_apogee', 'Ταχύτητα απογείου v_apogee'), U(g.vApo, KMS)],
          [L('Δv₂ cirkelmaken', 'Δv₂ circularisation', 'Δv₂ κυκλοποίηση'), U(g.circ, KMS)], [L('Δv₃ vlakverandering', 'Δv₃ plane change', 'Δv₃ αλλαγή επιπέδου'), U(g.plane, KMS)],
          [L('Apart: Δv₂ + Δv₃', 'Separate: Δv₂ + Δv₃', 'Χωριστά: Δv₂ + Δv₃'), U(g.separate, KMS)], [L('Gecombineerd (één burn)', 'Combined (one burn)', 'Συνδυασμένα (μία καύση)'), U(g.combined, KMS), true],
          [L('Besparing', 'Saving', 'Εξοικονόμηση'), U(g.separate - g.combined, KMS)],
        ],
        tex: [MU(MU_EARTH),
          `T=2\\pi\\sqrt{\\frac{r^3}{\\mu}}\\;\\Rightarrow\\; r=\\left(\\frac{\\mu T^2}{4\\pi^2}\\right)^{1/3}=${tu(r, 'km')},\\quad V=\\frac{2\\pi r}{T}=${tu(vg, KMS)}`,
          `\\alpha=2\\arcsin\\frac{R_\\oplus}{r}=${N(view / DEG, 4)}^\\circ,\\quad \\varphi_{max}=\\arccos\\frac{R_\\oplus}{r}=${N(maxLat / DEG, 4)}^\\circ`,
          `\\Delta v_2=V_{circ}-V_{apogee}=${N(g.vC)}-${N(g.vApo)}=${tu(g.circ, KMS)}`,
          `\\Delta v_3=2V_{apogee}\\sin\\frac{\\Delta i}{2}=${tu(g.plane, KMS)}`,
          `\\Delta v_{comb}=\\sqrt{V_{apogee}^2+V_{circ}^2-2V_{apogee}V_{circ}\\cos\\Delta i}=${tu(g.combined, KMS)}`],
        note: L('Geostationair = geosynchroon, cirkelvormig (e = 0) en in het equatorvlak (i = 0). De GTO heeft de inclinatie van de breedte van de lanceerbasis (Kourou 5°, Kennedy 28,5°). Collegevoorbeeld (Kennedy, v_apogee = 1,606 km/s): Δv₂ = 1,469, Δv₃ = 0,791, apart 2,260 km/s; de formule geeft gecombineerd 1,831 km/s (de sheet noemt 1,821).',
          'Geostationary = geosynchronous, circular (e = 0) and in the equatorial plane (i = 0). The GTO is inclined by the launch-site latitude (Kourou 5°, Kennedy 28.5°). Course example (Kennedy, v_apogee = 1.606 km/s): Δv₂ = 1.469, Δv₃ = 0.791, separate 2.260 km/s; the formula gives 1.831 km/s combined (the slide says 1.821).',
          'Γεωστατική = γεωσύγχρονη, κυκλική (e = 0) και στο ισημερινό επίπεδο (i = 0). Η GTO έχει κλίση ίση με το γεωγραφικό πλάτος της βάσης (Kourou 5°, Kennedy 28,5°). Παράδειγμα μαθήματος (Kennedy, v_apogee = 1,606 km/s): Δv₂ = 1,469, Δv₃ = 0,791, χωριστά 2,260 km/s· ο τύπος δίνει 1,831 km/s συνδυασμένα (η διαφάνεια γράφει 1,821).'),
      }
    },
    src: 'EPFL Space Mission Design and Operations, 3.3.1; Curtis, hfst. 6 (vlakverandering); Wertz & Larson, SMAD.',
  },
  {
    id: 'sso', title: 'Zonsynchrone baan en knoopregressie (J2)', cat: 'Baanmechanica', kw: 'sun synchronous sso nodal regression precession j2 raan inclination',
    blurb: 'Inclinatie voor 0,9856 °/dag uit de hoogte, of de knoopdrift voor een gegeven baan',
    loc: {
      en: { title: 'Sun-synchronous orbit and nodal regression (J2)', blurb: 'Inclination for 0.9856 °/day from the altitude, or the node drift of a given orbit',
        src: 'EPFL 3.3.2 (nodal regression and Sun-synchronous orbits); Vallado, Fundamentals of Astrodynamics; Curtis, ch. 4.',
        labels: { mode: 'Given', h: 'Altitude (circular: mean altitude)', e: 'Eccentricity e', i: 'Inclination i' },
        options: { mode: ['Altitude → Sun-synchronous inclination', 'Inclination → node drift'] } },
      el: { title: 'Ηλιοσύγχρονη τροχιά και οπισθοδρόμηση κόμβων (J2)', blurb: 'Κλίση για 0,9856 °/ημέρα από το ύψος, ή η μετατόπιση των κόμβων μιας τροχιάς',
        src: 'EPFL 3.3.2 (οπισθοδρόμηση κόμβων και ηλιοσύγχρονες τροχιές)· Vallado· Curtis, κεφ. 4.',
        labels: { mode: 'Δίνεται', h: 'Ύψος (κυκλική: μέσο ύψος)', e: 'Εκκεντρότητα e', i: 'Κλίση i' },
        options: { mode: ['Ύψος → ηλιοσύγχρονη κλίση', 'Κλίση → μετατόπιση κόμβων'] } },
    },
    inputs: [
      { k: 'mode', label: 'Gegeven', def: 0, wide: true, options: [{ value: 0, label: 'Hoogte → zonsynchrone inclinatie' }, { value: 1, label: 'Inclinatie → knoopdrift' }] },
      { k: 'h', label: 'Hoogte (cirkelbaan: gemiddelde hoogte)', unit: 'km', def: 800 },
      { k: 'e', label: 'Excentriciteit e', def: 0, step: 0.01 },
      { k: 'i', label: 'Inclinatie i', unit: '°', def: 98.6, step: 0.1, show: (v) => v.mode === 1 },
    ],
    compute: (v) => {
      const a = RE + v.h, err = pos([L('De halve lange as', 'The semi-major axis', 'Ο ημιάξονας'), a])
      if (err) return err
      if (!(v.e >= 0 && v.e < 1)) return { err: L('Excentriciteit moet in [0, 1) liggen.', 'The eccentricity must be in [0, 1).', 'Η εκκεντρότητα πρέπει να είναι στο [0, 1).') }
      if (a * (1 - v.e) <= RE) return { err: L('Het pericentrum ligt in de Aarde.', 'The perigee is inside the Earth.', 'Το περίγειο είναι μέσα στη Γη.') }
      const sso = K.ssoInclination(MU_EARTH, RE, J2, a, v.e)
      const iDeg = v.mode === 0 ? sso / DEG : v.i
      if (v.mode === 0 && !Number.isFinite(sso)) return { err: L(`Te hoog: boven a ≈ ${U(K.ssoMaxRadius(MU_EARTH, RE, J2), 'km')} bestaat geen zonsynchrone baan.`, `Too high: there is no Sun-synchronous orbit above a ≈ ${U(K.ssoMaxRadius(MU_EARTH, RE, J2), 'km')}.`, `Πολύ ψηλά: δεν υπάρχει ηλιοσύγχρονη τροχιά πάνω από a ≈ ${U(K.ssoMaxRadius(MU_EARTH, RE, J2), 'km')}.`) }
      if (v.mode === 1 && (v.i < 0 || v.i > 180)) return { err: L('i moet tussen 0° en 180° liggen.', 'i must be between 0° and 180°.', 'Το i πρέπει να είναι μεταξύ 0° και 180°.') }
      const rate = K.nodalRateEarthDeg(a, v.e, iDeg * DEG), course = K.nodalRateCourseDeg(a, v.e, iDeg * DEG)
      const west = rate < -1e-9, east = rate > 1e-9
      return {
        rows: [
          [L('Halve lange as a', 'Semi-major axis a', 'Ημιάξονας a'), U(a, 'km')],
          ...(v.mode === 0 ? [[L('Zonsynchrone inclinatie', 'Sun-synchronous inclination', 'Ηλιοσύγχρονη κλίση'), U(iDeg, '°', 4), true] as Row] : []),
          [L('Knoopdrift dΩ/dt', 'Node drift dΩ/dt', 'Μετατόπιση κόμβων dΩ/dt'), U(rate, L('°/dag', '°/day', '°/ημέρα'), 5), true],
          [L('Richting', 'Direction', 'Κατεύθυνση'), west ? L('naar het westen (regressie, i < 90°)', 'westward (regression, i < 90°)', 'προς τα δυτικά (οπισθοδρόμηση, i < 90°)') : east ? L('naar het oosten (progressie, i > 90°)', 'eastward (progression, i > 90°)', 'προς τα ανατολικά (πρόοδος, i > 90°)') : L('geen (i = 0° of 90°)', 'none (i = 0° or 90°)', 'καμία (i = 0° ή 90°)')],
          [L('Zon-synchrone eis', 'Sun-synchronous requirement', 'Απαίτηση ηλιοσύγχρονης'), `${U(K.SSO_RATE * 86400 / DEG, L('°/dag', '°/day', '°/ημέρα'), 5)} = 360° / ${K.TROPICAL_YEAR_D} d`],
          [L('Collegeformule −2,06474·10¹⁴·cos i / (a³·⁵(1−e²)²)', 'Course formula −2.06474·10¹⁴·cos i / (a³·⁵(1−e²)²)', 'Τύπος μαθήματος −2,06474·10¹⁴·cos i / (a³·⁵(1−e²)²)'), U(course, L('°/dag', '°/day', '°/ημέρα'), 5)],
          [L('Omlooptijd', 'Orbital period', 'Περίοδος'), dur(C.orbitPeriod(MU_EARTH, a))],
        ],
        tex: [`J_2=${N(J2, 6)},\\; R_\\oplus=${tu(RE, 'km')},\\; ${MU(MU_EARTH)}`,
          `\\dot\\Omega=-\\frac32\\,J_2\\left(\\frac{R_\\oplus}{a(1-e^2)}\\right)^2 n\\cos i,\\quad n=\\sqrt{\\mu/a^3}\\;\\Rightarrow\\;\\dot\\Omega=-2{,}06474\\!\\cdot\\!10^{14}\\frac{\\cos i}{a^{3{,}5}(1-e^2)^2}\\ [^\\circ\\!/\\mathrm{d}]`,
          `\\dot\\Omega=${N(rate, 5)}\\ ^\\circ/\\mathrm{d}`,
          `\\dot\\Omega_{SSO}=\\frac{360^\\circ}{365{,}2422\\ \\mathrm{d}}=0{,}9856\\ ^\\circ/\\mathrm{d}\\;\\Rightarrow\\;\\cos i=-\\frac{2\\,\\dot\\Omega_{SSO}\\,a^{7/2}(1-e^2)^2}{3\\,J_2R_\\oplus^2\\sqrt\\mu}\\;\\Rightarrow\\; i=${N(sso / DEG, 5)}^\\circ`],
        note: L('Aardafplatting (1:298, 21,4 km) laat de knopenlijn driften: westwaarts voor prograde banen (i < 90°), oostwaarts voor retrograde (i > 90°), niets bij i = 0° of 90°. Een zonsynchrone baan moet 0,9856°/dag naar het oosten draaien, dus i ≈ 97–105° voor 400–2400 km. Alleen de seculiere J2-term; hoogte 800 km geeft 98,6°.',
          'The Earth’s flattening (1:298, 21.4 km) makes the line of nodes drift: westward for prograde orbits (i < 90°), eastward for retrograde ones (i > 90°), nothing at i = 0° or 90°. A Sun-synchronous orbit must turn 0.9856°/day eastward, so i ≈ 97–105° for 400–2400 km. Secular J2 term only; 800 km gives 98.6°.',
          'Η επιπλάτυνση της Γης (1:298, 21,4 km) κάνει τη γραμμή των κόμβων να μετατοπίζεται: προς τα δυτικά για πρόγραδες τροχιές (i < 90°), προς τα ανατολικά για ανάδρομες (i > 90°), τίποτα για i = 0° ή 90°. Μια ηλιοσύγχρονη τροχιά πρέπει να στρέφεται 0,9856°/ημέρα προς τα ανατολικά, άρα i ≈ 97–105° για 400–2400 km. Μόνο ο εκκοσμικός όρος J2· στα 800 km δίνει 98,6°.'),
      }
    },
    src: 'EPFL Space Mission Design and Operations, 3.3.2; Vallado, Fundamentals of Astrodynamics; Wertz & Larson, SMAD.',
  },
  {
    id: 'phasing', title: 'Rendezvous: inhaalsnelheid en fasebaan', cat: 'Baanmechanica', kw: 'rendezvous phasing catch up rate chase iss chaser target phase angle',
    blurb: 'Δx = 3πΔr per baan, en de baan om een fasehoek in n omlopen te dichten',
    loc: {
      en: { title: 'Rendezvous: catch-up rate and phasing orbit', blurb: 'Δx = 3πΔr per orbit, and the orbit that closes a phase angle in n revolutions',
        src: 'EPFL 3.4.1 (catch-up rate) and 3.4.3 (phasing); Curtis, ch. 6 (phasing manoeuvres).',
        labels: { mode: 'Calculate', c: 'Central body', h: 'Altitude of the target orbit', dr: 'Height difference Δr (chaser lower = +)', phase: 'Phase angle (target ahead = +)', n: 'Revolutions n of the phasing orbit' },
        options: { mode: ['Catch-up rate (nearby orbits)', 'Phasing orbit'] } },
      el: { title: 'Rendezvous: ρυθμός προσέγγισης και τροχιά φάσης', blurb: 'Δx = 3πΔr ανά τροχιά και η τροχιά που κλείνει μια γωνία φάσης σε n περιστροφές',
        src: 'EPFL 3.4.1 (ρυθμός προσέγγισης) και 3.4.3 (φάση)· Curtis, κεφ. 6.',
        labels: { mode: 'Υπολογισμός', c: 'Κεντρικό σώμα', h: 'Ύψος της τροχιάς του στόχου', dr: 'Διαφορά ύψους Δr (κυνηγός χαμηλότερα = +)', phase: 'Γωνία φάσης (στόχος μπροστά = +)', n: 'Περιστροφές n της τροχιάς φάσης' },
        options: { mode: ['Ρυθμός προσέγγισης (κοντινές τροχιές)', 'Τροχιά φάσης'] } },
    },
    inputs: [
      { k: 'mode', label: 'Bereken', def: 0, wide: true, options: [{ value: 0, label: 'Inhaalsnelheid (nabije banen)' }, { value: 1, label: 'Fasebaan' }] },
      { k: 'c', label: 'Centrale massa', def: EARTH, options: cOpts.slice(1) },
      { k: 'h', label: 'Hoogte van de doelbaan', unit: 'km', def: 400 },
      { k: 'dr', label: 'Hoogteverschil Δr (jager lager = +)', unit: 'km', def: 10, step: 1, show: (v) => v.mode === 0 },
      { k: 'phase', label: 'Fasehoek (doel voor = +)', unit: '°', def: 30, step: 5, show: (v) => v.mode === 1 },
      { k: 'n', label: 'Omlopen n van de fasebaan', def: 2, show: (v) => v.mode === 1 },
    ],
    compute: (v) => {
      const c = CENTRALS[v.c], r = c.radius + v.h
      const err = pos([L('De straal van de doelbaan', 'The target orbit radius', 'Η ακτίνα της τροχιάς στόχου'), r])
      if (err) return err
      const T = C.orbitPeriod(c.mu, r)
      if (v.mode === 0) {
        if (!Number.isFinite(v.dr) || Math.abs(v.dr) >= r * 0.5) return { err: L('Δr moet klein zijn t.o.v. r (|Δr| ≪ r).', 'Δr must be small compared to r (|Δr| ≪ r).', 'Το Δr πρέπει να είναι μικρό σε σχέση με το r (|Δr| ≪ r).') }
        if (r - v.dr <= c.radius) return { err: L('De baan van de jager ligt in het lichaam.', 'The chaser orbit is inside the body.', 'Η τροχιά του κυνηγού είναι μέσα στο σώμα.') }
        const dx = K.catchUpPerOrbit(v.dr), a1 = r - v.dr, exact = K.catchUpExact(c.mu, a1, r) * r, T1 = C.orbitPeriod(c.mu, a1)
        return {
          rows: [[L('Periode doel T', 'Target period T', 'Περίοδος στόχου T'), dur(T)], [L('Periode jager', 'Chaser period', 'Περίοδος κυνηγού'), dur(T1)],
            [L('Winst per baan Δx ≈ 3πΔr', 'Gain per orbit Δx ≈ 3πΔr', 'Κέρδος ανά τροχιά Δx ≈ 3πΔr'), U(dx, 'km'), true], [L('Exact (2π(1−T₁/T₂)·r)', 'Exact (2π(1−T₁/T₂)·r)', 'Ακριβές (2π(1−T₁/T₂)·r)'), U(exact, 'km')],
            [L('Verhouding Δx/Δr', 'Ratio Δx/Δr', 'Λόγος Δx/Δr'), U(dx / v.dr, '', 4)], [L('Hoekwinst per baan', 'Angle gained per orbit', 'Κέρδος γωνίας ανά τροχιά'), U(dx / r / DEG, '°', 4)],
            [L('Aantal banen om 30° te winnen', 'Orbits needed to gain 30°', 'Τροχιές για κέρδος 30°'), U(30 / (dx / r / DEG), '', 3)]],
          tex: [`T=2\\pi\\frac{r^{3/2}}{\\sqrt\\mu}\\;\\Rightarrow\\;\\frac{dT}{dr}=3\\pi\\frac{1}{V_{circ}}`,
            `\\Delta x=V_{circ}\\,\\Delta T=3\\pi\\,\\Delta r=3\\pi\\cdot${N(v.dr)}=${tu(dx, 'km')}\\quad(\\Delta r\\ll r)`,
            `\\text{ellips: }\\Delta x\\simeq3\\pi(r-a)`],
          note: L('Twee objecten op dezelfde lokale verticaal: na één baan is het lagere object ~10× het hoogteverschil vooruit gekomen. Een Δv van 1 ft/s (0,3048 m/s) geeft ≈ 0,5 n.mi hoogte aan de overkant van de baan.',
            'Two objects on the same local vertical: after one full orbit the lower one has moved ahead by about 10× the altitude difference. A Δv of 1 ft/s (0.3048 m/s) gives ≈ 0.5 n.mi altitude on the opposite side of the orbit.',
            'Δύο αντικείμενα στην ίδια τοπική κατακόρυφο: μετά από μία τροχιά το χαμηλότερο έχει προχωρήσει ≈ 10× τη διαφορά ύψους. Δv 1 ft/s (0,3048 m/s) δίνει ≈ 0,5 n.mi ύψος στην αντίθετη πλευρά.'),
        }
      }
      const n = Math.round(v.n)
      if (!(n >= 1 && n <= 100)) return { err: L('n moet tussen 1 en 100 liggen.', 'n must be between 1 and 100.', 'Το n πρέπει να είναι μεταξύ 1 και 100.') }
      if (!Number.isFinite(v.phase) || v.phase === 0 || Math.abs(v.phase) >= 360 * n) return { err: L('De fasehoek moet ≠ 0 zijn en kleiner dan 360°·n.', 'The phase angle must be non-zero and smaller than 360°·n.', 'Η γωνία φάσης πρέπει να είναι ≠ 0 και μικρότερη από 360°·n.') }
      const p = K.phasing(c.mu, r, v.phase * DEG, n)
      if (p.rOther <= c.radius) return { err: L('Het andere apsis van de fasebaan ligt in het lichaam: neem meer omlopen n.', 'The other apsis of the phasing orbit is inside the body: use more revolutions n.', 'Το άλλο άψιδο της τροχιάς φάσης είναι μέσα στο σώμα: χρησιμοποίησε περισσότερες περιστροφές n.') }
      return {
        rows: [[L('Periode doelbaan T', 'Target period T', 'Περίοδος στόχου T'), dur(p.T)], [L('Periode fasebaan T_p', 'Phasing period T_p', 'Περίοδος φάσης T_p'), dur(p.Tp), true],
          [L('Halve lange as fasebaan', 'Phasing semi-major axis', 'Ημιάξονας τροχιάς φάσης'), U(p.a, 'km')], [L('Andere apsis (hoogte)', 'Other apsis (altitude)', 'Άλλο άψιδο (ύψος)'), U(p.rOther - c.radius, 'km')],
          [L('Richting eerste burn', 'First burn direction', 'Κατεύθυνση πρώτης καύσης'), p.shorter ? L('retrograde (lagere, snellere baan)', 'retrograde (lower, faster orbit)', 'ανάδρομη (χαμηλότερη, ταχύτερη τροχιά)') : L('prograde (hogere, tragere baan)', 'prograde (higher, slower orbit)', 'πρόγραδη (υψηλότερη, πιο αργή τροχιά)')],
          [L('Δv per burn', 'Δv per burn', 'Δv ανά καύση'), U(p.dv * 1000, 'm/s'), true], [L('Totaal Δv (2 burns)', 'Total Δv (2 burns)', 'Συνολικό Δv (2 καύσεις)'), U(p.total * 1000, 'm/s'), true],
          [L('Duur n·T_p', 'Duration n·T_p', 'Διάρκεια n·T_p'), dur(p.time)]],
        tex: [`\\varphi=${N(v.phase)}^\\circ,\\; n=${n},\\; T=2\\pi\\sqrt{r^3/\\mu}=${durTex(p.T)}`,
          `360^\\circ n=\\varphi+360^\\circ n\\frac{T_p}{T}\\;\\Rightarrow\\;T_p=T\\left(1-\\frac{\\varphi}{360^\\circ n}\\right)=${durTex(p.Tp)}`,
          `a_p=\\left(\\frac{\\mu T_p^2}{4\\pi^2}\\right)^{1/3}=${tu(p.a, 'km')},\\quad \\Delta v=\\left|\\sqrt{\\mu\\left(\\frac2r-\\frac1{a_p}\\right)}-\\sqrt{\\frac\\mu r}\\right|=${tu(p.dv, KMS)}`],
        note: L('Doel voor (φ > 0): ga naar een lagere, snellere fasebaan. Doel achter (φ < 0): ga hoger en wacht. Na n·T_p brandt dezelfde Δv de baan weer rond. Alleen coplanair; de hoekafstand wordt vanuit het middelpunt gemeten.',
          'Target ahead (φ > 0): enter a lower, faster phasing orbit. Target behind (φ < 0): go higher and wait. After n·T_p the same Δv circularises again. Coplanar only; the angle is measured from the centre of the body.',
          'Στόχος μπροστά (φ > 0): πήγαινε σε χαμηλότερη, ταχύτερη τροχιά φάσης. Στόχος πίσω (φ < 0): πήγαινε ψηλότερα και περίμενε. Μετά από n·T_p το ίδιο Δv κυκλοποιεί ξανά. Μόνο συνεπίπεδα· η γωνία μετριέται από το κέντρο.'),
      }
    },
    src: 'EPFL Space Mission Design and Operations, 3.4.1 en 3.4.3; Curtis, hfst. 6 (phasing manoeuvres).',
  },
  {
    id: 'arrival', title: 'Hyperbool bij aankomst: d∞, r_p en baaninsertie', cat: 'Interplanetair', kw: 'arrival hyperbola impact parameter b-plane insertion capture periapsis deflection beta',
    blurb: 'a = μ/v∞², e, β, afbuiging, inslagparameter d∞ en Δv om in een ellips te komen',
    loc: {
      en: { title: 'Arrival hyperbola: d∞, r_p and orbit insertion', blurb: 'a = μ/v∞², e, β, deflection, impact parameter d∞ and the Δv to enter an ellipse',
        src: 'EPFL 4.2.2–4.2.5 (departure, arrival, orbit insertion); Curtis, ch. 8 (planetary rendezvous).',
        labels: { c: 'Planet / body', vinf: 'v∞ at the sphere of influence', give: 'Periapsis given as', hp: 'Periapsis altitude', d: 'Impact parameter d∞', ai: 'Target orbit a_i (0 = circle at r_p)' },
        options: { give: ['Altitude r_p − R', 'Impact parameter d∞'] } },
      el: { title: 'Υπερβολή άφιξης: d∞, r_p και εισαγωγή σε τροχιά', blurb: 'a = μ/v∞², e, β, εκτροπή, παράμετρος πρόσκρουσης d∞ και Δv για είσοδο σε έλλειψη',
        src: 'EPFL 4.2.2–4.2.5· Curtis, κεφ. 8.',
        labels: { c: 'Πλανήτης / σώμα', vinf: 'v∞ στη σφαίρα επιρροής', give: 'Το περίαστρο δίνεται ως', hp: 'Ύψος περιάστρου', d: 'Παράμετρος πρόσκρουσης d∞', ai: 'Τροχιά στόχος a_i (0 = κύκλος στο r_p)' },
        options: { give: ['Ύψος r_p − R', 'Παράμετρος πρόσκρουσης d∞'] } },
    },
    inputs: [
      { k: 'c', label: 'Planeet / lichaam', def: 5, options: cOpts },
      { k: 'vinf', label: 'v∞ aan de invloedssfeer', unit: 'km/s', def: 2.65, step: 0.05 },
      { k: 'give', label: 'Periapsis gegeven als', def: 0, wide: true, options: [{ value: 0, label: 'Hoogte r_p − R' }, { value: 1, label: 'Inslagparameter d∞' }] },
      { k: 'hp', label: 'Periapsishoogte', unit: 'km', def: 300, show: (v) => v.give === 0 },
      { k: 'd', label: 'Inslagparameter d∞', unit: 'km', def: 5000, show: (v) => v.give === 1 },
      { k: 'ai', label: 'Doelbaan a_i (0 = cirkel op r_p)', unit: 'km', def: 0, wide: true },
    ],
    onChange: (k, v) => { if (k === 'c') return { hp: Math.round(0.1 * CENTRALS[v.c].radius), d: Math.round(CENTRALS[v.c].radius * 1.5) } },
    compute: (v) => {
      const c = CENTRALS[v.c]
      const err = pos(['v∞', v.vinf])
      if (err) return err
      let rp: number
      if (v.give === 0) { rp = c.radius + v.hp; const e2 = pos([L('De periapsisstraal', 'The periapsis radius', 'Η ακτίνα περιάστρου'), rp]); if (e2) return e2 } else {
        const e2 = pos(['d∞', v.d]); if (e2) return e2
        rp = K.periapsisFromImpact(c.mu, v.vinf, v.d)
      }
      const h = K.hyperbola(c.mu, v.vinf, rp)
      const ai = v.ai > 0 ? v.ai : rp
      if (v.ai > 0 && v.ai < rp / 2 * (1 + 1e-9)) return { err: L('a_i moet minstens r_p/2 zijn (het pericentrum van de baan is r_p).', 'a_i must be at least r_p/2 (the orbit’s periapsis is r_p).', 'Το a_i πρέπει να είναι τουλάχιστον r_p/2.') }
      const dv = K.insertionDv(c.mu, v.vinf, rp, ai), vpEll = Math.sqrt(2 * c.mu / rp - c.mu / ai), eEll = 1 - rp / ai
      const crash = rp <= c.radius
      return {
        rows: [
          L('Hyperbool', 'Hyperbola', 'Υπερβολή'),
          [L('Halve lange as a = μ/v∞²', 'Semi-major axis a = μ/v∞²', 'Ημιάξονας a = μ/v∞²'), U(h.a, 'km')], [L('Periapsisstraal r_p', 'Periapsis radius r_p', 'Ακτίνα περιάστρου r_p'), `${U(rp, 'km')} = ${U(rp / c.radius, '×R', 4)}`, true],
          [L('Excentriciteit e = (a + r_p)/a', 'Eccentricity e = (a + r_p)/a', 'Εκκεντρότητα e = (a + r_p)/a'), U(h.e, '', 5)], [L('Inslagparameter d∞ (= b)', 'Impact parameter d∞ (= b)', 'Παράμετρος πρόσκρουσης d∞ (= b)'), U(h.dInf, 'km'), v.give === 0],
          [L('Hoek β (cos β = 1/e)', 'Angle β (cos β = 1/e)', 'Γωνία β (cos β = 1/e)'), U(h.beta / DEG, '°', 4)], [L('Afbuiging δ = 180° − 2β', 'Deflection δ = 180° − 2β', 'Εκτροπή δ = 180° − 2β'), U(h.delta / DEG, '°', 4), true],
          [L('Ware anomalie asymptoot θ∞', 'Asymptote true anomaly θ∞', 'Αληθής ανωμαλία ασύμπτωτης θ∞'), U(h.thetaInf / DEG, '°', 4)], [L('Snelheid in periapsis v_p', 'Periapsis speed v_p', 'Ταχύτητα περιάστρου v_p'), U(h.vp, KMS)],
          L('Insertie in een ellips', 'Insertion into an ellipse', 'Εισαγωγή σε έλλειψη'),
          [L('Ellips: a_i, e', 'Ellipse: a_i, e', 'Έλλειψη: a_i, e'), `${U(ai, 'km')}, ${U(eEll, '', 4)}`], [L('Snelheid ellips in periapsis', 'Ellipse speed at periapsis', 'Ταχύτητα έλλειψης στο περίαστρο'), U(vpEll, KMS)],
          [L('Remburn Δv', 'Braking burn Δv', 'Καύση πέδησης Δv'), U(dv, KMS), true],
        ],
        tex: [MU(c.mu) + `,\\; v_\\infty=${tu(v.vinf, KMS)}`,
          `a=\\frac{\\mu}{v_\\infty^2}=${tu(h.a, 'km')},\\quad e=\\frac{a+r_p}{a}=\\frac{c}{a}=${N(h.e, 5)},\\quad c=ae`,
          `r_p=-\\frac{\\mu}{v_\\infty^2}+\\sqrt{\\frac{\\mu^2}{v_\\infty^4}+d_\\infty^2}=${tu(rp, 'km')},\\quad d_\\infty=b=a\\sqrt{e^2-1}`,
          `\\cos\\beta=\\frac{a}{a+r_p}=\\frac1e,\\quad \\theta_\\infty=\\arccos\\left(-\\frac1e\\right)=${N(h.thetaInf / DEG, 4)}^\\circ,\\quad \\delta=180^\\circ-2\\beta=${N(h.delta / DEG, 4)}^\\circ`,
          `\\Delta v=\\sqrt{v_\\infty^2+\\frac{2\\mu}{r_p}}-\\sqrt{\\frac{2\\mu}{r_p}-\\frac{\\mu}{a_i}}=${tu(dv, KMS)}`],
        note: crash ? L('Let op: r_p ligt onder het oppervlak: de baan eindigt op het lichaam (inslag of landing).', 'Note: r_p is below the surface: the trajectory ends on the body (impact or landing).', 'Προσοχή: το r_p είναι κάτω από την επιφάνεια: η τροχιά καταλήγει στο σώμα.')
          : L('De hoek tussen de asymptoot en de lijn naar het planeetcentrum is β; de totale afbuiging is δ = 180° − 2β (de sheet noemt “deviatie = 90° − β” de halve afbuiging). Het Δv-minimum voor een gegeven ellips ligt in het periapsis (Oberth).', 'The angle between the asymptote and the line to the planet centre is β; the total deflection is δ = 180° − 2β (the course slide calls “deviation = 90° − β” the half deflection). The minimum Δv for a given ellipse is at the periapsis (Oberth).', 'Η γωνία ασύμπτωτης και ευθείας προς το κέντρο είναι β· η συνολική εκτροπή είναι δ = 180° − 2β (η διαφάνεια ονομάζει «απόκλιση = 90° − β» τη μισή εκτροπή).'),
      }
    },
    src: 'EPFL Space Mission Design and Operations, 4.2.2–4.2.5; Curtis, hfst. 8 (planetary rendezvous).',
  },
  {
    id: 'slingshot', title: 'Zwaartekrachtsslinger: snelheid vóór en na (V₂ → V₅)', cat: 'Interplanetair', kw: 'gravity assist slingshot flyby heliocentric velocity v2 v5 vp planet speed gain',
    blurb: 'Draai v∞ over δ en tel de planeetsnelheid op: winst van de zonsnelheid',
    loc: {
      en: { title: 'Gravity assist: speed before and after (V₂ → V₅)', blurb: 'Rotate v∞ by δ and add the planet’s velocity: the gain in heliocentric speed',
        src: 'EPFL 4.3.2 (slingshot manoeuvre); Curtis, ch. 8 (planetary flyby); Vallado.',
        labels: { p: 'Gravity-assist planet', V2: 'V₂: heliocentric speed of the craft on entering', g: 'Angle γ between V₂ and V_P', h: 'Flyby altitude (periapsis)' } },
      el: { title: 'Βαρυτική υποβοήθηση: ταχύτητα πριν και μετά (V₂ → V₅)', blurb: 'Στρέψε το v∞ κατά δ και πρόσθεσε την ταχύτητα του πλανήτη: κέρδος ηλιοκεντρικής ταχύτητας',
        src: 'EPFL 4.3.2· Curtis, κεφ. 8· Vallado.',
        labels: { p: 'Πλανήτης υποβοήθησης', V2: 'V₂: ηλιοκεντρική ταχύτητα κατά την είσοδο', g: 'Γωνία γ μεταξύ V₂ και V_P', h: 'Ύψος διέλευσης (περίαστρο)' } },
    },
    inputs: [
      { k: 'p', label: 'Planeet voor de slinger', def: PLANETS.findIndex((p) => p.id === 'jupiter'), options: pOpts, wide: true },
      { k: 'V2', label: 'V₂: zonsnelheid van het ruimtevaartuig bij binnenkomst', unit: 'km/s', def: 9, step: 0.1, wide: true },
      { k: 'g', label: 'Hoek γ tussen V₂ en V_P', unit: '°', def: 20, step: 1 },
      { k: 'h', label: 'Flyby-hoogte (periapsis)', unit: 'km', def: 200000 },
    ],
    onChange: (k, v) => { if (k === 'p') { const p = PLANETS[v.p]; return { h: Math.round(p.radius * 2), V2: +(Math.sqrt(MU_SUN / p.a) * 0.7).toFixed(2) } } },
    compute: (v) => {
      const P = PLANETS[v.p], VP = C.vCirc(MU_SUN, P.a), rp = P.radius + v.h
      const err = pos(['V₂', v.V2]) ?? pos([L('De periapsisstraal', 'The periapsis radius', 'Η ακτίνα περιάστρου'), rp])
      if (err) return err
      if (v.g < 0 || v.g > 180) return { err: L('γ moet tussen 0° en 180° liggen.', 'γ must be between 0° and 180°.', 'Το γ πρέπει να είναι μεταξύ 0° και 180°.') }
      const g = v.g * DEG, v3 = Math.sqrt(v.V2 ** 2 + VP ** 2 - 2 * v.V2 * VP * Math.cos(g))
      if (v3 < 1e-6) return { err: L('V₂ is gelijk aan V_P: v∞ = 0, geen slinger.', 'V₂ equals V_P: v∞ = 0, no slingshot.', 'Το V₂ ισούται με το V_P: v∞ = 0.') }
      const f = C.flyby(v3, rp, P.mu), A = K.slingshot(VP, v.V2, g, f.delta, 1), B = K.slingshot(VP, v.V2, g, f.delta, -1)
      const up = A.V5 >= B.V5 ? A : B, dn = A.V5 >= B.V5 ? B : A
      const crash = rp <= P.radius
      return {
        rows: [
          L('Invoer', 'Input', 'Είσοδος'),
          [L(`Planeetsnelheid V_P (cirkelbaan, ${P.name})`, `Planet speed V_P (circular, ${P.name})`, `Ταχύτητα πλανήτη V_P (κυκλική, ${P.name})`), U(VP, KMS)],
          [L('v∞ = |v₃| = |V₂ − V_P|', 'v∞ = |v₃| = |V₂ − V_P|', 'v∞ = |v₃| = |V₂ − V_P|'), U(v3, KMS), true],
          [L('Afbuiging δ = 2·asin(1/e)', 'Deflection δ = 2·asin(1/e)', 'Εκτροπή δ = 2·asin(1/e)'), `${U(f.delta / DEG, '°', 4)} (e = ${U(f.e, '', 4)})`],
          L('Achter de planeet langs (grotere V₅)', 'Passing behind the planet (larger V₅)', 'Πίσω από τον πλανήτη (μεγαλύτερο V₅)'),
          [L('V₅ (zonsnelheid na de slinger)', 'V₅ (heliocentric speed after)', 'V₅ (ηλιοκεντρική ταχύτητα μετά)'), U(up.V5, KMS), true], [L('Winst V₅ − V₂', 'Gain V₅ − V₂', 'Κέρδος V₅ − V₂'), U(up.gain, KMS, 3), true],
          L('Voor de planeet langs (kleinere V₅)', 'Passing in front of the planet (smaller V₅)', 'Μπροστά από τον πλανήτη (μικρότερο V₅)'),
          [L('V₅', 'V₅', 'V₅'), U(dn.V5, KMS)], [L('Verandering V₅ − V₂', 'Change V₅ − V₂', 'Μεταβολή V₅ − V₂'), U(dn.gain, KMS, 3)],
          [L('Maximum mogelijke winst (δ = 180°)', 'Largest possible gain (δ = 180°)', 'Μέγιστο δυνατό κέρδος (δ = 180°)'), U(2 * v3, KMS)],
        ],
        tex: [`${MU(P.mu)},\\; V_P=\\sqrt{\\mu_\\odot/a}=${tu(VP, KMS)}`,
          `\\vec v_3=\\vec V_2-\\vec V_P,\\quad |\\vec v_3|=|\\vec v_4|=v_\\infty=${tu(v3, KMS)}`,
          `\\cos\\frac\\delta2=\\cos\\beta=\\frac{a}{a+r_p}=\\frac1e,\\quad a=\\frac{\\mu}{v_\\infty^2}\\Rightarrow\\delta=${N(f.delta / DEG, 4)}^\\circ`,
          `\\vec V_5=\\vec V_P+\\vec v_4,\\quad |\\vec V_P+\\vec v_4|>|\\vec V_P+\\vec v_3|\\ \\text{(speed-up)}`,
          `V_5=${tu(up.V5, KMS)}\\ \\text{(achter)},\\quad ${tu(dn.V5, KMS)}\\ \\text{(voor)}`],
        note: crash ? L('Let op: het periapsis ligt in de planeet: kies een hogere flyby.', 'Note: the periapsis is inside the planet: choose a higher flyby.', 'Προσοχή: το περίαστρο είναι μέσα στον πλανήτη.')
          : L('Alleen in het vlak van de planeetbaan, planeet op een cirkelbaan, en een vlakke 2D-driehoek van snelheden. In de planeetframe blijft |v∞| gelijk (v₃ = v₄ in grootte); in het zonframe verandert V door de draaiing. Voor 3D-routes met echte efemeriden gebruik je Missie → Routes.', 'In the plane of the planet’s orbit only, planet on a circular orbit, flat 2-D velocity triangle. In the planet frame |v∞| is unchanged (|v₃| = |v₄|); in the Sun frame V changes through the rotation. For 3-D routes with real ephemerides use Mission → Routes.', 'Μόνο στο επίπεδο της τροχιάς του πλανήτη, κυκλική τροχιά, επίπεδο τρίγωνο ταχυτήτων. Στο σύστημα του πλανήτη το |v∞| μένει ίδιο· στο ηλιακό σύστημα το V αλλάζει λόγω της στροφής.'),
      }
    },
    src: 'EPFL Space Mission Design and Operations, 4.3.2; Curtis, hfst. 8 (planetary flyby); Vallado, Fundamentals of Astrodynamics, hfst. 12.',
  },
]
