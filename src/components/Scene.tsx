import { Canvas, useFrame } from '@react-three/fiber'
import { Line, OrbitControls } from '@react-three/drei'
import { useMemo, useRef, useState } from 'react'
import { hideSplash } from '@/native'
import { FEATURE_SCENE_LAYERS } from '@/features'
import * as THREE from 'three'
import {
  AU, BODIES, BODY_IDS, DAY, MASS_RATIO_EM, MASS_RATIO_SE, MU_EARTH, R_MOON, R_SUN, RE,
  bodyElements, bodyState, collinearGammas, cross, ellipsePoints, gmst, keplerE,
  lagrangePoints, moonGeo, moonGeoVel, mul, norm, perifocalBasis, sunGeo, unit,
  type BodyId, type EarthPlan, type MoonPlan, type Vec,
} from '@/lib/astro'
import { craftPosition, eventPosition, samplePath, type Solution } from '@/lib/mga'
import { labels } from '@/lib/labels'
import { clock, selectedSolution, shipSolution, useApp, type View } from '@/lib/store'
import { useUi } from '@/lib/ui-store'
import { ExtraObjects } from './ExtraObjects'
import { FlybyScene } from './Flyby3D'
import { GalaxyScene } from './Galaxy'
import { SystemScene } from './PlanetSystem'
import { EarthBody, useEarthConfig } from '@/features/earth/EarthBody'
import { useSurfaceZoom } from '@/features/earth/EarthTiles'
import { EarthOverlays } from '@/features/earth/EarthOverlays'
import { CameraInit, Dot, EARLY, Follow, Label, Occluder, PanelOffset, Starfield, dotTex, useTexture, v3 } from './kit'

const S_SOL = 1e-6 // scene units per km (solar view: 1 unit = 1 million km)
const S_EAR = 1e-3 // earth views: 1 unit = 1000 km
import TEX_MOON from '@/assets/moon.jpg'
const LEG_COLORS = ['#22d3ee', '#c084fc', '#f472b6']

// ======================================================================= Solar system
function Planet({ id, mag, label }: { id: BodyId; mag: number; label: boolean }) {
  const b = BODIES[id]
  const ref = useRef<THREE.Group>(null)
  useFrame(() => { v3(bodyState(id, clock.t).r, S_SOL, ref.current!.position) }, EARLY)
  return (
    <group ref={ref}>
      <mesh scale={b.radius * S_SOL * mag}>
        <sphereGeometry args={[1, 32, 16]} />
        <meshStandardMaterial color={b.color} roughness={0.9} />
      </mesh>
      {id === 'saturn' && (
        <mesh scale={b.radius * S_SOL * mag} rotation={[-Math.PI / 2 + 0.47, 0, 0]}>
          <ringGeometry args={[1.24, 2.27, 64]} />
          <meshBasicMaterial color="#d8c7a0" side={THREE.DoubleSide} transparent opacity={0.55} />
        </mesh>
      )}
      <Dot color={b.color} size={id === 'ceres' ? 5 : 7} />
      {label && <Label className="cl-lo">{b.name}</Label>}
    </group>
  )
}

function PlanetOrbit({ id }: { id: BodyId }) {
  const pts = useMemo(() => {
    const k = bodyElements(id, clock.t)
    return ellipsePoints(k.a, k.e, k.i, k.O, k.w, 360).map((p) => v3(p, S_SOL))
  }, [id])
  return <Line points={pts} color={BODIES[id].color} lineWidth={1.2} transparent opacity={id === 'ceres' ? 0.45 : 0.6} />
}

function Sun({ mag, label }: { mag: number; label: boolean }) {
  const s = R_SUN * S_SOL * Math.min(mag, 10)
  return (
    <group>
      <mesh scale={s}>
        <sphereGeometry args={[1, 48, 24]} />
        <meshBasicMaterial color="#ffd27a" />
      </mesh>
      <sprite scale={[Math.max(6, s * 8), Math.max(6, s * 8), 1]}>
        <spriteMaterial map={dotTex()} color="#ffb347" transparent opacity={0.55} depthWrite={false} blending={THREE.AdditiveBlending} />
      </sprite>
      <Dot color="#ffd27a" size={10} />
      {label && <Label className="cl-lo">Zon</Label>}
    </group>
  )
}

/** Main belt (with Kirkwood gaps) + Jupiter Trojans, each point a Keplerian orbit. */
function Belt() {
  const { geo, el } = useMemo(() => {
    const rnd = Math.random
    const gaps = [2.5, 2.82, 2.95, 3.27]
    const rows: number[][] = []
    while (rows.length < 3000) {
      const a = 2.1 + rnd() * 1.2
      if (gaps.some((g) => Math.abs(a - g) < 0.02)) continue
      rows.push([a, rnd() * 0.2, Math.abs(gauss()) * 7 * DEG_, rnd() * 360, rnd() * 360, rnd() * 360])
    }
    const Lj = 34.396 + 3034.746 * (clock.t / (36525 * DAY)) // Jupiter mean longitude (deg)
    for (let k = 0; k < 700; k++) {
      const wbar = rnd() * 360, O = rnd() * 360
      const L = Lj + (k % 2 ? 60 : -60) + gauss() * 9
      rows.push([5.2026 + gauss() * 0.03, rnd() * 0.08, Math.abs(gauss()) * 12 * DEG_, O, wbar - O, L - wbar])
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(rows.length * 3), 3))
    // row: a(AU), e, i(rad), Ω(deg), ω(deg), M(deg) at clock.t
    return { geo: g, el: rows.map((r) => ({ a: r[0] * AU, e: r[1], i: r[2], O: r[3] * DEG_, w: r[4] * DEG_, M0: r[5] * DEG_, n: Math.sqrt(1.32712440018e11 / (r[0] * AU) ** 3), t0: clock.t })) }
  }, [])
  useFrame(() => {
    const arr = geo.attributes.position.array as Float32Array
    for (let k = 0; k < el.length; k++) {
      const o = el[k]
      const E = keplerE(o.M0 + o.n * (clock.t - o.t0), o.e)
      const x = o.a * (Math.cos(E) - o.e), y = o.a * Math.sqrt(1 - o.e * o.e) * Math.sin(E)
      const cO = Math.cos(o.O), sO = Math.sin(o.O), cw = Math.cos(o.w), sw = Math.sin(o.w), ci = Math.cos(o.i), si = Math.sin(o.i)
      const X = (cO * cw - sO * sw * ci) * x + (-cO * sw - sO * cw * ci) * y
      const Y = (sO * cw + cO * sw * ci) * x + (-sO * sw + cO * cw * ci) * y
      const Z = sw * si * x + cw * si * y
      arr[k * 3] = X * S_SOL; arr[k * 3 + 1] = Z * S_SOL; arr[k * 3 + 2] = -Y * S_SOL
    }
    geo.attributes.position.needsUpdate = true
  }, EARLY)
  return (
    <points geometry={geo} frustumCulled={false}>
      <pointsMaterial size={2.4} sizeAttenuation={false} color="#cdb893" map={dotTex()} transparent opacity={0.85} depthWrite={false} alphaTest={0.05} />
    </points>
  )
}
const DEG_ = Math.PI / 180
function gauss() { return Math.sqrt(-2 * Math.log(Math.random() + 1e-12)) * Math.cos(2 * Math.PI * Math.random()) }

/** labelNear [n, d]: labels of the first n points only appear once the camera is within d scene units.
 *  lift: indices whose label sits above the dot instead of beside it (room for a neighbour's label). */
function LagrangeMarkers({ get, names, color, scale, labels, labelNear, lift = [] }: {
  get: (t: number) => Vec[]; names: string[]; color: string; scale: number; labels: boolean; labelNear?: [number, number]; lift?: number[]
}) {
  const refs = useRef<(THREE.Group | null)[]>([])
  const [near, setNear] = useState(!labelNear)
  useFrame(({ camera }) => {
    get(clock.t).forEach((p, i) => { if (refs.current[i]) v3(p, scale, refs.current[i]!.position) })
    if (labelNear && refs.current[0]) {
      const n = camera.position.distanceTo(refs.current[0].position) < labelNear[1]
      if (n !== near) setNear(n)
    }
  }, EARLY)
  return (
    <>
      {names.map((n, i) => (
        <group key={n} ref={(g) => { refs.current[i] = g }}>
          <Dot color={color} size={6} />
          {labels && (near || !labelNear || i >= labelNear[0]) && <Label className={`cl-lo text-[10px] text-pink-100 ${lift.includes(i) ? '-mt-7' : ''}`}>{n}</Label>}
        </group>
      ))}
    </>
  )
}

const fmtEventDate = (t: number) => new Date(946728000000 + t * 1000).toISOString().slice(0, 10)

/** One spacecraft's selected route. The active ship gets the coloured legs and the event labels; the others a dashed path in their own colour. */
function Trajectory({ sol, label, name, color, active }: { sol: Solution; label: boolean; name: string; color: string; active: boolean }) {
  const path = useMemo(() => samplePath(sol), [sol])
  const legPts = useMemo(
    () => sol.legs.map((_, k) => path.pts.filter((_, i) => path.legIdx[i] === k).map((p) => v3(p, S_SOL))),
    [sol, path],
  )
  const traveled = useMemo(
    () => new THREE.Line(new THREE.BufferGeometry().setFromPoints(path.pts.map((p) => v3(p, S_SOL))), new THREE.LineBasicMaterial({ color })),
    [path, color],
  )
  const craft = useRef<THREE.Group>(null)
  useFrame(() => {
    let lo = 0, hi = path.ts.length
    while (lo < hi) { const m = (lo + hi) >> 1; if (path.ts[m] <= clock.t) lo = m + 1; else hi = m }
    traveled.geometry.setDrawRange(0, lo)
    v3(craftPosition(sol, clock.t), S_SOL, craft.current!.position)
  }, EARLY)
  const eventPos = (k: number): Vec => eventPosition(sol, k)
  return (
    <>
      {legPts.map((pts, k) => (
        <Line key={k} points={pts} color={active ? LEG_COLORS[k % 3] : color} lineWidth={active ? 1.8 : 1.2} dashed dashSize={3} gapSize={2} transparent opacity={active ? 1 : 0.75} />
      ))}
      <primitive object={traveled} />
      {active && sol.events.map((e, k) => (
        <group key={k} position={v3(eventPos(k), S_SOL)}>
          <Dot color={e.kind === 'flyby' ? '#c084fc' : e.kind === 'dsm' ? '#fbbf24' : '#f8fafc'} size={e.kind === 'dsm' ? 6 : 8} />
          {label && (
            // above the dot, so the craft label (below it) never covers it; cl-ev = hidden when it would overlap another event label
            <Label className="cl-ev -mt-12 border border-white/10">
              <b>{e.kind === 'launch' ? 'Lancering' : e.kind === 'flyby' ? `Gravity assist ${BODIES[e.body].name}` : e.kind === 'dsm' ? 'Manoeuvre in de ruimte' : `Aankomst ${BODIES[e.body].name}`}</b>
              <br />Δv {e.dv.toFixed(2)} km/s{e.kind === 'dsm' ? '' : ` · v∞ ${e.vinf.toFixed(2)} km/s`}
              <br />{fmtEventDate(e.t)}
            </Label>
          )}
        </group>
      ))}
      <group ref={craft}>
        <Dot color={color} size={active ? 11 : 8} />
        {label && (
          <Label className={`${active ? 'cl-s0' : 'cl-s1'} mt-3 bg-transparent p-0 backdrop-blur-none`}>
            <span className={`rounded-md px-1.5 py-0.5 text-black ${active ? 'text-[11px] font-semibold' : 'text-[10px] font-medium'}`} style={{ background: color }}>{name}</span>
          </Label>
        )}
      </group>
    </>
  )
}

function SolarScene({ cam }: { cam: [number, number, number] }) {
  const [camPos] = useState(() => new THREE.Vector3(...cam))
  const mag = useApp((s) => (s.trueScale ? 1 : s.magnify))
  const labels = useApp((s) => s.showLabels)
  const belt = useApp((s) => s.showBelt)
  const lagr = useApp((s) => s.showLagrange)
  const follow = useApp((s) => s.follow)
  const sol = useApp(selectedSolution)
  const ships = useApp((s) => s.ships)
  const active = useApp((s) => s.active)
  const get = useMemo(() => {
    const out = new THREE.Vector3()
    if (follow === 'craft' && sol) return () => v3(craftPosition(sol, clock.t), S_SOL, out)
    if (follow in BODIES) return () => v3(bodyState(follow as BodyId, clock.t).r, S_SOL, out)
    return null
  }, [follow, sol])
  const seLagrange = useMemo(() => (t: number) => { const s = bodyState('earth', t); return lagrangePoints(s.r, s.v, MASS_RATIO_SE) }, [])
  return (
    <>
      <CameraInit pos={camPos} />
      <ambientLight intensity={0.15} />
      <pointLight position={[0, 0, 0]} intensity={2.4} decay={0} />
      <Sun mag={mag} label={labels} />
      {BODY_IDS.map((id) => <PlanetOrbit key={id} id={id} />)}
      {BODY_IDS.map((id) => <Planet key={id} id={id} mag={mag} label={labels} />)}
      {belt && <Belt />}
      <ExtraObjects mag={mag} labels={labels} />
      {lagr && <LagrangeMarkers get={seLagrange} names={['Zon–Aarde L1', 'Zon–Aarde L2', 'Zon–Aarde L3', 'Zon–Aarde L4', 'Zon–Aarde L5']} color="#f472b6" scale={S_SOL} labels={labels} labelNear={[2, 60]} />}
      {ships.map((sh, i) => {
        const shSol = i === active ? sol : shipSolution(sh) // the flat store fields hold the active ship's live solutions
        return shSol && <Trajectory key={sh.id} sol={shSol} label={labels} name={sh.name} color={sh.color} active={i === active} />
      })}
      <Follow get={get} />
    </>
  )
}

/** Labels tagged cl-s0 (active craft) > cl-ev (events) > cl-s1 (other craft) > cl-lo (names of bodies, sites, Lagrange points)
 *  take part in de-cluttering: a label whose box overlaps an already placed one of equal or higher priority is hidden.
 *  (Event labels sit above their dot and craft labels below it, so the active craft never hides its own launch label.) */
const PRIO: Record<string, number> = { 'cl-s0': 0, 'cl-ev': 1, 'cl-s1': 2, 'cl-lo': 3 }
type Box = { el: HTMLDivElement; prio: number; x0: number; y0: number; x1: number; y1: number }

/** Projects every label anchor to screen space (like kit's LabelProjector) and hides labels that would overlap. */
function LabelProjector() {
  useFrame(({ camera, size }) => {
    const shown: Box[] = []
    for (const e of labels.all()) {
      if (!e.el) continue
      const p = e.obj.getWorldPosition(tmpA)
      let hidden = false
      if (e.occluder) {
        const c = camera.position, R = e.occluder
        const d = tmpB.copy(p).sub(c), L = d.length()
        d.divideScalar(L)
        const tca = -c.dot(d), d2 = c.lengthSq() - tca * tca
        hidden = tca > 0 && d2 < R * R && tca - Math.sqrt(R * R - d2) < L * 0.999
      }
      p.project(camera)
      if (p.z > 1 || hidden) { e.el.style.opacity = '0'; continue }
      e.el.style.opacity = '1'
      const x = ((p.x + 1) / 2) * size.width, y = ((1 - p.y) / 2) * size.height
      e.el.style.transform = `translate(${x}px, ${y}px)`
      const m = e.className?.match(/cl-(ev|s0|s1|lo)/), inner = e.el.firstElementChild as HTMLElement | null
      if (m && inner) { // offsetLeft/Top include the label's margins; transforms do not invalidate layout, so this is cheap
        const x0 = x + inner.offsetLeft, y0 = y + inner.offsetTop
        shown.push({ el: e.el, prio: PRIO[m[0]], x0, y0, x1: x0 + inner.offsetWidth, y1: y0 + inner.offsetHeight })
      }
    }
    shown.sort((a, b) => a.prio - b.prio)
    const placed: Box[] = []
    for (const l of shown) {
      if (placed.some((q) => l.x0 < q.x1 + 4 && l.x1 > q.x0 - 4 && l.y0 < q.y1 + 2 && l.y1 > q.y0 - 2)) l.el.style.opacity = '0'
      else placed.push(l)
    }
  })
  return null
}
const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3()

// ======================================================================= Earth / Earth–Moon
/** World-space unit vector towards the Sun (same direction as SunLight). */
const sunWorld = (out: THREE.Vector3) => v3(unit(sunGeo(clock.t)), 1, out)

function Globe({ lat, lon, siteName, label }: { lat: number; lon: number; siteName: string; label: boolean }) {
  const ref = useRef<THREE.Group>(null)
  const { layers } = useEarthConfig()
  useSurfaceZoom(RE * S_EAR)
  useFrame(() => { ref.current!.rotation.y = gmst(clock.t) }, EARLY)
  const R = RE * S_EAR
  const site = new THREE.Vector3(Math.cos(lat * DEG_) * Math.cos(lon * DEG_), Math.sin(lat * DEG_), -Math.cos(lat * DEG_) * Math.sin(lon * DEG_)).multiplyScalar(R * 1.003)
  const eq = useMemo(() => Array.from({ length: 129 }, (_, k) => new THREE.Vector3(Math.cos((k / 64) * Math.PI) * R * 1.004, 0, Math.sin((k / 64) * Math.PI) * R * 1.004)), [R])
  return (
    <>
      <group ref={ref}>
        <EarthBody radius={R} sunDir={sunWorld} />
        <EarthOverlays radius={R} layers={layers} />
        <group position={site}>
          <Dot color="#ef4444" size={9} />
          {label && <Label className="cl-lo bg-red-600/80">{siteName}</Label>}
        </group>
      </group>
      <Line points={eq} color="#94a3b8" lineWidth={0.8} transparent opacity={0.35} />
      <Line points={[[0, -R * 1.35, 0], [0, R * 1.35, 0]]} color="#94a3b8" lineWidth={1} transparent opacity={0.5} />
    </>
  )
}

/** Sets a group's matrix to the orbit's perifocal basis (x→perigee, y→velocity at perigee, z→h). */
function setBasis(g: THREE.Object3D, i: number, O: number, w: number, s: number) {
  const { P, Q, W } = perifocalBasis(i, O, w)
  g.matrix.makeBasis(v3(P, s), v3(Q, s), v3(W, s))
  g.matrixWorldNeedsUpdate = true
}

function SatelliteOrbit({ plan, label }: { plan: EarthPlan; label: boolean }) {
  const target = useRef<THREE.Group>(null), park = useRef<THREE.Group>(null), sat = useRef<THREE.Group>(null)
  const altRef = useRef<HTMLSpanElement>(null)
  const b = plan.a * Math.sqrt(1 - plan.e ** 2)
  const ellipse = useMemo(() => Array.from({ length: 361 }, (_, k) => {
    const E = (k / 180) * Math.PI
    return new THREE.Vector3(plan.a * (Math.cos(E) - plan.e), plan.a * Math.sqrt(1 - plan.e ** 2) * Math.sin(E), 0)
  }), [plan.a, plan.e])
  const parkPts = useMemo(() => Array.from({ length: 181 }, (_, k) => new THREE.Vector3(plan.rPark * Math.cos((k / 90) * Math.PI), plan.rPark * Math.sin((k / 90) * Math.PI), 0)), [plan.rPark])
  const transfer = useMemo(() => {
    const aT = (plan.rPark + plan.ra) / 2, eT = (plan.ra - plan.rPark) / (plan.ra + plan.rPark)
    return Array.from({ length: 91 }, (_, k) => {
      const E = (k / 90) * Math.PI
      return new THREE.Vector3(aT * (Math.cos(E) - eT), aT * Math.sqrt(1 - eT * eT) * Math.sin(E), 0)
    })
  }, [plan.rPark, plan.ra])
  const showTransfer = Math.abs(plan.ra - plan.rPark) > 1
  const n = Math.sqrt(MU_EARTH / plan.a ** 3)
  let frame = 0
  useFrame(() => {
    const dt = clock.t - plan.t0
    setBasis(target.current!, plan.iT, plan.O0 + plan.rates.dO * dt, plan.w0 + plan.rates.dw * dt, S_EAR)
    setBasis(park.current!, plan.iL, plan.O0, plan.uPark, S_EAR)
    const E = keplerE(n * dt, plan.e)
    sat.current!.position.set(plan.a * (Math.cos(E) - plan.e), b * Math.sin(E), 0)
    if (altRef.current && frame++ % 6 === 0) {
      altRef.current.textContent = `${(plan.a * (1 - plan.e * Math.cos(E)) - RE).toFixed(0)} km`
    }
  }, EARLY)
  return (
    <>
      <group ref={park} matrixAutoUpdate={false}>
        {showTransfer && <Line points={parkPts} color="#64748b" lineWidth={1} transparent opacity={0.6} />}
        {showTransfer && <Line points={transfer} color="#f59e0b" lineWidth={1.4} dashed dashSize={600} gapSize={400} />}
      </group>
      <group ref={target} matrixAutoUpdate={false}>
        <Line points={ellipse} color="#22d3ee" lineWidth={1.8} />
        <group ref={sat}>
          <Dot color="#fde047" size={10} />
          {label && <Label className="cl-s0 bg-yellow-500/80 text-black">Satelliet · <span ref={altRef} /></Label>}
        </group>
      </group>
    </>
  )
}

function MoonSystem({ label, moonLabel, lagr, moonPlan }: { label: boolean; moonLabel: boolean; lagr: boolean; moonPlan: MoonPlan | null }) {
  const tex = useTexture(TEX_MOON)
  const moon = useRef<THREE.Mesh>(null), moonLbl = useRef<THREE.Group>(null), craft = useRef<THREE.Group>(null)
  const orbit = useMemo(() => new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: '#94a3b8', transparent: true, opacity: 0.5 })), [])
  const lastOrbitT = useRef(-Infinity)
  const emL = useMemo(() => (t: number) => lagrangePoints(moonGeo(t), moonGeoVel(t), MASS_RATIO_EM), [])
  const seL = useMemo(() => {
    const { g1, g2 } = collinearGammas(MASS_RATIO_SE)
    return (t: number) => { const s = sunGeo(t), d = norm(s), u = unit(s); return [mul(u, d * g1), mul(u, -d * g2)] }
  }, [])
  const transfer = useMemo(() => {
    if (!moonPlan) return null
    const rm = moonGeo(moonPlan.tArr), W = unit(cross(rm, moonGeoVel(moonPlan.tArr)))
    const P = mul(unit(rm), -1), Q = cross(W, P)
    const e = (moonPlan.rMoon - moonPlan.rPark) / (moonPlan.rMoon + moonPlan.rPark)
    const pts = Array.from({ length: 91 }, (_, k) => {
      const E = (k / 90) * Math.PI
      const x = moonPlan.a * (Math.cos(E) - e), y = moonPlan.a * Math.sqrt(1 - e * e) * Math.sin(E)
      return v3([P[0] * x + Q[0] * y, P[1] * x + Q[1] * y, P[2] * x + Q[2] * y], S_EAR)
    })
    return { pts, P, Q, e }
  }, [moonPlan])
  useFrame(() => {
    const t = clock.t, m = moonGeo(t)
    v3(m, S_EAR, moon.current!.position)
    moonLbl.current!.position.copy(moon.current!.position)
    moon.current!.lookAt(0, 0, 0)
    moon.current!.rotateY(-Math.PI / 2)
    if (Math.abs(t - lastOrbitT.current) > 0.5 * DAY) {
      lastOrbitT.current = t
      orbit.geometry.setFromPoints(Array.from({ length: 181 }, (_, k) => v3(moonGeo(t + ((k - 90) / 90) * 13.66 * DAY), S_EAR)))
    }
    if (moonPlan && transfer && craft.current) {
      const inside = t >= moonPlan.tDep && t <= moonPlan.tArr
      craft.current.visible = inside
      if (inside) {
        const E = keplerE(Math.sqrt(MU_EARTH / moonPlan.a ** 3) * (t - moonPlan.tDep), transfer.e)
        const x = moonPlan.a * (Math.cos(E) - transfer.e), y = moonPlan.a * Math.sqrt(1 - transfer.e ** 2) * Math.sin(E)
        v3(add3(mul(transfer.P, x), mul(transfer.Q, y)), S_EAR, craft.current.position)
      }
    }
  }, EARLY)
  return (
    <>
      <mesh ref={moon} scale={R_MOON * S_EAR}>
        <sphereGeometry args={[1, 64, 32]} />
        <meshStandardMaterial key={tex ? 'tex' : 'plain'} map={tex} color={tex ? '#ffffff' : '#9ca3af'} roughness={1} />
      </mesh>
      <group ref={moonLbl}>
        <Dot color="#d1d5db" size={8} />
        {moonLabel && <Label className="cl-lo font-semibold">Maan</Label>}
      </group>
      <primitive object={orbit} />
      {lagr && <LagrangeMarkers get={emL} names={['L1', 'L2', 'Aarde–Maan L3', 'L4', 'L5']} color="#fbbf24" scale={S_EAR} labels={label} lift={[0]} />}
      {lagr && <LagrangeMarkers get={seL} names={['Zon–Aarde L1 (1,5 mln km)', 'Zon–Aarde L2 (1,5 mln km)']} color="#f472b6" scale={S_EAR} labels={label} />}
      {transfer && <Line points={transfer.pts} color="#f59e0b" lineWidth={1.6} dashed dashSize={8} gapSize={5} />}
      {transfer && (
        <group ref={craft}>
          <Dot color="#fde047" size={10} />
          {label && <Label className="cl-s0 bg-yellow-500/80 text-black">Ruimtevaartuig</Label>}
        </group>
      )}
    </>
  )
}
const add3 = (a: Vec, b: Vec): Vec => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]

function SunLight() {
  const ref = useRef<THREE.DirectionalLight>(null)
  useFrame(() => { v3(unit(sunGeo(clock.t)), 1000, ref.current!.position) }, EARLY)
  return <directionalLight ref={ref} intensity={2.6} />
}

function EarthScene({ withMoon, plan, lat, lon, siteName, moonPlan }: {
  withMoon: boolean; plan: EarthPlan | null; lat: number; lon: number; siteName: string; moonPlan: MoonPlan | null
}) {
  const labels = useApp((s) => s.showLabels)
  const lagr = useApp((s) => s.showLagrange)
  const emCam = useApp((s) => s.emCam)
  const ra = plan?.ra
  // Open on the day side, at a distance that frames the orbit; Earth–Moon: the Moon's orbit, or (emCam 'l12') side-on to
  // the Sun line and far enough out that Sun–Earth L1 and L2 (±1.5 mln km) are both in view.
  const camPos = useMemo(() => {
    const sun = v3(unit(sunGeo(clock.t)), 1)
    if (withMoon)
      return sun.clone().cross(new THREE.Vector3(0, 1, 0)).normalize().add(new THREE.Vector3(0, 0.8, 0)).normalize().multiplyScalar(emCam.mode === 'l12' ? 3300 : 1000)
    return sun.add(new THREE.Vector3(0, 0.45, 0)).normalize().multiplyScalar(Math.max(26, 3.4 * (ra ?? RE) * S_EAR))
  }, [withMoon, ra, emCam])
  // Zoomed out beyond the Moon's orbit the satellite, the site and the Moon are sub-pixel: their labels only pile up.
  const [far, setFar] = useState(false)
  useFrame(({ camera }) => { const f = camera.position.length() > 1800; if (f !== far) setFar(f) })
  const near = labels && !far
  return (
    <Occluder.Provider value={RE * S_EAR}>
      <CameraInit pos={camPos} />
      <ambientLight intensity={0.22} />
      <SunLight />
      <Globe lat={lat} lon={lon} siteName={siteName} label={near} />
      {plan && <SatelliteOrbit plan={plan} label={near} />}
      {withMoon && <MoonSystem label={labels} moonLabel={near} lagr={lagr} moonPlan={moonPlan} />}
    </Occluder.Provider>
  )
}

// ======================================================================= Canvas
const CAMERAS: Record<View, [number, number, number]> = {
  solar: [0, 620, 900],
  earth: [0, 45, 95],
  earthmoon: [0, 550, 950],
  flyby: [0, 40, 80],
  system: [0, 30, 60],
  galaxy: [0, 30000, 70000],
}

export function Scene({ view, plan, lat, lon, siteName }: {
  view: View; plan: EarthPlan | null; lat: number; lon: number; siteName: string
}) {
  const sol = useApp(selectedSolution)
  const flybyIdx = useApp((s) => s.flybyIdx)
  const moonPlan = useApp((s) => s.moon)
  const showFlyby = view === 'flyby' && sol && sol.events[flybyIdx]?.kind === 'flyby'
  const camFit = useApp((s) => s.camFit)
  const skyOn = useUi((s) => s.tab === 'skyview') // the planetarium covers the 3D scene: stop rendering it behind
  const cam: [number, number, number] = view === 'solar' && camFit > 0 ? [0, camFit * 1.15, camFit * 1.55] : CAMERAS[view]
  return (
    <Canvas frameloop={skyOn ? 'never' : 'always'} onCreated={() => requestAnimationFrame(hideSplash)} dpr={[1, 1.5]} performance={{ min: 0.6 }} gl={{ logarithmicDepthBuffer: true, antialias: window.devicePixelRatio < 2, powerPreference: 'high-performance' }} camera={{ position: CAMERAS.solar, fov: 45, near: 1e-5, far: 1e7 }}>
      <color attach="background" args={['#04060b']} />
      {view !== 'galaxy' && <Starfield />}
      <PanelOffset />
      <LabelProjector />
      <group key={`${view}-${view === 'solar' ? camFit : 0}-${view === 'flyby' ? flybyIdx : 0}`}>
        {view === 'solar' && <SolarScene cam={cam} />}
        {(view === 'earth' || view === 'earthmoon') && (
          <EarthScene withMoon={view === 'earthmoon'} plan={plan} lat={lat} lon={lon} siteName={siteName} moonPlan={moonPlan} />
        )}
        {showFlyby && <FlybyScene sol={sol} idx={flybyIdx} />}
        {view === 'system' && <SystemScene />}
        {view === 'galaxy' && <GalaxyScene />}
      </group>
      {FEATURE_SCENE_LAYERS.map((Layer, i) => <Layer key={i} view={view} />)}
      <OrbitControls makeDefault enableDamping dampingFactor={0.08} minDistance={1e-4} maxDistance={2e4} zoomSpeed={2.5} />
    </Canvas>
  )
}
