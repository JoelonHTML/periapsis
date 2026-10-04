// Pure geometry helpers for the Earth layers (no three.js, so Node tests can import them).
// Frame: the scene uses three.js y-up axes (x, z, -y) of the equatorial frame; in the Earth's own (rotating) group
// longitude 0 points to +x, north is +y and east is -z, which is also how SphereGeometry maps an equirectangular map.

const D2R = Math.PI / 180

/** Latitude/longitude (degrees) to a point on a sphere of radius r in the Earth group's local frame. */
export function latLonToXyz(latDeg: number, lonDeg: number, r = 1, out: number[] | Float32Array = [0, 0, 0], o = 0): number[] | Float32Array {
  const la = latDeg * D2R, lo = lonDeg * D2R, c = Math.cos(la)
  out[o] = r * c * Math.cos(lo)
  out[o + 1] = r * Math.sin(la)
  out[o + 2] = -r * c * Math.sin(lo)
  return out
}

/** Inverse of latLonToXyz: [latDeg, lonDeg] (lon in (-180, 180]). */
export function xyzToLatLon(x: number, y: number, z: number): [number, number] {
  const r = Math.hypot(x, y, z) || 1
  return [Math.asin(Math.max(-1, Math.min(1, y / r))) / D2R, Math.atan2(-z, x) / D2R]
}

/** UV (u to the east from -180°, v to the north from -90°) of a lat/lon, as SphereGeometry/equirect textures use it. */
export const latLonToUv = (latDeg: number, lonDeg: number): [number, number] => [(lonDeg + 180) / 360, (latDeg + 90) / 180]

/** Great-circle distance in degrees. */
export function angularDistanceDeg(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const a = latLonToXyz(lat1, lon1), b = latLonToXyz(lat2, lon2)
  const dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
  const cr = Math.hypot(a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])
  return Math.atan2(cr, dot) / D2R
}
