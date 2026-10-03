// Upper-atmosphere density as a function of altitude and the solar radio flux F10.7.
//
// APPROXIMATION (not a full Jacchia-71 / NRLMSISE-00 model):
//  1. Base profile: the Vallado exponential table already used by the app (astro.ts `density`). We take it to represent an
//     average solar activity, assumed here to be F10.7 = F107_REF = 150 sfu (Vallado does not state an F10.7; this is our assumption).
//  2. Exospheric temperature from the Jacchia (1971) formula for the global night-time minimum,
//        T_inf = 379 + 3.24 * F10.7 [K]   (daily and 81-day mean flux taken equal; no geomagnetic term).
//  3. Temperature profile: Bates (1959) with T(120 km) = 355 K and shape parameter s = 0.02 /km:
//        T(z) = T_inf - (T_inf - 355) exp(-s (z - 120)).
//  4. Above 120 km the density changes relative to the table by the hydrostatic factor
//        rho(h; F) / rho(h; F_ref) = exp( -(1/R*) * integral_{120}^{h} g(z) M(z) [ 1/T(z; T_inf) - 1/T(z; T_inf,ref) ] dz )
//     with g = g0 (Re/(Re+z))^2 and an assumed mean molecular mass M falling linearly from 28 (z = 100 km) to 16 g/mol (z >= 300 km).
//     Below 120 km nothing changes. No diurnal bulge, no seasonal or geomagnetic variation.
// The solar-cycle swing at 400 km comes out at about a factor 100 between F10.7 = 70 and 250 (same order as the measured
// minimum-to-maximum range) but this is a rough estimate: real density also varies by tens of percent around the day.
import { density } from '../../lib/astro.ts'

export const F107_REF = 150
export const tInf = (f107: number) => 379 + 3.24 * f107
const T120 = 355, S = 0.02, R_GAS = 8.31446, G0M = 9.80665, RE_M = 6378.137
const mMol = (z: number) => (z <= 100 ? 28 : z >= 300 ? 16 : 28 - (12 * (z - 100)) / 200)
const tz = (z: number, ti: number) => ti - (ti - T120) * Math.exp(-S * (z - 120))

const cache = new Map<number, Float64Array>() // F10.7 -> ln ratio per km from 120 km up to 1500 km
const Z0 = 120, ZN = 1500
function ratioTable(f107: number) {
  const key = Math.round(f107 * 10) / 10
  let tab = cache.get(key)
  if (tab) return tab
  const ti = tInf(key), tr = tInf(F107_REF)
  tab = new Float64Array(ZN - Z0 + 1)
  let acc = 0
  const g = (z: number) => G0M * (RE_M / (RE_M + z)) ** 2
  // g [m/s²] · M [kg/mol] / R* [J/mol/K] · (1/T) [1/K] = 1/m ; times 1000 m/km.
  const integrand = (z: number) => ((g(z) * mMol(z) * 1e-3) / R_GAS) * (1 / tz(z, ti) - 1 / tz(z, tr)) * 1000
  for (let k = 1; k < tab.length; k++) {
    const z = Z0 + k
    acc += 0.5 * (integrand(z - 1) + integrand(z)) // trapezoid, 1 km
    tab[k] = -acc
  }
  if (cache.size > 64) cache.clear()
  cache.set(key, tab)
  return tab
}

/** Density in kg/m³ at geodetic altitude h (km) for solar flux f107 (sfu). */
export function densityF107(h: number, f107: number) {
  const base = density(Math.max(h, 0))
  if (h <= Z0) return base
  const tab = ratioTable(f107)
  const x = Math.min(h, ZN) - Z0, k = Math.min(Math.floor(x), tab.length - 2), w = x - k
  return base * Math.exp(tab[k] * (1 - w) + tab[k + 1] * w)
}
