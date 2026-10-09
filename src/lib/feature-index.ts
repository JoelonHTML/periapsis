// Every user-facing function of the app, with the world/tab where it lives. Powers the search on the start screen
// ("Zoek een functie") and the key features under each world tile. Keep in sync when adding features.
import type { Mode, Tab } from './ui-store.ts'
import type { Lang } from './settings.ts'

export interface Feature { id: string; mode: Mode; tab: Tab; key?: boolean; txt: Record<Lang, [title: string, desc: string]>; kw?: string }

const F = (id: string, mode: Mode, tab: Tab, nl: [string, string], en: [string, string], el: [string, string], o: { key?: boolean; kw?: string } = {}): Feature => ({ id, mode, tab, txt: { nl, en, el }, ...o })

export const FEATURES: Feature[] = [
  // ---- Missies ontwerpen
  F('route', 'design', 'mission', ['Route met zwaartekrachtslingers', 'Zoekt de zuinigste route naar een planeet, ook via andere planeten'], ['Gravity-assist route finder', 'Finds the cheapest route to a planet, also via other planets'], ['Διαδρομή με βαρυτική υποβοήθηση', 'Βρίσκει την πιο οικονομική διαδρομή, και μέσω άλλων πλανητών'], { key: true, kw: 'lambert mga emtg gmat optimaliseer delta-v' }),
  F('porkchop', 'design', 'mission', ['Porkchop-plot', 'Lanceervenster: C3 en aankomstsnelheid per vertrek- en reisdatum'], ['Porkchop plot', 'Launch window: C3 and arrival speed per departure and flight time'], ['Διάγραμμα porkchop', 'Παράθυρο εκτόξευσης: C3 και ταχύτητα άφιξης'], { key: true, kw: 'lanceervenster launch window c3' }),
  F('craft', 'design', 'mission', ['Ruimtevaartuig en vloot', 'Massa, brandstof, Isp, meerdere ruimtevaartuigen tegelijk'], ['Spacecraft and fleet', 'Mass, propellant, Isp, several craft at once'], ['Διαστημόπλοιο και στόλος', 'Μάζα, καύσιμα, Isp, πολλά σκάφη μαζί'], { kw: 'tsiolkovsky brandstof massa isp' }),
  F('advanced', 'design', 'mission', ['Geavanceerd zoeken', 'Meerdere omlopen, Aarde-Aarde-banen en manoeuvres in de ruimte'], ['Advanced search', 'Multiple revolutions, Earth–Earth legs and deep-space manoeuvres'], ['Προηγμένη αναζήτηση', 'Πολλές περιφορές, σκέλη Γη–Γη και ελιγμοί στο διάστημα'], { kw: 'dsm multi-rev resonant galileo cassini' }),
  F('angles', 'design', 'mission', ['Vertrekhoeken', 'Fasehoek, uitwerphoek, richting van de uitwerpsnelheid'], ['Departure angles', 'Phase angle, ejection angle, ejection direction'], ['Γωνίες αναχώρησης', 'Γωνία φάσης, γωνία εκτόξευσης, κατεύθυνση'], { kw: 'fasehoek ejection phase ksp' }),
  F('export', 'design', 'mission', ['Opslaan, delen en exporteren', 'Missies bewaren, delen als tekst, export naar CSV en CCSDS OEM'], ['Save, share and export', 'Keep missions, share as text, export to CSV and CCSDS OEM'], ['Αποθήκευση, κοινοποίηση, εξαγωγή', 'Αποθήκευση αποστολών, κοινοποίηση, εξαγωγή CSV και OEM'], { kw: 'csv oem export delen opslaan' }),
  F('moon', 'design', 'mission', ['Naar de Maan', 'Transfer naar de Maan met TLI en intrede in een maanbaan'], ['To the Moon', 'Transfer to the Moon with TLI and lunar orbit insertion'], ['Προς τη Σελήνη', 'Μεταφορά στη Σελήνη με TLI και είσοδο σε τροχιά'], { kw: 'maan tli loi' }),
  F('earth', 'design', 'earth', ['Aardbaan en lanceerbasis', 'LEO, GEO, zon-synchroon, Molniya; Δv vanaf een echte lanceerbasis'], ['Earth orbit and launch site', 'LEO, GEO, sun-synchronous, Molniya; Δv from a real launch site'], ['Τροχιά Γης και βάση εκτόξευσης', 'LEO, GEO, ηλιοσύγχρονη, Molniya· Δv από πραγματική βάση'], { key: true, kw: 'leo geo sso iss kennedy kourou inclinatie' }),
  F('eclipse', 'design', 'earth', ['Eclips en betahoek', 'Hoe lang je satelliet in de schaduw van de Aarde zit'], ['Eclipse and beta angle', 'How long your satellite is in Earth\'s shadow'], ['Έκλειψη και γωνία βήτα', 'Πόσο μένει ο δορυφόρος στη σκιά της Γης'], { kw: 'schaduw beta zonlicht' }),
  F('perturb', 'design', 'earth', ['Verstoringen', 'J2–J4, luchtweerstand met zonneflux, zonnedruk, Zon en Maan'], ['Perturbations', 'J2–J4, drag with solar flux, radiation pressure, Sun and Moon'], ['Διαταραχές', 'J2–J4, αντίσταση με ηλιακή ροή, πίεση ακτινοβολίας'], { kw: 'j2 drag srp verval levensduur f10.7' }),
  F('calc', 'design', 'calc', ['Calculators', 'Hohmann, bi-elliptisch, raketvergelijking, invloedssfeer en meer'], ['Calculators', 'Hohmann, bi-elliptic, rocket equation, sphere of influence and more'], ['Υπολογιστές', 'Hohmann, δι-ελλειπτική, εξίσωση πυραύλου και άλλα'], { key: true, kw: 'hohmann tsiolkovsky vis-viva rekenen' }),
  F('aero', 'design', 'calc', ['Aerocapture en aerobraking', 'Remmen met een atmosfeer in plaats van brandstof'], ['Aerocapture and aerobraking', 'Braking with an atmosphere instead of propellant'], ['Αεροσύλληψη και αεροπέδηση', 'Πέδηση με ατμόσφαιρα αντί για καύσιμα'], { kw: 'atmosfeer mars titan remmen' }),
  F('burns', 'design', 'burns', ['Manoeuvres', 'Burns op een tijdlijn met brandstofmeter'], ['Manoeuvres', 'Burns on a timeline with a propellant gauge'], ['Ελιγμοί', 'Καύσεις σε χρονολόγιο με μετρητή καυσίμων'], { kw: 'burn tijdlijn brandstof' }),
  F('lagrange', 'design', 'lagrange', ['Lagrangepunten', 'L1–L5 van Zon–Aarde en Aarde–Maan'], ['Lagrange points', 'L1–L5 of Sun–Earth and Earth–Moon'], ['Σημεία Λαγκράνζ', 'L1–L5 Ήλιου–Γης και Γης–Σελήνης'], { kw: 'l1 l2 jwst halo' }),
  F('formulas', 'design', 'formulas', ['Formules', 'Alle vergelijkingen met bronnen'], ['Formulas', 'All equations with sources'], ['Τύποι', 'Όλες οι εξισώσεις με πηγές'], { kw: 'vergelijking bron' }),
  // ---- Satellieten
  F('track', 'explore', 'sats', ['ISS en satellieten volgen', 'Live positie, hoogte, snelheid, grondspoor op de kaart'], ['Track the ISS and satellites', 'Live position, altitude, speed, ground track'], ['Παρακολούθηση ISS και δορυφόρων', 'Θέση, ύψος, ταχύτητα, ίχνος εδάφους'], { key: true, kw: 'iss tle sgp4 celestrak starlink gps grondspoor' }),
  F('tle', 'explore', 'sats', ['Eigen TLE', 'Plak de baangegevens van elke satelliet'], ['Your own TLE', 'Paste orbital elements of any satellite'], ['Δικό σου TLE', 'Επικόλλησε στοιχεία τροχιάς'], { kw: 'tle twoline' }),
  F('passes', 'explore', 'passes', ['Overkomsten', 'Wanneer en waar een satelliet boven jou zichtbaar is'], ['Passes', 'When and where a satellite is visible above you'], ['Διελεύσεις', 'Πότε και πού φαίνεται ένας δορυφόρος'], { key: true, kw: 'zichtbaar overkomst pass' }),
  // ---- Vanavond
  F('planets', 'sky', 'tonight', ['Planeten vanavond', 'Welke planeten zichtbaar zijn, waar en wanneer'], ['Planets tonight', 'Which planets are visible, where and when'], ['Πλανήτες απόψε', 'Ποιοι πλανήτες φαίνονται, πού και πότε'], { key: true, kw: 'zichtbaar hemel venus jupiter' }),
  F('moonphase', 'sky', 'tonight', ['Maanfase en schemering', 'Maanfase, op- en ondergang, zon en schemering'], ['Moon phase and twilight', 'Moon phase, rise and set, sun and twilight'], ['Φάση Σελήνης και λυκόφως', 'Φάση, ανατολή και δύση, λυκόφως'], { kw: 'volle maan zonsondergang' }),
  F('events', 'sky', 'events', ['Agenda', 'Eclipsen, conjuncties, opposities, meteorenzwermen, met herinneringen'], ['Calendar', 'Eclipses, conjunctions, oppositions, meteor showers, with reminders'], ['Ημερολόγιο', 'Εκλείψεις, συζυγίες, βροχές μετεωριτών, υπενθυμίσεις'], { key: true, kw: 'eclips zonsverduistering maansverduistering perseiden melding' }),
  F('aurora', 'sky', 'live', ['Ruimteweer en noorderlicht', 'Kp-index en kans op noorderlicht boven jou'], ['Space weather and aurora', 'Kp index and aurora chance above you'], ['Διαστημικός καιρός και σέλας', 'Δείκτης Kp και πιθανότητα σέλαος'], { key: true, kw: 'aurora kp noaa zonnevlam' }),
  F('apod', 'sky', 'live', ['Foto van de dag', 'NASA Astronomy Picture of the Day'], ['Picture of the day', 'NASA Astronomy Picture of the Day'], ['Φωτογραφία της ημέρας', 'NASA Astronomy Picture of the Day'], { kw: 'apod nasa foto' }),
  F('launches', 'sky', 'live', ['Lanceringen', 'Komende raketlanceringen met aftellen'], ['Launches', 'Upcoming rocket launches with countdown'], ['Εκτοξεύσεις', 'Επερχόμενες εκτοξεύσεις με αντίστροφη μέτρηση'], { kw: 'spacex raket launch aftellen' }),
  F('neo', 'sky', 'live', ['Planetoïden dichtbij', 'Planetoïden die de komende tijd langs de Aarde scheren'], ['Close asteroids', 'Asteroids passing close to Earth soon'], ['Κοντινοί αστεροειδείς', 'Αστεροειδείς που περνούν κοντά στη Γη'], { kw: 'asteroide neo jpl' }),
  // ---- Verkennen
  F('bodies', 'explore', 'bodies', ['Hemellichamen', 'Feiten over Zon, planeten en manen, schaalvergelijking en quiz'], ['Celestial bodies', 'Facts about the Sun, planets and moons, scale and quiz'], ['Ουράνια σώματα', 'Στοιχεία για Ήλιο, πλανήτες και δορυφόρους, κλίμακα, κουίζ'], { key: true, kw: 'encyclopedie quiz schaal feiten' }),
  F('realmissions', 'explore', 'missions', ['Echte missies', 'Voyager, Cassini, Juno en meer, afgespeeld in 3D'], ['Real missions', 'Voyager, Cassini, Juno and more, replayed in 3D'], ['Πραγματικές αποστολές', 'Voyager, Cassini, Juno και άλλες σε 3D'], { key: true, kw: 'voyager cassini juno new horizons galileo' }),
  F('system', 'explore', 'system', ['Planeet en manen', 'Een planeet met zijn manen in beeld'], ['Planet and moons', 'A planet with its moons'], ['Πλανήτης και δορυφόροι', 'Ένας πλανήτης με τους δορυφόρους του'], { kw: 'manen io europa titan' }),
  F('galaxy', 'explore', 'galaxy', ['Melkweg en sterrenreizen', 'De Melkweg op schaal, reistijden met relativiteit'], ['Milky Way and star travel', 'The Milky Way to scale, travel times with relativity'], ['Γαλαξίας και ταξίδια στα άστρα', 'Ο Γαλαξίας σε κλίμακα, χρόνοι ταξιδιού'], { kw: 'proxima relativiteit lichtjaar' }),
  F('exoplanets', 'explore', 'catalog', ['Exoplaneten', 'Duizenden planeten bij andere sterren, met filters'], ['Exoplanets', 'Thousands of planets around other stars, with filters'], ['Εξωπλανήτες', 'Χιλιάδες πλανήτες σε άλλα άστρα'], { kw: 'exoplaneet bewoonbaar trappist' }),
  F('smallbodies', 'explore', 'catalog', ['Kometen en planetoïden', 'Halley, Bennu, Apophis… met hun baan in 3D'], ['Comets and asteroids', 'Halley, Bennu, Apophis… with their orbit in 3D'], ['Κομήτες και αστεροειδείς', 'Halley, Bennu, Apophis… με την τροχιά τους'], { kw: 'komeet halley bennu apophis' }),
]

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
/** Accent-insensitive search over the titles/descriptions in every language plus keywords. Title hits in the current language rank first. */
export function searchFeatures(q: string, lang: Lang): Feature[] {
  const words = norm(q).split(/\s+/).filter(Boolean)
  if (!words.length) return []
  const scored: [Feature, number][] = []
  for (const f of FEATURES) {
    const own = norm(f.txt[lang][0]), all = norm([...Object.values(f.txt).flat(), f.kw ?? ''].join(' '))
    if (!words.every((w) => all.includes(w))) continue
    scored.push([f, words.every((w) => own.includes(w)) ? 0 : 1])
  }
  return scored.sort((a, b) => a[1] - b[1]).map(([f]) => f)
}
export const keyFeatures = (m: Mode) => FEATURES.filter((f) => f.mode === m && f.key)
