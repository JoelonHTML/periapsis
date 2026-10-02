// Parsing of satellite element sets: CelesTrak GP JSON (OMM) and pasted TLE text. Pure, no I/O.
import { json2satrec, twoline2satrec, type SatRec } from './sgp4.ts'

/** Compact OMM row (keeps the localStorage cache small):
 *  [epoch ISO, mean motion rev/day, ecc, incl°, RAAN°, argp°, mean anomaly°, bstar, ndot, nddot, element set no, rev at epoch] */
export type Row = [string, number, number, number, number, number, number, number, number, number, number, number]
export interface SatRecord { name: string; norad: number; row?: Row; tle?: [string, string] }

const num = (x: unknown) => (typeof x === 'number' ? x : typeof x === 'string' && x.trim() !== '' ? Number(x) : NaN)

/** CelesTrak `FORMAT=json` array → records. Entries with missing/non-finite elements are skipped. */
export function parseGpJson(data: unknown): SatRecord[] {
  if (!Array.isArray(data)) throw new Error('bad-format')
  const out: SatRecord[] = []
  for (const o of data as Record<string, unknown>[]) {
    if (!o || typeof o !== 'object') continue
    const row = [num(o.MEAN_MOTION), num(o.ECCENTRICITY), num(o.INCLINATION), num(o.RA_OF_ASC_NODE), num(o.ARG_OF_PERICENTER),
      num(o.MEAN_ANOMALY), num(o.BSTAR), num(o.MEAN_MOTION_DOT), num(o.MEAN_MOTION_DDOT), num(o.ELEMENT_SET_NO ?? 0), num(o.REV_AT_EPOCH ?? 0)]
    const norad = num(o.NORAD_CAT_ID)
    if (typeof o.EPOCH !== 'string' || !Number.isFinite(norad) || row.some((x) => !Number.isFinite(x))) continue
    out.push({ name: String(o.OBJECT_NAME ?? `NORAD ${norad}`).trim(), norad, row: [o.EPOCH, ...row] as Row })
  }
  return out
}

function ommOf(r: Row, norad: number) {
  return {
    OBJECT_NAME: '', OBJECT_ID: '', EPOCH: r[0], MEAN_MOTION: r[1], ECCENTRICITY: r[2], INCLINATION: r[3], RA_OF_ASC_NODE: r[4],
    ARG_OF_PERICENTER: r[5], MEAN_ANOMALY: r[6], BSTAR: r[7], MEAN_MOTION_DOT: r[8], MEAN_MOTION_DDOT: r[9],
    ELEMENT_SET_NO: r[10], REV_AT_EPOCH: r[11], NORAD_CAT_ID: norad, EPHEMERIS_TYPE: 0 as const, CLASSIFICATION_TYPE: 'U' as const,
  }
}

const cache = new WeakMap<SatRecord, SatRec | null>()
/** SGP4 state for a record (cached); null when the elements are unusable. */
export function satrecOf(rec: SatRecord): SatRec | null {
  if (cache.has(rec)) return cache.get(rec)!
  let sr: SatRec | null = null
  try {
    sr = rec.tle ? twoline2satrec(rec.tle[0], rec.tle[1]) : rec.row ? json2satrec(ommOf(rec.row, rec.norad)) : null
    if (sr && (sr.error as unknown as number) !== 0) sr = null
  } catch { sr = null }
  cache.set(rec, sr)
  return sr
}

/** Epoch (ms since 1970) of a record's element set. */
export function epochMs(rec: SatRecord): number {
  if (rec.row) return Date.parse(rec.row[0].endsWith('Z') ? rec.row[0] : rec.row[0] + 'Z')
  const sr = rec.tle ? satrecOf(rec) : null
  if (!sr) return NaN
  const y = sr.epochyr < 57 ? 2000 + sr.epochyr : 1900 + sr.epochyr
  return Date.UTC(y, 0, 1) + (sr.epochdays - 1) * 86400000
}

/** TLE line checksum: digits count, '-' counts 1, mod 10 (over the first 68 characters). */
export function tleChecksum(line: string): number {
  let s = 0
  for (const c of line.slice(0, 68)) s += c >= '0' && c <= '9' ? +c : c === '-' ? 1 : 0
  return s % 10
}
const validLine = (l: string, n: '1' | '2') => l.length >= 69 && l[0] === n && l[1] === ' ' && tleChecksum(l) === Number(l[68])

/** Pasted text with one or more 3-line (name + 2 lines) or 2-line element sets. Throws Error('bad-tle') when nothing valid is found. */
export function parseTleText(text: string): SatRecord[] {
  const lines = text.split(/\r?\n/).map((l) => l.trimEnd()).filter((l) => l.trim() !== '')
  const out: SatRecord[] = []
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('1 ') && lines[i + 1]?.startsWith('2 ')) {
      const l1 = lines[i], l2 = lines[i + 1]
      if (!validLine(l1, '1') || !validLine(l2, '2')) throw new Error('bad-tle')
      const prev = lines[i - 1]
      const name = prev && !prev.startsWith('1 ') && !prev.startsWith('2 ') ? prev.replace(/^0 /, '').trim() : ''
      const norad = parseInt(l1.slice(2, 7), 10)
      out.push({ name: name || `NORAD ${norad}`, norad, tle: [l1, l2] })
      i++
    }
  }
  if (!out.length) throw new Error('bad-tle')
  return out
}
