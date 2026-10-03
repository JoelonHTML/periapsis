// Number/date formatting for the catalogue UI (UI-only: uses the translate function and the interface language).
import type { Lang } from '@/lib/i18n'

type T = (key: string, vars?: Record<string, string | number>) => string

export const nf = (lang: Lang, v: number, digits = 2) => v.toLocaleString(lang, { maximumFractionDigits: digits, minimumFractionDigits: 0 })
/** Significant-digit formatting: 3 digits for small numbers, no decimals for big ones. */
export const sig = (lang: Lang, v: number) => nf(lang, v, v >= 100 ? 0 : v >= 10 ? 1 : v >= 1 ? 2 : 3)

export function fmtYears(t: T, lang: Lang, y: number) {
  if (!Number.isFinite(y)) return '—'
  if (y < 1000) return t('cat.yr', { v: nf(lang, y, y < 10 ? 1 : 0) })
  if (y < 1e6) return t('cat.yr', { v: nf(lang, Math.round(y), 0) })
  if (y < 1e9) return t('cat.myr', { v: nf(lang, y / 1e6, y < 1e7 ? 2 : 1) })
  return t('cat.byr', { v: nf(lang, y / 1e9, 2) })
}

/** Orbital period given in days: days below 2 years' worth of ~1 year, else years. */
export function fmtPeriod(t: T, lang: Lang, days: number) {
  if (days < 400) return t('cat.d', { v: nf(lang, days, days < 10 ? 2 : 1) })
  return t('cat.yr', { v: nf(lang, days / 365.25, days / 365.25 < 10 ? 2 : 1) })
}

export function fmtAge(t: T, _lang: Lang, ms: number) {
  const m = Math.max(0, Math.round(ms / 60000))
  if (m < 90) return `${m} min`
  if (m < 2880) return t('cat.h', { v: Math.round(m / 60) })
  return t('cat.d', { v: Math.round(m / 1440) })
}

export const fmtDate = (lang: Lang, ms: number) => new Date(ms).toLocaleDateString(lang, { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' })
