// Offline place search over data/places.json (GeoNames via all-the-cities, CC BY 4.0; see scripts/build-skydata.mjs). Loaded lazily.
/** [name, ISO country, lat, lon, population in thousands, (altitude m for observatories)] */
export type Place = [name: string, cc: string, lat: number, lon: number, popK: number, altM?: number]

let cache: Promise<Place[]> | null = null
export const loadPlaces = () => (cache ??= import('./data/places.json').then((m) => m.default as unknown as Place[]))

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/ς/g, 'σ').replace(/[’'`.-]/g, ' ').replace(/\s+/g, ' ').trim()

/** Local spellings (Dutch, Greek) -> the GeoNames name used in the data. */
export const ALIASES: Record<string, string> = {
  londen: 'London', parijs: 'Paris', brussel: 'Brussels', wenen: 'Vienna', praag: 'Prague', moskou: 'Moscow', keulen: 'Köln', cologne: 'Köln', lissabon: 'Lisbon', warschau: 'Warsaw',
  kopenhagen: 'Copenhagen', athene: 'Athens', napels: 'Naples', luik: 'Liège', bazel: 'Basel', 'den haag': 'The Hague', turijn: 'Turin', milaan: 'Milan', genua: 'Genoa',
  αθηνα: 'Athens', θεσσαλονικη: 'Thessaloníki', πατρα: 'Pátra', λονδινο: 'London', παρισι: 'Paris', ρωμη: 'Rome', βερολινο: 'Berlin', μαδριτη: 'Madrid', βιεννη: 'Vienna', κωνσταντινουπολη: 'Istanbul',
}

const normCache = new WeakMap<Place[], string[]>()
const names = (list: Place[]) => { let n = normCache.get(list); if (!n) { n = list.map((p) => norm(p[0])); normCache.set(list, n) } return n }

/** Best matches first: exact, prefix, word prefix, substring; larger places first within a rank. */
export function findPlaces(query: string, list: Place[], max = 8): Place[] {
  let q = norm(query)
  if (q.length < 2) return []
  const alias = ALIASES[q]
  if (alias) q = norm(alias)
  const nn = names(list), hits: [number, Place][] = []
  for (let i = 0; i < list.length; i++) {
    const s = nn[i], at = s.indexOf(q)
    if (at < 0) continue
    const rank = s === q ? 0 : at === 0 ? 1 : s[at - 1] === ' ' ? 2 : 3
    hits.push([rank * 1e7 - Math.min(list[i][4], 9999999), list[i]])
  }
  return hits.sort((a, b) => a[0] - b[0]).slice(0, max).map((h) => h[1])
}

/** The place nearest to a point within `maxKm` (for naming a spot picked on the map), or null. */
export function nearestPlace(lat: number, lon: number, list: Place[], maxKm = 60): Place | null {
  let best: Place | null = null, bd = maxKm
  const c = Math.cos((lat * Math.PI) / 180)
  for (const p of list) {
    const dy = (p[2] - lat) * 111.19, dx = (((p[3] - lon + 540) % 360) - 180) * 111.19 * c
    if (Math.abs(dy) > bd) continue
    const d = Math.hypot(dx, dy)
    if (d < bd) { bd = d; best = p }
  }
  return best
}

/** "52.09°N 5.12°E" */
export const coordText = (lat: number, lon: number) => `${Math.abs(lat).toFixed(2)}°${lat >= 0 ? 'N' : 'S'} ${Math.abs(lon).toFixed(2)}°${lon >= 0 ? 'E' : 'W'}`
