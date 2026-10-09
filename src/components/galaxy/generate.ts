// Procedural barred-spiral Milky Way (deterministic, seeded). Node-safe (no aliases) so galaxy.test.ts can import it.
//
// Frame: galactocentric P = star − Galactic centre, axes parallel to the Sun-centred galactic frame of lib/galaxy.ts
// (x → from the Sun toward the centre, y → l=90°, z → north). Sun at P = (−26 000, 0, 0) ly, φ = atan2(y, x), Sun at φ = π.
// Seen from the north pole the Galaxy turns clockwise (Sun moves toward +y) and the arms trail: φ grows with r.
//
// Structure (SBbc; NASA/JPL-Caltech/R. Hurt "Milky Way" concept; Churchwell et al. 2009; Benjamin 2008):
//  * a long thin bar, half-length 13.5 kly (≈ 4.1 kpc), 27° from the Sun–centre line (Wegg+ 2015; Benjamin+ 2005),
//  * two major arms (Scutum–Centaurus, Perseus) leaving the two bar ends, two fainter minor arms (Sagittarius–Carina,
//    Norma–Outer) leaving the bar at ±90°, all logarithmic spirals r = r0·exp(θ·tan ψ) with ψ = 15° (Reid+ 2019: 9–17°;
//    Vallée 2017: 12.8°; slightly open to read well) → Sagittarius crosses the Sun–centre line ≈ 1.4 kpc inside and Perseus ≈ 2 kpc outside the Sun,
//  * the Local (Orion) spur between Sagittarius and Perseus, through the Sun (Reid+ 2019, ψ = 11.4°),
//  * exponential disc (scale length ≈ 2.6 kpc ≈ 8.5 kly), thin scale height ≈ 300 pc; flattened Plummer bulge.
import { GAL_RADIUS_LY, SUN_GC_LY } from '../../lib/galaxy.ts'

const DEG = Math.PI / 180
export const PITCH_DEG = 15
const K = Math.tan(PITCH_DEG * DEG)
export const BAR_HALF = 13500 // bar length 27 kly
export const BAR_ANGLE = -27 * DEG // far end direction (φ); the near end sits at φ = π − 27°, i.e. toward positive l
export const RIM_LY = GAL_RADIUS_LY - 2500
const R_ARM0 = 12500 // arms leave the bar just inside its tips

export interface ArmDef {
  id: string
  name: string
  /** azimuth φ (rad) at the inner end, radius r0 (ly), tan(pitch); the arm winds outward with φ growing (trailing) */
  phi0: number
  r0: number
  k: number
  /** drawn winding angle (rad) at most; the arm also stops at the rim */
  maxTheta?: number
  /** relative stellar linear density of the arm */
  weight: number
}

const arm = (id: string, name: string, phi0Deg: number, weight: number, r0 = R_ARM0): ArmDef => ({ id, name, phi0: phi0Deg * DEG, r0, k: K, weight })
export const ARMS: ArmDef[] = [
  arm('scutum', 'Scutum–Centaurus', 180 - 27, 1), // near bar end
  arm('perseus', 'Perseus', -27, 0.95), // far bar end
  arm('sag', 'Sagittarius', 63, 0.5),
  arm('outer', 'Norma / Buitenste arm', 243, 0.45, 11000),
]
export const LOCAL_ARM = ARMS.length // index used by armPath(): the Orion spur
const KL = Math.tan(11.4 * DEG)
const SPUR_LEAD = 4500 / SUN_GC_LY // spur starts 4.5 kly before the Sun (toward +y side), runs 12.5 kly
/** Orion spur: a segment of a ψ = 11.4° spiral passing exactly through the Sun (φ = π, r = 26 kly). */
export const SPUR: ArmDef = { id: 'local', name: 'Orion-spoor', phi0: Math.PI - SPUR_LEAD, r0: SUN_GC_LY * Math.exp(-SPUR_LEAD * KL), k: KL, maxTheta: 12500 / SUN_GC_LY, weight: 0.3 }
const ALL = [...ARMS, SPUR]
export const armDef = (i: number) => ALL[i]

/** Radius (ly) of arm `a` after winding θ radians from its inner end. */
export const armRadius = (a: ArmDef, theta: number) => a.r0 * Math.exp(a.k * theta)
export const armXY = (a: ArmDef, theta: number): [number, number] => {
  const r = armRadius(a, theta), p = a.phi0 + theta
  return [r * Math.cos(p), r * Math.sin(p)]
}

export interface ArmPath { x: Float64Array; y: Float64Array; r: Float64Array; s: Float64Array; n: number }
const paths = new Map<number, ArmPath>()
/** Densely sampled centre line of an arm (i = ARMS index, or LOCAL_ARM for the spur), galactocentric ly, from the inner end outward. */
export function armPath(i: number, stepLy = 150): ArmPath {
  const key = i * 1e6 + stepLy
  const hit = paths.get(key)
  if (hit) return hit
  const a = ALL[i], xs: number[] = [], ys: number[] = [], rs: number[] = [], ss: number[] = []
  let theta = 0, s = 0
  for (let it = 0; it < 20000; it++) {
    const [x, y] = armXY(a, theta), r = armRadius(a, theta)
    if (xs.length) s += Math.hypot(x - xs[xs.length - 1], y - ys[ys.length - 1])
    xs.push(x); ys.push(y); rs.push(r); ss.push(s)
    if (r > RIM_LY || (a.maxTheta !== undefined && theta >= a.maxTheta)) break
    theta += Math.min(0.05, stepLy / r / Math.sqrt(1 + a.k * a.k))
  }
  const p = { x: Float64Array.from(xs), y: Float64Array.from(ys), r: Float64Array.from(rs), s: Float64Array.from(ss), n: xs.length }
  paths.set(key, p)
  return p
}
/** First point of the arm centre line at radius ≥ r (ly); handy for labels. */
export function armAtRadius(i: number, r: number): [number, number] {
  const p = armPath(i)
  for (let k = 0; k < p.n; k++) if (p.r[k] >= r) return [p.x[k], p.y[k]]
  return [p.x[p.n - 1], p.y[p.n - 1]]
}

// --- arm profile (single source of truth for stars and for the haze texture)
const smooth = (a: number, b: number, x: number) => { const t = Math.min(Math.max((x - a) / (b - a), 0), 1); return t * t * (3 - 2 * t) }
/** Gaussian cross-section sigma (ly) of an arm at radius r: ≈ 1.5 kly in the inner Galaxy (FWHM ≈ 3.5 kly), widening outward. */
export const armSigma = (r: number) => 900 + 0.045 * r
/** Linear stellar density along an arm (relative): exponential fall-off, smooth fade at the rim and into the bar end. */
export const armDensity = (r: number, s: number) => Math.exp(-r / 20000) * (1 - smooth(34000, 48000, r)) * smooth(0, 4000, s)

export interface Cloud { pos: Float32Array; col: Float32Array; size: Float32Array; n: number }

function mulberry32(a: number) {
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Arm intensity and dust-lane grids on an n×n grid covering `size` ly, built from the same arm centre lines (no random numbers). */
export function armGrids(n: number, size: number) {
  const arm = new Float32Array(n * n), dust = new Float32Array(n * n), cell = size / n
  const splat = (grid: Float32Array, cx: number, cy: number, sig: number, amp: number) => {
    const rad = Math.ceil((3 * sig) / cell), ix = Math.floor(cx / cell + n / 2), iy = Math.floor(n / 2 - cy / cell)
    for (let j = Math.max(0, iy - rad); j <= Math.min(n - 1, iy + rad); j++) {
      const py = (n / 2 - j - 0.5) * cell - cy
      for (let i = Math.max(0, ix - rad); i <= Math.min(n - 1, ix + rad); i++) {
        const px = (i + 0.5 - n / 2) * cell - cx
        grid[j * n + i] += amp * Math.exp(-(px * px + py * py) / (2 * sig * sig))
      }
    }
  }
  ALL.forEach((a, i) => {
    const p = armPath(i, 120)
    let acc = 0
    for (let k = 0; k < p.n; k++) {
      const r = p.r[k], sig = armSigma(r), step = k ? p.s[k] - p.s[k - 1] : 0
      acc += step
      if (acc < sig * 0.4) continue
      const ds = acc; acc = 0
      const amp = (a.weight * armDensity(r, p.s[k]) * ds) / (sig * 2.5)
      splat(arm, p.x[k], p.y[k], sig, amp)
      if (r > 6000 && a !== SPUR) { // dust lane hugs the inner (concave, GC-ward) edge of the arm, narrower than the stars
        const o = 0.85 * sig
        splat(dust, p.x[k] - (p.x[k] / r) * o, p.y[k] - (p.y[k] / r) * o, sig * 0.5, amp * 0.9)
      }
    }
  })
  return { arm, dust, n, size }
}

const SCALE = 0.1 // 1 scene unit = 10 ly

function cloud(n: number): Cloud & { i: number } {
  return { pos: new Float32Array(n * 3), col: new Float32Array(n * 3), size: new Float32Array(n), n, i: 0 }
}

export const POINT_BUDGET = { main: 160000, local: 30000 }

export function generateGalaxy(seed = 20260922) {
  const rnd = mulberry32(seed)
  const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd())
  const logistic = () => { const u = Math.min(Math.max(rnd(), 1e-6), 1 - 1e-6); return Math.log(u / (1 - u)) }
  const main = cloud(POINT_BUDGET.main), local = cloud(POINT_BUDGET.local)

  // Galactocentric ly → scene units (x, z, −y)/10 relative to the Sun
  const put = (c: ReturnType<typeof cloud>, X: number, Y: number, Z: number, r: number, g: number, b: number, k: number, size: number) => {
    const o = c.i * 3
    c.pos[o] = X * SCALE; c.pos[o + 1] = Z * SCALE; c.pos[o + 2] = -Y * SCALE
    c.col[o] = r * k; c.col[o + 1] = g * k; c.col[o + 2] = b * k
    c.size[c.i++] = size
  }
  const gal = (px: number, py: number, pz: number, r: number, g: number, b: number, k: number, size: number) =>
    put(main, SUN_GC_LY + px, py, pz, r, g, b, k, size)

  // arm sampler: inverse CDF over (arm, centre-line segment) ∝ weight · density · length, then a Gaussian across the arm
  const segs: { a: number; k: number; w: number }[] = []
  let wTot = 0
  ALL.forEach((a, i) => {
    const p = armPath(i, 150)
    for (let k = 1; k < p.n; k++) {
      const w = a.weight * armDensity((p.r[k] + p.r[k - 1]) / 2, p.s[k]) * (p.s[k] - p.s[k - 1])
      wTot += w; segs.push({ a: i, k, w: wTot })
    }
  })
  const onArm = (only?: (a: number) => boolean, sigmaScale = 1) => {
    for (;;) {
      const u = rnd() * wTot
      let lo = 0, hi = segs.length - 1
      while (lo < hi) { const m = (lo + hi) >> 1; if (segs[m].w < u) lo = m + 1; else hi = m }
      const { a, k } = segs[lo]
      if (only && !only(a)) continue
      const p = armPath(a, 150), t = rnd()
      const x = p.x[k - 1] + (p.x[k] - p.x[k - 1]) * t, y = p.y[k - 1] + (p.y[k] - p.y[k - 1]) * t, r = p.r[k - 1] + (p.r[k] - p.r[k - 1]) * t
      const dx = p.x[k] - p.x[k - 1], dy = p.y[k] - p.y[k - 1], dn = Math.hypot(dx, dy) || 1
      const off = gauss() * armSigma(r) * sigmaScale
      return { x: x - (dy / dn) * off, y: y + (dx / dn) * off, r, a, off }
    }
  }
  const grids = armGrids(256, 112000)
  const cellAt = (g: Float32Array, x: number, y: number) => {
    const i = Math.floor(x / (grids.size / grids.n) + grids.n / 2), j = Math.floor(grids.n / 2 - y / (grids.size / grids.n))
    return i < 0 || j < 0 || i >= grids.n || j >= grids.n ? 0 : g[j * grids.n + i]
  }
  const armI = (x: number, y: number) => Math.min(1, cellAt(grids.arm, x, y) * 1.1)

  // 1 — old, dim, yellowish disc: exponential (scale length ≈ 9 kly) with an inter-arm floor of ≈ 30 % of the arm density
  for (let k = 0; k < 38000;) {
    const r = -9000 * Math.log(1 - rnd() * (1 - Math.exp(-RIM_LY / 9000)))
    if (r < 600) continue
    const phi = rnd() * 2 * Math.PI, x = r * Math.cos(phi), y = r * Math.sin(phi)
    if (rnd() > 0.3 + 0.7 * armI(x, y)) continue
    const h = 300 * (1 + 0.6 * (r / GAL_RADIUS_LY))
    gal(x, y, 0.5 * h * logistic(), 1, 0.86 + 0.08 * rnd(), 0.62 + 0.1 * rnd(), 0.07 + 0.14 * rnd() * rnd(), 1 + 0.4 * rnd())
    k++
  }
  // 2 — young blue-white arm population (+ a yellower older arm component), sampled densely along the continuous arms
  for (let k = 0; k < 56000; k++) {
    const s = onArm(), z = gauss() * 150
    if (rnd() < 0.3) gal(s.x, s.y, z * 1.4, 1, 0.9, 0.72, 0.07 + 0.2 * rnd() * rnd(), 1 + 0.4 * rnd())
    else {
      const t = rnd(), big = rnd() ** 5
      gal(s.x, s.y, z, 0.6 + 0.26 * t, 0.72 + 0.18 * t, 1, 0.25 + 0.6 * rnd() ** 3, 1 + 1.4 * big)
    }
  }
  // 3 — pink HII regions / star-forming clumps strung along the arms (not inside the bar)
  for (let c = 0; c < 90; c++) {
    const s = onArm((a) => a !== LOCAL_ARM, 0.6)
    if (s.r < 8000) { c--; continue }
    const cz = gauss() * 70
    for (let k = 0; k < 16; k++) gal(s.x + gauss() * 330, s.y + gauss() * 330, cz + gauss() * 70, 1, 0.5 + 0.15 * rnd(), 0.72, 0.25 + 0.35 * rnd(), 1.2 + 1 * rnd())
  }
  // 4 — bulge (Plummer, a = 1.6 kly, cut at 5.5 kly, flattened) in warm yellow-orange, kept dim so it does not saturate
  for (let k = 0; k < 20000;) {
    const u = rnd(), r = 1600 / Math.sqrt(Math.pow(u, -2 / 3) - 1)
    if (r > 5500) continue
    const ct = 2 * rnd() - 1, st = Math.sqrt(1 - ct * ct), ph = rnd() * 2 * Math.PI
    gal(r * st * Math.cos(ph), r * st * Math.sin(ph), 0.62 * r * ct, 1, 0.74 + 0.12 * rnd(), 0.42 + 0.1 * rnd(), 0.03 + 0.07 * rnd(), 1 + 0.4 * rnd())
    k++
  }
  // 5 — bar: 27 kly long, ≈ 4 kly wide, at 27° to the Sun–centre line, flat-topped along its length
  const bx = Math.cos(BAR_ANGLE), by = Math.sin(BAR_ANGLE)
  for (let k = 0; k < 20000; k++) {
    const u = (2 * rnd() - 1 + 0.35 * gauss()) * BAR_HALF * 0.82, w = gauss() * 1700 * (1 - 0.3 * Math.abs(u) / BAR_HALF), z = gauss() * 450
    if (Math.abs(u) > BAR_HALF) { k--; continue }
    gal(u * bx - w * by, u * by + w * bx, z, 1, 0.78 + 0.1 * rnd(), 0.46 + 0.1 * rnd(), 0.07 + 0.14 * rnd(), 1 + 0.4 * rnd())
  }
  // 6 — Orion spur: Reid's Local arm through the Sun, a bit fainter and narrower than the major arms
  for (let k = 0; k < 2500; k++) {
    const s = onArm((a) => a === LOCAL_ARM, 0.7), big = rnd() ** 4
    gal(s.x, s.y, gauss() * 110, 0.62 + 0.25 * rnd(), 0.76 + 0.15 * rnd(), 1, 0.2 + 0.5 * rnd() ** 3, 1 + 1.2 * big)
  }

  // 7/8 — local star field around the Sun (separate cloud, faded out when the whole Galaxy is in view)
  const starColour = () => {
    const u = rnd()
    if (u < 0.5) return [1, 0.93 + 0.05 * rnd(), 0.82 + 0.1 * rnd()] // G/F
    if (u < 0.75) return [1, 0.72 + 0.1 * rnd(), 0.48 + 0.1 * rnd()] // K/M
    if (u < 0.9) return [0.78 + 0.1 * rnd(), 0.85 + 0.08 * rnd(), 1] // A/B
    return [1, 0.52 + 0.1 * rnd(), 0.38] // M
  }
  const loc = (x: number, y: number, z: number) => {
    const [r, g, b] = starColour(), q = rnd()
    put(local, x, y, z, r, g, b, 0.3 + 0.7 * q * q, 1.2 + 2.6 * rnd() ** 6)
  }
  for (let k = 0; k < 24000; k++) { // thin disc out to 3 500 ly
    const r = 3500 * Math.pow(rnd(), 0.62), phi = rnd() * 2 * Math.PI
    loc(r * Math.cos(phi), r * Math.sin(phi), 150 * logistic())
  }
  for (let k = 0; k < 5500; k++) { // the immediate neighbourhood, uniform sphere of 180 ly
    const r = 180 * Math.cbrt(rnd()), ct = 2 * rnd() - 1, st = Math.sqrt(1 - ct * ct), ph = rnd() * 2 * Math.PI
    loc(r * st * Math.cos(ph), r * st * Math.sin(ph), r * ct)
  }
  // local cloud positions are Sun-relative galactic coordinates already (put() applies the same axis swap)
  return { main: trim(main), local: trim(local) }
}

function trim(c: Cloud & { i: number }): Cloud {
  const n = c.i
  return { pos: c.pos.subarray(0, n * 3), col: c.col.subarray(0, n * 3), size: c.size.subarray(0, n), n }
}
