// Locale-aware formatting for the Vanavond world. Times always in the device time zone.
export type L = 'nl' | 'en' | 'el'
export const LOC: Record<L, string> = { nl: 'nl-NL', en: 'en-GB', el: 'el-GR' }

const cache = new Map<string, Intl.DateTimeFormat>()
function dtf(lang: L, key: string, o: Intl.DateTimeFormatOptions) {
  const k = lang + key
  let f = cache.get(k)
  if (!f) { f = new Intl.DateTimeFormat(LOC[lang], o); cache.set(k, f) }
  return f
}
export const timeStr = (ms: number, lang: L) => dtf(lang, 't', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(ms)
export const dayShort = (ms: number, lang: L) => dtf(lang, 'ds', { weekday: 'short', day: 'numeric', month: 'short' }).format(ms)
export const dayLong = (ms: number, lang: L) => dtf(lang, 'dl', { weekday: 'long', day: 'numeric', month: 'long' }).format(ms)
export const dateTime = (ms: number, lang: L) => dtf(lang, 'dt', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(ms)
export const monthYear = (ms: number, lang: L) => dtf(lang, 'my', { month: 'long', year: 'numeric' }).format(ms)
export const weekdayShort = (ms: number, lang: L) => dtf(lang, 'wd', { weekday: 'short' }).format(ms)

export const num = (x: number, d: number, lang: L) =>
  Number.isFinite(x) ? x.toLocaleString(LOC[lang], { minimumFractionDigits: d, maximumFractionDigits: d }).replace('-', '−') : '—'

/** Local calendar date 'YYYY-MM-DD' of an instant (device time zone). */
export const localISO = (ms: number) => {
  const d = new Date(ms)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
export const parseISO = (s: string) => { const [y, m, d] = s.split('-').map(Number); return { y, m, d } }
export const shiftISO = (s: string, days: number) => {
  const { y, m, d } = parseISO(s)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}
/** Noon (device time zone) of an ISO date, for display of "the night of ...". */
export const noonOf = (s: string) => { const { y, m, d } = parseISO(s); return new Date(y, m - 1, d, 12).getTime() }
