// Galilean moons of Jupiter. Theory L1.2 of Duriez, Lainey and Vienne (IMCCE / Observatoire de Paris, ftp.imcce.fr/pub/ephem/satel/galilean/L1/L1.2),
// accurate to a few arc-seconds. The coefficients and the element-to-position routine are the ones of astronomy-engine by Don Cross
// (MIT licence, github.com/cosinekitty/astronomy), translated to TypeScript.
// (Meeus' low-accuracy chapter 44 was tried first and rejected: it is off by several Jupiter radii for Ganymede and Callisto.)
interface Model { mu: number; al: [number, number]; a: number[][]; l: number[][]; z: number[][]; zeta: number[][] }
const MODEL: Model[] = [
  {mu: 2.824894284338e-7, al: [1.446213296021, 3.551552286182], a: [[0.00282109602129, 0, 0]], l: [[-0.0001925258348666, 4.936958972264, 0.01358483658305], [-0.0000970803596076, 4.318879647732, 0.01303413843243], [-0.00008988174165, 1.908001642862, 0.00305064867158], [-0.0000553101050262, 1.493615668157, 0.01293892891155]], z: [[0.004151084966816, 4.089939635545, -0.01290686414666], [0.0006260521444113, 1.446188898627, 3.55155229498], [0.0000352747346169, 2.125628703458, 0.00012727416567]], zeta: [[0.0003142172466014, 2.796421972292, -0.002315096098], [0.0000904169207946, 1.047706187963, -0.00056920638196]]},
  {mu: 2.824832743929e-7, al: [-0.3735263437471, 1.769322711123], a: [[0.004487103780431, 0, 0], [4.324367498e-7, 1.819645606291, 1.782229577757]], l: [[0.0008576433172936, 4.318869317826, 0.01303413830805], [0.0004549582875086, 1.493653175108, 0.01293892881962], [0.0003248939825174, 1.819649453346, 1.782229577757], [-0.0003074250079334, 4.937703700591, 0.01358483286724], [0.0001982386144784, 1.907986905476, 0.00305101212869], [0.0001834063551804, 2.140285338853, 0.00145009789338], [-0.0001434383188452, 5.622214036663, 0.8911147888784], [-0.0000771939140944, 4.300272437235, 2.673344370427]], z: [[-0.009358910413634, 4.089939650904, -0.01290686414666], [0.0002988994545555, 5.90972651856, 1.769322707946], [0.000213903639035, 2.125628930002, 0.00012727418407], [0.0001980963564781, 2.743516829265, 0.00067797343009], [0.0001210388158965, 5.58399437112, 0.0000320566149], [0.0000837042048393, 1.609453836804, -0.9040216580885], [0.0000823525166369, 1.446188770869, 3.55155229498]], zeta: [[0.00404049178323, 1.047706316943, -0.0005692064054], [0.0002200421034564, 3.336885786436, -0.00012491307307], [0.0001662544744719, 2.413486237471, 0], [0.0000590282470983, 5.971993096837, -0.00003056160225]]},
  {mu: 2.824981841847e-7, al: [0.2874089391143, 0.8782079235893], a: [[0.007156659457258, 0, 0], [0.000001393029911, 1.158674588498, 2.673344370427]], l: [[0.0002310797886226, 2.140298719594, 0.00145009784384], [-0.0001828635964118, 4.318867273697, 0.01303413828263], [0.0001512378778204, 4.93731023723, 0.01358483481252], [-0.0001163720969778, 4.300265986149, 2.673344370427], [-0.0000955478069846, 1.493661284257, 0.01293892879857], [0.0000815246854464, 5.622213713254, 0.8911147888784], [-0.0000801219679602, 1.299592295153, 1.003443345673], [-0.0000607017260182, 0.6497876966924, 0.5017216704326]], z: [[0.001428981130732, 2.125629594274, 0.00012727413029], [0.000771093122676, 5.58363300035, 0.0000320643411], [0.0005925911780766, 4.089939663645, -0.01290686414666], [0.0002045597496146, 5.271368367037, -0.1252354407611], [0.0001785118648258, 0.2874315672106, 0.8782079244252], [0.0001131999784893, 1.446212727782, 3.55155229498], [-0.000065877816921, 2.270242399099, -1.795136439454], [0.0000497058888328, 5.909679220486, 1.769322712929]], zeta: [[0.001593272157085, 3.336886279666, -0.00012491307058], [0.0008533093128905, 2.413388168817, 0], [0.0003513347911037, 5.972078985013, -0.00003056101771], [-0.0001441929255483, 1.047706176444, -0.00056920632124]]},
  {mu: 2.824921448899e-7, al: [-0.3620341291376, 0.3764862334338], a: [[0.01258797017153, 0, 0], [0.000003595204947, 0.6496577600712, 0.5017216816503], [0.0000027580210652, 1.808423578151, 3.175066041336]], l: [[0.0005586040123824, 2.140420718981, 0.00145009793231], [-0.0003805813868176, 2.735884489785, 0.00002972965062], [0.0002205152863262, 0.649796525964, 0.5017216724358], [0.0001877895151158, 1.8084787604, 3.175066041336], [0.0000766916975242, 6.272011431975, 1.392836463665], [0.0000747056855106, 1.299591620234, 1.003443345673]], z: [[0.007375580846798, 5.583607157608, 0.00003206509914], [0.0002065924169942, 5.920983156579, 0.376486241947], [0.0001589869764021, 0.2874400624262, 0.8782079244252], [-0.0001561131605348, 2.125739786509, 0.00012727441285], [0.0001486043380971, 1.446213430102, 3.55155229498], [0.0000635073108731, 5.909680328595, 1.769322712929], [0.0000599351698525, 4.11255175848, -2.798579795459], [0.0000540660842731, 5.539035084557, 0.00286834082283], [-0.0000489596900866, 4.621814948334, -0.6269571252952]], zeta: [[0.00384229778985, 2.413392208556, 0], [0.002245389179189, 5.972173677328, -0.00003056125525], [-0.0002604479450559, 3.336874630641, -0.00012491309972], [0.000033211214323, 5.560413774234, 0.00290037688507]]}];

// Jupiter equatorial system -> Earth equatorial J2000 (astronomy-engine convention: applied transposed, see moonVec)
const JUP_EQJ = [
  [9.99432765338654e-1, -3.36771074697641e-2, 0],
  [3.03959428906285e-2, 9.02057912352809e-1, 4.30543388542295e-1],
  [-1.44994559663353e-2, -4.30299169409101e-1, 9.02569881273754e-1],
]
const PI2 = Math.PI * 2
export const MOON_NAMES = ['Io', 'Europa', 'Ganymede', 'Callisto']
/** Equatorial radius of Jupiter, km. */
export const JUPITER_RADIUS_KM = 71492
export const AU_KM = 149597870.7

function moonVec(t: number, m: Model): [number, number, number] {
  let A = 0, AL = m.al[0] + t * m.al[1], K = 0, H = 0, Q = 0, P = 0
  for (const [amp, ph, fr] of m.a) A += amp * Math.cos(ph + t * fr)
  for (const [amp, ph, fr] of m.l) AL += amp * Math.sin(ph + t * fr)
  AL %= PI2
  if (AL < 0) AL += PI2
  for (const [amp, ph, fr] of m.z) { const g = ph + t * fr; K += amp * Math.cos(g); H += amp * Math.sin(g) }
  for (const [amp, ph, fr] of m.zeta) { const g = ph + t * fr; Q += amp * Math.cos(g); P += amp * Math.sin(g) }
  // elements -> position (FORTRAN ELEM2PV, IMCCE)
  let EE = AL + K * Math.sin(AL) - H * Math.cos(AL), CE: number, SE: number, DE: number
  do {
    CE = Math.cos(EE); SE = Math.sin(EE)
    DE = (AL - EE + K * SE - H * CE) / (1 - K * CE - H * SE)
    EE += DE
  } while (Math.abs(DE) >= 1e-12)
  CE = Math.cos(EE); SE = Math.sin(EE)
  const DLE = H * CE - K * SE, PSI = 1 / (1 + Math.sqrt(1 - K * K - H * H))
  const X1 = A * (CE - K - PSI * H * DLE), Y1 = A * (SE - H + PSI * K * DLE)
  const F2 = 2 * Math.sqrt(1 - Q * Q - P * P), P2 = 1 - 2 * P * P, Q2 = 1 - 2 * Q * Q, PQ = 2 * P * Q
  const x = X1 * P2 + Y1 * PQ, y = X1 * PQ + Y1 * Q2, z = (Q * Y1 - X1 * P) * F2
  return [JUP_EQJ[0][0] * x + JUP_EQJ[1][0] * y + JUP_EQJ[2][0] * z, JUP_EQJ[0][1] * x + JUP_EQJ[1][1] * y + JUP_EQJ[2][1] * z, JUP_EQJ[0][2] * x + JUP_EQJ[1][2] * y + JUP_EQJ[2][2] * z]
}

/** Io, Europa, Ganymede, Callisto relative to the centre of Jupiter, equatorial J2000, in AU. `jde` = Julian Ephemeris Day of the moment the light left them. */
export function galileanVectors(jde: number): [number, number, number][] {
  const t = jde - 2433282.5 // days since 1950-01-01
  return MODEL.map((m) => moonVec(t, m))
}

export interface JupMoon { /** Jupiter radii, positive towards the WEST on the sky (right when north is up) */ x: number; /** Jupiter radii, positive towards the north pole */ y: number; /** Jupiter radii towards the Earth (> 0: in front of the planet) */ z: number }
/**
 * Moons as Meeus (chapter 44) tabulates them: X west, Y north (of Jupiter's pole direction), Z towards the Earth, in Jupiter radii.
 * `earthDir` = unit vector Earth -> Jupiter (J2000 equatorial), `jde` already corrected for light time.
 */
export function galileanMoons(jde: number, earthDir: [number, number, number]): JupMoon[] {
  const ra = 268.057 * Math.PI / 180, de = 64.495 * Math.PI / 180 // Jupiter's north pole, J2000
  const p = [Math.cos(de) * Math.cos(ra), Math.cos(de) * Math.sin(ra), Math.sin(de)], u = earthDir
  const dp = p[0] * u[0] + p[1] * u[1] + p[2] * u[2]
  let n = [p[0] - dp * u[0], p[1] - dp * u[1], p[2] - dp * u[2]]
  const nn = Math.hypot(n[0], n[1], n[2]); n = n.map((c) => c / nn)
  const w = [u[1] * n[2] - u[2] * n[1], u[2] * n[0] - u[0] * n[2], u[0] * n[1] - u[1] * n[0]] // west
  const rj = JUPITER_RADIUS_KM / AU_KM
  return galileanVectors(jde).map((v) => ({
    x: (v[0] * w[0] + v[1] * w[1] + v[2] * w[2]) / rj,
    y: (v[0] * n[0] + v[1] * n[1] + v[2] * n[2]) / rj,
    z: -(v[0] * u[0] + v[1] * u[1] + v[2] * u[2]) / rj,
  }))
}
