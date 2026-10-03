// JPL SBDB close-approach API: {signature, count, fields:["des","orbit_id","jd","cd","dist","dist_min","dist_max","v_rel","v_inf","t_sigma_f","h"], data:[[...strings]]}
import { isObj, numOf, strOf } from './util.ts'
export const AU_KM = 149597870.7
export const LD_KM = 384400
export interface Approach { des: string; t: number; distAu: number; distLd: number; distKm: number; vRel: number | null; h: number | null }
/** 'YYYY-Mon-DD HH:mm' (UTC), JPL's calendar date format. */
export function parseCd(s: string): number | null {
  const m = /^(\d{4})-([A-Za-z]{3})-(\d{1,2})(?:\s+(\d{1,2}):(\d{2}))?/.exec(s.trim())
  if (!m) return null
  const mon = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(m[2].toLowerCase())
  if (mon < 0) return null
  return Date.UTC(+m[1], mon, +m[3], m[4] ? +m[4] : 0, m[5] ? +m[5] : 0)
}
export function parseApproaches(body: unknown): Approach[] {
  if (!isObj(body) || !Array.isArray(body.fields) || !Array.isArray(body.data)) throw new Error('no fields/data')
  const idx = (n: string) => (body.fields as unknown[]).indexOf(n)
  const iDes = idx('des'), iCd = idx('cd'), iJd = idx('jd'), iDist = idx('dist'), iV = idx('v_rel'), iH = idx('h')
  if (iDes < 0 || iDist < 0 || (iCd < 0 && iJd < 0)) throw new Error('missing columns')
  const out: Approach[] = []
  for (const r of body.data) {
    if (!Array.isArray(r)) continue
    const des = strOf(r[iDes]), au = numOf(r[iDist])
    let t = iCd >= 0 ? parseCd(strOf(r[iCd])) : null
    if (t === null && iJd >= 0) { const jd = numOf(r[iJd]); if (jd !== null) t = Math.round((jd - 2440587.5) * 86400000) }
    if (!des || au === null || t === null) continue
    out.push({ des, t, distAu: au, distLd: au * AU_KM / LD_KM, distKm: au * AU_KM, vRel: iV >= 0 ? numOf(r[iV]) : null, h: iH >= 0 ? numOf(r[iH]) : null })
  }
  if (out.length === 0 && body.data.length > 0) throw new Error('no usable rows')
  return out.sort((a, b) => a.t - b.t)
}
/** Diameter in km from absolute magnitude H and geometric albedo: D = 1329 km / sqrt(albedo) * 10^(-H/5). */
export const diameterKm = (h: number, albedo: number) => (1329 / Math.sqrt(albedo)) * Math.pow(10, -h / 5)
/** Range for albedo 0.25 (bright, small) to 0.05 (dark, large), in metres. */
export function sizeRangeM(h: number): { min: number; max: number } {
  return { min: diameterKm(h, 0.25) * 1000, max: diameterKm(h, 0.05) * 1000 }
}
