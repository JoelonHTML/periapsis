// Defensive parser for the NOAA SWPC F10.7 JSON (https://services.swpc.noaa.gov/json/f107_cm_flux.json).
// The exact schema could not be checked offline: we accept an array (or an object holding an array) of objects and use the most
// recent entry that has a plausible numeric flux in a field named `flux`, `f107`, `f10.7` or anything containing "flux".
export interface Flux { f107: number; time: string | null }

const num = (x: unknown) => { const v = typeof x === 'string' ? parseFloat(x) : x; return typeof v === 'number' && Number.isFinite(v) ? v : NaN }
const plausible = (v: number) => v >= 50 && v <= 500

function fluxOf(o: Record<string, unknown>): number {
  for (const k of ['flux', 'f107', 'f10.7', 'F10.7', 'observed_flux']) { const v = num(o[k]); if (plausible(v)) return v }
  for (const k of Object.keys(o)) if (/flux/i.test(k) && !/(avg|mean|ninety)/i.test(k)) { const v = num(o[k]); if (plausible(v)) return v }
  return NaN
}

/** Throws when nothing usable is found (so getCached reports a parse error and falls back to its cache). */
export function parseFlux(body: unknown): Flux {
  let arr: unknown = body
  if (!Array.isArray(arr) && arr && typeof arr === 'object') arr = Object.values(arr as object).find(Array.isArray)
  if (!Array.isArray(arr)) throw new Error('no-array')
  const rows = arr.filter((x): x is Record<string, unknown> => !!x && typeof x === 'object')
  const timeOf = (o: Record<string, unknown>) => { const t = o.time_tag ?? o.time ?? o.date; return typeof t === 'string' ? t : null }
  const ok = rows.map((o) => ({ v: fluxOf(o), t: timeOf(o) })).filter((x) => Number.isFinite(x.v))
  if (!ok.length) throw new Error('no-flux')
  // Latest by time_tag when all entries have one (ISO strings sort lexicographically), otherwise the last array element.
  const best = ok.every((x) => x.t) ? ok.reduce((a, b) => (b.t! > a.t! ? b : a)) : ok[ok.length - 1]
  return { f107: best.v, time: best.t }
}
