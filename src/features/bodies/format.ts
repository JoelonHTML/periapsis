// Unit formatting for the encyclopedia. Pure, no React.
import type { Lang } from '../../lib/settings.ts'
import { AU_KM, type Body } from './data.ts'
import type { Metric } from './quiz.ts'

const LOCALE: Record<Lang, string> = { nl: 'nl-NL', en: 'en-GB', el: 'el-GR' }
const SUP: Record<string, string> = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '-': '⁻' }
const sup = (n: number) => String(n).replace(/./g, (c) => SUP[c] ?? c)

/** Number with `sig` significant digits in the locale (grouping only from 10 000 up). */
export function fmtNum(x: number, lang: Lang, sig = 3): string {
  if (x === 0) return '0'
  const d = Math.max(0, sig - 1 - Math.floor(Math.log10(Math.abs(x))))
  return new Intl.NumberFormat(LOCALE[lang], { maximumFractionDigits: Math.min(d, 6), minimumFractionDigits: 0, useGrouping: Math.abs(x) >= 10000 }).format(Number(x.toPrecision(sig)))
}

/** Scientific notation "5,97 × 10²⁴" (mantissa with `sig` digits). */
export function fmtSci(x: number, lang: Lang, sig = 3): string {
  const e = Math.floor(Math.log10(Math.abs(x)))
  const m = x / 10 ** e
  if (Number(m.toPrecision(sig)) >= 10) return `${fmtNum(1, lang, sig)} × 10${sup(e + 1)}`
  return `${fmtNum(m, lang, sig)} × 10${sup(e)}`
}

export const fmtMass = (kg: number, lang: Lang) => `${fmtSci(kg, lang)} kg`
export const fmtRadius = (km: number, lang: Lang) => `${fmtNum(km, lang, km >= 100 ? 4 : 3)} km`
export const fmtGravity = (g: number, lang: Lang) => `${fmtNum(g, lang)} m/s² (${fmtNum(g / 9.80665, lang)} g)`
export const fmtVesc = (v: number, lang: Lang) => (v < 0.1 ? `${fmtNum(v * 1000, lang)} m/s` : `${fmtNum(v, lang)} km/s`)
export const fmtRho = (r: number, lang: Lang) => `${fmtNum(r, lang, 4)} kg/m³`
export const fmtTemp = (K: number, lang: Lang) => `${fmtNum(K, lang)} K (${fmtNum(K - 273.15, lang, 3)} °C)`

const U: Record<Lang, { h: string; d: string; y: string; AU: string }> = {
  nl: { h: 'uur', d: 'dagen', y: 'jaar', AU: 'AE' },
  en: { h: 'hours', d: 'days', y: 'years', AU: 'AU' },
  el: { h: 'ώρες', d: 'ημέρες', y: 'έτη', AU: 'AU' },
}
/** A duration given in hours: hours below 100 h, otherwise days (years from 1000 days up when `years`). */
export function fmtDuration(hours: number, lang: Lang, years = false): string {
  const h = Math.abs(hours), u = U[lang]
  if (h < 100) return `${fmtNum(h, lang, 4)} ${u.h}`
  const d = h / 24
  if (years && d >= 1000) return `${fmtNum(d / 365.25, lang)} ${u.y}`
  return `${fmtNum(d, lang, 4)} ${u.d}`
}
export const fmtRotation = (b: Body, lang: Lang) => (b.rotH === undefined ? '' : fmtDuration(b.rotH, lang))
export const fmtOrbitPeriod = (b: Body, lang: Lang) => (b.P === undefined ? '' : fmtDuration(b.P * 24, lang, true))
export function fmtDistance(km: number, lang: Lang, moon = false): string {
  if (moon || km < 5e6) return `${fmtNum(km, lang, 4)} km`
  return `${fmtNum(km / 1e6, lang, 4)} × 10⁶ km (${fmtNum(km / AU_KM, lang)} ${U[lang].AU})`
}
export const fmtAU = (km: number, lang: Lang) => `${fmtNum(km / AU_KM, lang)} ${U[lang].AU}`
/** The value a quiz question compares, formatted for the answer review. */
export function fmtMetric(metric: Metric, b: Body, lang: Lang): string {
  switch (metric) {
    case 'rot': return fmtRotation({ ...b, rotH: Math.abs(b.rotH ?? 0) }, lang)
    case 'gravity': return `${fmtNum(b.g, lang)} m/s²`
    case 'radius': return fmtRadius(b.R, lang)
    case 'rho': return fmtRho(b.rho, lang)
    case 'T': return b.T === undefined ? '' : `${fmtNum(b.T, lang)} K`
    case 'a': return b.a === undefined ? '' : fmtAU(b.a, lang)
    case 'period': return fmtOrbitPeriod(b, lang)
    case 'vesc': return fmtVesc(b.vesc, lang)
    case 'moons': return String(b.moons ?? '')
    case 'mass': return fmtMass(b.M, lang)
  }
}
/** "CO₂ 96.5 %" gets a decimal comma for nl/el. */
export const fmtGas = (s: string, lang: Lang) => (lang === 'en' ? s : s.replace(/(\d)\.(\d)/g, '$1,$2'))
