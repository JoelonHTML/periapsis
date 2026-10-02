import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { AU, MASS_RATIO_EM, MASS_RATIO_SE, MU_EARTH, RE, collinearGammas, hohmann } from '@/lib/astro'
import { store } from '@/lib/store'
import { Section, Tex, f } from './bits'

const D_EM = 384400
const km = (x: number) => Math.round(x).toLocaleString('nl-NL')

export function LagrangePanel() {
  const em = collinearGammas(MASS_RATIO_EM), se = collinearGammas(MASS_RATIO_SE)
  const rPark = RE + 200
  const reach = (r: number) => hohmann(rPark, r, MU_EARTH).dv1
  const hill = Math.cbrt(MASS_RATIO_EM / 3)
  const rows: [string, number, number | null, string][] = [
    ['L1', D_EM * (1 - em.g1), D_EM * em.g1, 'tussen Aarde en Maan'],
    ['L2', D_EM * (1 + em.g2), D_EM * em.g2, 'achter de Maan (Gateway-halo)'],
    ['L3', D_EM * em.g3, null, 'tegenover de Maan'],
    ['L4', D_EM, D_EM, '60° vóór de Maan'],
    ['L5', D_EM, D_EM, '60° achter de Maan'],
  ]
  const seRows: [string, number, string][] = [
    ['L1', AU * se.g1, 'richting Zon (SOHO, DSCOVR)'],
    ['L2', AU * se.g2, 'van de Zon af (JWST, Gaia, Euclid)'],
    ['L3', AU * (1 + se.g3), 'achter de Zon'],
    ['L4/L5', AU, '60° vóór/achter de Aarde'],
  ]
  return (
    <div className="grid gap-4">
      <Section title="Aarde–Maan">
        <Table className="text-xs">
          <TableHeader><TableRow>
            <TableHead className="h-7 px-1">Punt</TableHead><TableHead className="h-7 px-1 text-right">Aarde (km)</TableHead>
            <TableHead className="h-7 px-1 text-right">Maan (km)</TableHead><TableHead className="h-7 px-1 text-right">Δv* (km/s)</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {rows.map(([n, d, m, note]) => (
              <TableRow key={n} title={note}>
                <TableCell className="px-1 font-medium">{n}<div className="max-w-[110px] text-[10px] font-normal leading-tight text-muted-foreground">{note}</div></TableCell>
                <TableCell className="px-1 text-right tabular-nums">{km(d)}</TableCell>
                <TableCell className="px-1 text-right tabular-nums">{m === null ? '—' : km(m)}</TableCell>
                <TableCell className="px-1 text-right tabular-nums">{f(reach(d), 2)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <p className="text-[10.5px] text-muted-foreground">
          Exact opgelost (vijfdegraads vergelijking) i.p.v. de Hill-benadering (±{km(D_EM * hill)} km, die L1 en L2 symmetrisch en dus fout zet).
          L1/L2 liggen ruim 50× de aardstraal van de Aarde — nooit ín de bol.
        </p>
        <Button variant="outline" size="sm" onClick={() => store.set({ view: 'earthmoon', showLagrange: true })}>Toon in Aarde–Maan weergave</Button>
      </Section>
      <Section title="Zon–Aarde">
        <Table className="text-xs">
          <TableHeader><TableRow>
            <TableHead className="h-7 px-1">Punt</TableHead><TableHead className="h-7 px-1 text-right">Afstand (km)</TableHead><TableHead className="h-7 px-1 text-right">Δv* (km/s)</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {seRows.map(([n, d, note], i) => (
              <TableRow key={n}>
                <TableCell className="px-1 font-medium">{n}<div className="max-w-[150px] text-[10px] font-normal leading-tight text-muted-foreground">{note}</div></TableCell>
                <TableCell className="px-1 text-right tabular-nums">{km(d)}<div className="text-[10px] text-muted-foreground">{i < 3 ? 'van de Aarde' : 'van Zon én Aarde'}</div></TableCell>
                <TableCell className="px-1 text-right tabular-nums">{i < 2 ? f(reach(d), 2) : '—'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <Button variant="outline" size="sm" onClick={() => store.set({ view: 'solar', showLagrange: true, follow: 'earth' })}>Toon in zonnestelsel (volg Aarde)</Button>
      </Section>
      <Section title="Formules">
        <Tex block tex={`\\gamma^5 \\mp (3-\\mu)\\gamma^4 + (3-2\\mu)\\gamma^3 - \\mu\\gamma^2 \\pm 2\\mu\\gamma - \\mu = 0`} />
        <Tex block tex={`\\mu_{AM} = \\frac{m_{Maan}}{m_\\oplus + m_{Maan}} = ${MASS_RATIO_EM.toFixed(5)} \\Rightarrow \\gamma_1 = ${em.g1.toFixed(5)},\\ \\gamma_2 = ${em.g2.toFixed(5)}`} />
        <p className="text-[10.5px] text-muted-foreground">* Δv vanaf LEO = eerste Hohmann-burn vanuit 200 km om het apogeum op die afstand te brengen; het kleine inschietmanoeuvre in een halo-baan (typisch 0,05–0,7 km/s) is niet meegeteld.</p>
      </Section>
    </div>
  )
}

const FORMULAS: { title: string; tex: string; text: string; src: string }[] = [
  { title: 'Kepler-vergelijking (planeetposities)', tex: 'M = E - e\\sin E,\\quad M = L - \\varpi', text: 'Positie van elke planeet op tijd t uit de JPL-baanelementen (a, e, i, L, ϖ, Ω + lineaire drift per eeuw), opgelost met Newton-iteratie.', src: 'Standish, JPL "Approximate Positions of the Planets" (1800–2050)' },
  { title: 'Vis-viva', tex: 'v^2 = \\mu\\left(\\frac{2}{r} - \\frac{1}{a}\\right)', text: 'Snelheid op elk punt van een Kepler-baan; basis van alle Hohmann- en capture-berekeningen.', src: 'Klassieke mechanica' },
  { title: 'Hohmann-transfer', tex: '\\Delta v = \\left|\\sqrt{\\mu\\left(\\tfrac{2}{r_1} - \\tfrac{2}{r_1+r_2}\\right)} - \\sqrt{\\tfrac{\\mu}{r_1}}\\right| + \\left|\\sqrt{\\tfrac{\\mu}{r_2}} - \\sqrt{\\mu\\left(\\tfrac{2}{r_2} - \\tfrac{2}{r_1+r_2}\\right)}\\right|,\\ \\ t = \\pi\\sqrt{\\tfrac{a^3}{\\mu}}', text: 'Aardbanen (LEO → GEO/HEO) en afstandsschattingen naar Lagrangepunten.', src: 'Curtis, Orbital Mechanics for Engineering Students, §6.2' },
  { title: 'Lambert-probleem (interplanetaire legs)', tex: '\\sqrt{\\mu}\\,\\Delta t = \\left(\\frac{y(z)}{C(z)}\\right)^{3/2} S(z) + A\\sqrt{y(z)},\\quad y = r_1 + r_2 + A\\frac{zS - 1}{\\sqrt{C}}', text: 'Vindt de baan die in precies Δt van planeet A naar planeet B loopt. Universele variabelen met Stumpff-functies C(z), S(z); Newton met bisectie-vangnet. Hierdoor is de route een echte gekromde Kepler-boog, geen rechte lijn.', src: 'Curtis alg. 5.2' },
  { title: 'Vertrek uit parkeerbaan (patched conic)', tex: '\\Delta v = \\sqrt{v_\\infty^2 + \\frac{2\\mu_\\oplus}{r_p}} - \\sqrt{\\frac{\\mu_\\oplus}{r_p}},\\quad C_3 = v_\\infty^2', text: 'v∞ = verschil tussen de Lambert-vertreksnelheid en de snelheid van de Aarde rond de Zon.', src: 'Curtis §8.4' },
  { title: 'Aankomst / capture', tex: '\\Delta v = \\sqrt{v_\\infty^2 + \\frac{2\\mu}{r_p}} - \\sqrt{\\frac{\\mu(1+e)}{r_p}}', text: 'e = 0 voor een cirkelbaan, e < 1 voor een elliptische vangbaan (goedkoper), 0 bij een flyby.', src: 'Curtis §8.6' },
  { title: 'Gravity assist (gemotoriseerde flyby)', tex: '\\delta_{max} = 2\\arcsin\\frac{1}{1 + r_{p,min} v_\\infty^2/\\mu},\\quad \\Delta v = \\begin{cases} \\big||v_{\\infty,uit}| - |v_{\\infty,in}|\\big| & \\delta \\le \\delta_{max} \\\\ \\sqrt{v_{uit}^2 + v_{in}^2 - 2v_{uit}v_{in}\\cos(\\delta - \\delta_{max})} & \\delta > \\delta_{max}\\end{cases}', text: 'De planeet draait de snelheidsvector gratis tot δmax; wat meer nodig is moet de motor leveren. Veilige minimale periapsis per planeet (bijv. 1,2 R voor Jupiter, 2,4 R voor Saturnus i.v.m. ringen).', src: 'Izzo, PyKEP fb_vel; ESA ACT MGA-problemen' },
  { title: 'Hyperbool van de flyby (close-up)', tex: 'e = 1 + \\frac{r_p v_\\infty^2}{\\mu},\\quad M_h = e\\sinh F - F = \\sqrt{\\tfrac{\\mu}{a^3}}\\,(t - t_p)', text: 'Positie van het ruimtevaartuig in de close-up, tijdgetrouw rond het moment van dichtste nadering.', src: 'Curtis §3.5' },
  { title: 'Route-optimalisatie (EMTG-achtig)', tex: '\\min_{t_0, \\Delta t_1..\\Delta t_n} \\sum \\Delta v \\quad \\text{of}\\quad \\min \\sum\\Delta t \\ \\text{s.t.}\\ \\sum\\Delta v \\le \\Delta v_{budget}', text: 'Per flyby-volgorde (tot 2 assists, eventueel met een verplicht lichaam) een Differential-Evolution zoektocht over vertrekdatum en reistijden; bij vaste aankomstdatum worden de epochs terug gerekend. Geen deep-space-manoeuvres of multi-revolutie-Lambert (EMTG heeft die wel).', src: 'Storn & Price (1997); Englander, EMTG' },
  { title: 'Raketvergelijking (Tsiolkovsky)', tex: '\\Delta v = I_{sp} g_0 \\ln\\frac{m_0}{m_f}\\ \\Leftrightarrow\\ m_0 = m_f\\,e^{\\Delta v/(I_{sp}g_0)}', text: 'Zet droge massa + brandstof + Isp om in een Δv-budget, en omgekeerd (gegeven droge massa m_f) in de benodigde brandstof m_f·(e^{Δv/(Isp·g₀)} − 1). Zo is ook de massa na elke burn bekend.', src: 'Tsiolkovsky (1903); Sutton & Biblarz, Rocket Propulsion Elements §2.2' },
  { title: 'Brandstof per manoeuvre (route)', tex: 'm_{k+1} = m_k\\,e^{-\\Delta v_k/(I_{sp}g_0)},\\quad m_{verbrand,k} = m_k - m_{k+1}', text: 'De burns van lancering, flybys en aankomst volgen elkaar op; de massa na elke burn is de beginmassa van de volgende. Het product van de factoren is gelijk aan één raketvergelijking over de totale Δv. Reserves, boil-off en de massa van tanks worden niet meegerekend.', src: 'Tsiolkovsky; Wertz & Larson, SMAD §6' },
  { title: 'Excess velocity en C3', tex: 'v_\\infty = |\\vec v_{Lambert} - \\vec v_{planeet}|,\\quad C_3 = v_\\infty^2', text: 'Raketten geven hun capaciteit op als C3 (km²/s²). De limieten voor v∞ bij vertrek en aankomst zijn zachte randvoorwaarden: de optimalisator krijgt een straf in zijn kostfunctie als de limiet wordt overschreden.', src: 'Curtis §8.4; NASA Launch Services Program (C3-capaciteit)' },
  { title: 'Verplichte gravity assist', tex: '\\text{Aarde} \\to [\\ldots] \\to X \\to [\\ldots] \\to \\text{doel}', text: 'Alleen volgordes die het gekozen lichaam bevatten worden doorgerekend (maximaal 2 assists, nooit twee gelijke lichamen achter elkaar omdat de Lambert-leg zonder omloop dan niet bestaat). Staat het maximum op 0, dan wordt het automatisch verhoogd.', src: 'Zoekruimte-opzet naar Englander et al., EMTG; Vasile & De Pascale (2006)' },
  { title: 'Verre doelen: Pluto', tex: 'a = 39{,}48\\ \\text{AU},\\ e = 0{,}2488 \\Rightarrow r_p = 29{,}7\\ \\text{AU},\\ r_a = 49{,}3\\ \\text{AU}', text: 'Pluto komt uit dezelfde JPL-tabel als de planeten (heliocentrisch). Voor routes als New Horizons (Aarde → Jupiter → Pluto, ~9,5 jaar) is een Jupiter-assist onmisbaar; de reistijdgrenzen per leg schalen mee met de Hohmann-tijd tussen de twee banen.', src: 'Standish, JPL Approximate Positions, tabel 2a (1800–2050); NASA New Horizons-missiegegevens' },
  { title: 'Lancering: azimut en aardrotatie', tex: '\\sin A_z = \\frac{\\cos i}{\\cos\\varphi},\\quad v_{rot} = \\omega_\\oplus R_\\oplus\\cos\\varphi', text: 'Inclinatie kleiner dan de breedtegraad vereist een vlakverandering, gecombineerd uitgevoerd in het apogeum.', src: 'Vallado, Fundamentals of Astrodynamics §6.4' },
  { title: 'Vlakverandering', tex: '\\Delta v = \\sqrt{v_1^2 + v_2^2 - 2v_1v_2\\cos\\Delta i}', text: 'Daarom is GEO vanaf Kourou (5°) goedkoper dan vanaf Kennedy (28,5°) of Baikonoer (46°).', src: 'Curtis §6.10' },
  { title: 'J2-precessie', tex: '\\dot\\Omega = -\\tfrac32 nJ_2\\left(\\tfrac{R}{p}\\right)^2\\cos i,\\ \\ \\dot\\omega = \\tfrac34 nJ_2\\left(\\tfrac{R}{p}\\right)^2(5\\cos^2 i - 1)', text: 'Afplatting van de Aarde laat het baanvlak draaien; gebruikt voor SSO en Molniya, en toegepast in de 3D-animatie.', src: 'Vallado §9.6' },
  { title: 'Aangedreven flyby (Oberth)', tex: '\\Delta v = \\left|\\sqrt{v_{\\infty,uit}^2 + \\tfrac{2\\mu}{r_p}} - \\sqrt{v_{\\infty,in}^2 + \\tfrac{2\\mu}{r_p}}\\right|', text: 'Als de snelheid of de afbuiging niet gratis te krijgen is, brandt de motor één keer in het periapsis, op de hoogste periapsis die nog genoeg afbuigt. Dat is zuiniger dan branden ver weg (Oberth-effect).', src: 'Izzo/PyKEP; Curtis §8' },
  { title: 'Luchtweerstand & verval', tex: '\\frac{da}{dt} = -\\rho B\\sqrt{\\mu a},\\ B = \\frac{C_d A}{m},\\ \\ a_{drag} = \\tfrac12 \\rho B v^2', text: 'Levensduur door numerieke integratie van 1–2 km stappen tot 100 km hoogte; dichtheid uit een exponentiële tabel voor gemiddelde zonneactiviteit (in werkelijkheid verschilt de levensduur over de zonnecyclus met maanden tot jaren; draaiing van de atmosfeer is niet meegenomen).', src: 'King-Hele; Vallado tabel 8-4' },
  { title: 'Lagrangepunten (CR3BP)', tex: '\\gamma^5 \\mp (3-\\mu)\\gamma^4 + (3-2\\mu)\\gamma^3 - \\mu\\gamma^2 \\pm 2\\mu\\gamma - \\mu = 0', text: 'L1/L2 exact via Newton; L4/L5 vormen gelijkzijdige driehoeken met beide hoofdlichamen.', src: 'Szebehely, Theory of Orbits' },
  { title: 'Maanpositie', tex: '\\lambda = L\' + 6{,}289^\\circ\\sin M\',\\ \\beta = 5{,}128^\\circ\\sin F,\\ r = 385\\,001 - 20\\,905\\cos M\'\\ \\text{km}', text: 'Lage-precisie reeks zonder evectie en variatie (afwijking tot ~1–2°, afstand tot enkele duizenden km), omgezet naar het equatoriale frame met ε = 23,44°.', src: 'Meeus, Astronomical Algorithms' },
  { title: 'Aardrotatie (sterrentijd)', tex: '\\theta_{GMST} = 280{,}4606^\\circ + 360{,}98565^\\circ\\cdot d', text: 'Draait de aardbol en de lanceerbasis correct mee in de tijd.', src: 'IAU 1982' },
]

export function FormulasPanel() {
  return (
    <div className="grid gap-3">
      <p className="text-xs text-muted-foreground">Alles wat Periapsis berekent, met bron. Tweelichamen-/patched-conic-modellen: goed voor missie-ontwerp in de eerste fase, niet voor navigatie op de meter.</p>
      {FORMULAS.map((x) => (
        <div key={x.title} className="rounded-lg border bg-muted/30 p-2.5">
          <div className="text-xs font-semibold">{x.title}</div>
          <Tex block tex={x.tex} />
          <p className="text-[11px] leading-snug text-muted-foreground">{x.text}</p>
          <p className="mt-1 text-[10px] italic text-muted-foreground/80">Bron: {x.src}</p>
        </div>
      ))}
    </div>
  )
}
