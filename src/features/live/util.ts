// Small shared helpers for the Live tab: defensive value access, countdown/age formatting, and a safe URL filter. Pure, no DOM.
export const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)
/** Finite number from a number or numeric string (NOAA sends numbers as strings); otherwise null. */
export function numOf(x: unknown): number | null {
  if (typeof x === 'number') return Number.isFinite(x) ? x : null
  if (typeof x === 'string' && x.trim() !== '') { const n = Number(x); return Number.isFinite(n) ? n : null }
  return null
}
export const strOf = (x: unknown): string => (typeof x === 'string' ? x.trim() : '')
/** Only http(s) links are ever shown or opened. */
export const safeUrl = (x: unknown): string | null => { const s = strOf(x); return /^https?:\/\/[^\s]+$/i.test(s) ? s : null }

/** NOAA time tags are UTC, either '2026-10-03 00:00:00' or ISO ('...T00:00:00' with or without Z). */
export function parseUtc(x: unknown): number | null {
  const s = strOf(x)
  if (!s) return null
  const iso = s.includes('T') ? s : s.replace(' ', 'T')
  const ms = Date.parse(/(?:Z|[+-]\d\d:?\d\d)$/.test(iso) ? iso : iso + 'Z')
  return Number.isFinite(ms) ? ms : null
}

/** Rows of a NOAA table: [[header...], [row...], ...] (strings) or an array of objects. Returns one object per row. */
export function tableRows(body: unknown): Record<string, unknown>[] {
  if (!Array.isArray(body)) throw new Error('not an array')
  if (body.length === 0) return []
  if (isObj(body[0])) return body.filter(isObj)
  const head = body[0]
  if (!Array.isArray(head) || !head.every((h) => typeof h === 'string')) throw new Error('no header row')
  const out: Record<string, unknown>[] = []
  for (let i = 1; i < body.length; i++) {
    const r = body[i]
    if (!Array.isArray(r)) continue
    const o: Record<string, unknown> = {}
    head.forEach((h, j) => { o[h as string] = r[j] })
    out.push(o)
  }
  return out
}

export interface CountdownUnits { d: string }
/** 'T−2d 03:14:05' before the instant, 'T+00:12:30' after it. Whole seconds. */
export function formatCountdown(msUntil: number, units: CountdownUnits = { d: 'd' }): string {
  if (!Number.isFinite(msUntil)) return '—'
  const past = msUntil < 0
  const total = Math.floor(Math.abs(msUntil) / 1000)
  const d = Math.floor(total / 86400), h = Math.floor((total % 86400) / 3600), m = Math.floor((total % 3600) / 60), s = total % 60
  const p = (n: number) => String(n).padStart(2, '0')
  return `T${past ? '+' : '−'}${d > 0 ? `${d}${units.d} ` : ''}${p(h)}:${p(m)}:${p(s)}`
}

/** Age of data as a number + unit ('min' | 'h' | 'd'); under a minute counts as 0 min. */
export function ageParts(ms: number): { n: number; unit: 'min' | 'h' | 'd' } {
  const min = Math.max(0, Math.floor(ms / 60000))
  if (min < 60) return { n: min, unit: 'min' }
  if (min < 48 * 60) return { n: Math.floor(min / 60), unit: 'h' }
  return { n: Math.floor(min / 1440), unit: 'd' }
}
