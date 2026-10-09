// World Magnetic Model WMM2025 (NOAA / BGS, public domain), degree 12: magnetic declination for a place and date.
// Used by AR: compass sensors give MAGNETIC north, the sky needs TRUE north. Valid 2025.0 - 2030.0 (extrapolated outside).
// One row per (n, m), n = 1..12, m = 0..n: "g h gDot hDot" (nT, nT, nT/yr, nT/yr).
const COF = [
  '-29351.8 0 12 0', '-1410.8 4545.4 9.7 -21.5', '-2556.6 0 -11.6 0', '2951.1 -3133.6 -5.2 -27.7', '1649.3 -815.1 -8 -12.1', '1361 0 -1.3 0', '-2404.1 -56.6 -4.2 4', '1243.8 237.5 0.4 -0.3', '453.6 -549.5 -15.6 -4.1',
  '895 0 -1.6 0', '799.5 278.6 -2.4 -1.1', '55.7 -133.9 -6 4.1', '-281.1 212 5.6 1.6', '12.1 -375.6 -7 -4.4', '-233.2 0 0.6 0', '368.9 45.4 1.4 -0.5', '187.2 220.2 0 2.2', '-138.7 -122.9 0.6 0.4', '-142 43 2.2 1.7', '20.9 106.1 0.9 1.9',
  '64.4 0 -0.2 0', '63.8 -18.4 -0.4 0.3', '76.9 16.8 0.9 -1.6', '-115.7 48.8 1.2 -0.4', '-40.9 -59.8 -0.9 0.9', '14.9 10.9 0.3 0.7', '-60.7 72.7 0.9 0.9', '79.5 0 0 0', '-77 -48.9 -0.1 0.6', '-8.8 -14.4 -0.1 0.5', '59.3 -1 0.5 -0.8',
  '15.8 23.4 -0.1 0', '2.5 -7.4 -0.8 -1', '-11.1 -25.1 -0.8 0.6', '14.2 -2.3 0.8 -0.2', '23.2 0 -0.1 0', '10.8 7.1 0.2 -0.2', '-17.5 -12.6 0 0.5', '2 11.4 0.5 -0.4', '-21.7 -9.7 -0.1 0.4', '16.9 12.7 0.3 -0.5', '15 0.7 0.2 -0.6',
  '-16.8 -5.2 0 0.3', '0.9 3.9 0.2 0.2', '4.6 0 0 0', '7.8 -24.8 -0.1 -0.3', '3 12.2 0.1 0.3', '-0.2 8.3 0.3 -0.3', '-2.5 -3.3 -0.3 0.3', '-13.1 -5.2 0 0.2', '2.4 7.2 0.3 -0.1', '8.6 -0.6 -0.1 -0.2', '-8.7 0.8 0.1 0.4',
  '-12.9 10 -0.1 0.1', '-1.3 0 0.1 0', '-6.4 3.3 0 0', '0.2 0 0.1 0', '2 2.4 0.1 -0.2', '-1 5.3 0 0.1', '-0.6 -9.1 -0.3 -0.1', '-0.9 0.4 0 0.1', '1.5 -4.2 -0.1 0', '0.9 -3.8 -0.1 -0.1', '-2.7 0.9 0 0.2', '-3.9 -9.1 0 0',
  '2.9 0 0 0', '-1.5 0 0 0', '-2.5 2.9 0 0.1', '2.4 -0.6 0 0', '-0.6 0.2 0 0.1', '-0.1 0.5 -0.1 0', '-0.6 -0.3 0 0', '-0.1 -1.2 0 0.1', '1.1 -1.7 -0.1 0', '-1 -2.9 -0.1 0', '-0.2 -1.8 -0.1 0', '2.6 -2.3 -0.1 0',
  '-2 0 0 0', '-0.2 -1.3 0 0', '0.3 0.7 0 0', '1.2 1 0 -0.1', '-1.3 -1.4 0 0.1', '0.6 0 0 0', '0.6 0.6 0.1 0', '0.5 -0.1 0 0', '-0.1 0.8 0 0', '-0.4 0.1 0 0', '-0.2 -1 -0.1 0', '-1.3 0.1 0 0', '-0.7 0.2 -0.1 -0.1',
]
const EPOCH = 2025
const A = 6378.137, F = 1 / 298.257223563, R0 = 6371.2 // WGS84 semi-major axis (km), flattening; WMM reference radius (km)
const D2R = Math.PI / 180
const N = 12
const G: number[][] = [], H: number[][] = [], GT: number[][] = [], HT: number[][] = []
for (let n = 0; n <= N; n++) { G.push(new Array(n + 1).fill(0)); H.push(new Array(n + 1).fill(0)); GT.push(new Array(n + 1).fill(0)); HT.push(new Array(n + 1).fill(0)) }
{
  let i = 0
  for (let n = 1; n <= N; n++) for (let m = 0; m <= n; m++) { const [g, h, gt, ht] = COF[i++].split(' ').map(Number); G[n][m] = g; H[n][m] = h; GT[n][m] = gt; HT[n][m] = ht }
}

/** Schmidt semi-normalised associated Legendre functions P[n][m](cos theta), n, m <= 12. */
function legendre(theta: number): number[][] {
  const c = Math.cos(theta), s = Math.sin(theta)
  const P: number[][] = Array.from({ length: N + 1 }, () => new Array(N + 1).fill(0))
  P[0][0] = 1
  for (let m = 0; m <= N; m++) {
    if (m > 0) P[m][m] = (m === 1 ? 1 : Math.sqrt(1 - 1 / (2 * m))) * s * P[m - 1][m - 1]
    if (m < N) P[m + 1][m] = Math.sqrt(2 * m + 1) * c * P[m][m]
    for (let n = m + 2; n <= N; n++) P[n][m] = ((2 * n - 1) * c * P[n - 1][m] - Math.sqrt((n - 1) * (n - 1) - m * m) * P[n - 2][m]) / Math.sqrt(n * n - m * m)
  }
  return P
}

/** Magnetic declination in degrees (east positive: true heading = magnetic heading + declination) at geodetic latitude / longitude
 *  (deg), height above the ellipsoid (km, default 0) and date (default now). */
export function declination(latDeg: number, lonDeg: number, date: Date | number = Date.now(), hKm = 0): number {
  const ms = typeof date === 'number' ? date : date.getTime()
  const y = new Date(ms).getUTCFullYear()
  const t = y + (ms - Date.UTC(y, 0, 1)) / (Date.UTC(y + 1, 0, 1) - Date.UTC(y, 0, 1)) - EPOCH
  // geodetic -> geocentric spherical (latitude, radius)
  const lat = Math.max(-89.999, Math.min(89.999, latDeg)) * D2R, lam = lonDeg * D2R
  const e2 = F * (2 - F), sl = Math.sin(lat), cl = Math.cos(lat)
  const Rc = A / Math.sqrt(1 - e2 * sl * sl)
  const p = (Rc + hKm) * cl, z = (Rc * (1 - e2) + hKm) * sl
  const r = Math.hypot(p, z), latc = Math.asin(z / r)
  const theta = Math.PI / 2 - latc
  const P = legendre(theta), h = 1e-5
  const Pm = legendre(theta - h), Pp = legendre(theta + h) // dP/dtheta by central difference (rarely called; keeps the maths short)
  let Br = 0, Bt = 0, Bp = 0
  for (let n = 1; n <= N; n++) {
    const k = (R0 / r) ** (n + 2)
    for (let m = 0; m <= n; m++) {
      const g = G[n][m] + GT[n][m] * t, hh = H[n][m] + HT[n][m] * t
      const cm = Math.cos(m * lam), sm = Math.sin(m * lam), gh = g * cm + hh * sm
      Br += k * (n + 1) * gh * P[n][m]
      Bt -= k * gh * ((Pp[n][m] - Pm[n][m]) / (2 * h))
      Bp += k * m * (g * sm - hh * cm) * P[n][m]
    }
  }
  Bp /= Math.sin(theta)
  const psi = latc - lat // geocentric -> geodetic rotation of the (north, down) pair
  const X = -Bt * Math.cos(psi) - -Br * Math.sin(psi) // north = -Bt, down = -Br
  return Math.atan2(Bp, X) / (D2R)
}
