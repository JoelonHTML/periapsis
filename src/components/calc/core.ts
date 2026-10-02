import type { Craft } from '@/lib/store'

/** Input values of one calculator (numbers; the burn list is a string). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type V = Record<string, any>

export interface Opt { value: number; label: string }
export interface Input {
  k: string
  label: string
  unit?: string
  def: number | string
  step?: number
  options?: Opt[]
  text?: boolean
  wide?: boolean // spans both columns
  show?: (v: V) => boolean
}
/** [label, value, highlight] or a heading string. */
export type Row = string | [string, string, boolean?]
export interface Res { err?: string; rows?: Row[]; tex?: string[]; note?: string }

export const CATS = ['Baanmechanica', 'Interplanetair', 'Aandrijving', 'Stand & rotatie', 'Aardomgeving', 'Overig'] as const
export type Cat = (typeof CATS)[number]

export interface Calc {
  id: string
  title: string
  cat: Cat
  blurb: string // one line, also searched
  kw?: string
  inputs: Input[]
  /** Fills inputs from the active spacecraft. */
  craft?: (c: Craft) => V
  /** Derived changes after an input changed (e.g. new defaults when the central body changes). */
  onChange?: (k: string, v: V) => V | void
  compute: (v: V) => Res
  src: string
}

// ---------- number formatting ----------
const SUP: Record<string, string> = { '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' }
function split(x: number, sig: number): { m: string; e: number | null } {
  if (!Number.isFinite(x)) return { m: '—', e: null }
  if (x === 0) return { m: '0', e: null }
  const a = Math.abs(x)
  if (a >= 1e6 || a < 1e-3) { const [m, e] = x.toExponential(sig - 1).split('e'); return { m, e: +e } }
  return { m: x.toFixed(Math.min(10, Math.max(0, sig - 1 - Math.floor(Math.log10(a))))), e: null }
}
/** TeX number, exponent notation for large/small values. */
export function N(x: number, sig = 4) {
  const { m, e } = split(x, sig)
  return e === null ? m : `${m}\\times10^{${e}}`
}
/** TeX number with unit. */
export const tu = (x: number, unit: string, sig = 4) => `${N(x, sig)}\\,\\mathrm{${unit}}`
/** Display number (+ unit) with unicode exponent. */
export function U(x: number, unit = '', sig = 4) {
  const { m, e } = split(x, sig)
  const s = e === null ? m : `${m}×10${String(e).split('').map((c) => SUP[c]).join('')}`
  return unit && m !== '—' ? `${s} ${unit}` : s
}
/** Human duration from seconds. */
export function dur(s: number) {
  if (!Number.isFinite(s)) return '—'
  const a = Math.abs(s)
  if (a < 120) return U(s, 's')
  if (a < 7200) return U(s / 60, 'min')
  if (a < 172800) return U(s / 3600, 'u')
  if (a < 2 * 365.25 * 86400) return U(s / 86400, 'd')
  return U(s / (365.25 * 86400), 'jaar')
}
/** TeX duration with unit chosen like `dur`. */
export function durTex(s: number) {
  const a = Math.abs(s)
  if (a < 120) return tu(s, 's')
  if (a < 7200) return tu(s / 60, 'min')
  if (a < 172800) return tu(s / 3600, 'u')
  if (a < 2 * 365.25 * 86400) return tu(s / 86400, 'd')
  return tu(s / (365.25 * 86400), 'jaar')
}
