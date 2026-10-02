// Flyby close-up: the planet (lit by the real Sun direction), the hyperbolic pass, v∞ arrows, the Sun and the other planets
// as seen from the flyby planet. Unit: 1 scene unit = 1 planet radius. Orientation: heliocentric ecliptic J2000 (via v3).
import { useFrame, useThree } from '@react-three/fiber'
import { Line } from '@react-three/drei'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { AU, BODIES, BODY_IDS, DEG, OBLIQUITY, bodyState, cross, fmtDuration, gmst, norm, sub, unit, type BodyId, type Vec } from '@/lib/astro'
import { flybyWindow, type Solution } from '@/lib/mga'
import { clock, useApp } from '@/lib/store'
import { CameraInit, Dot, EARLY, Label, Occluder, useTexture, v3 } from './kit'
import { haloTexture, planetTexture, ringTexture } from './planetTex'
import TEX_EARTH from '@/assets/earth.jpg'

/** North pole (RA, Dec in degrees, J2000 equatorial; IAU WGCCRE). */
const POLES: Record<BodyId, [number, number]> = {
  mercury: [281.01, 61.41], venus: [272.76, 67.16], earth: [0, 90], mars: [317.68, 52.89], ceres: [291.4, 66.8],
  jupiter: [268.06, 64.5], saturn: [40.59, 83.54], uranus: [257.31, -15.18], neptune: [299.36, 43.46], pluto: [132.99, -6.16],
}
/** Atmosphere halo colour and strength (0 = none). */
const HALO: Record<BodyId, [string, number]> = {
  mercury: ['#000000', 0], venus: ['#ffe6b0', 0.55], earth: ['#5aa2ff', 0.75], mars: ['#e8a070', 0.18], ceres: ['#000000', 0],
  jupiter: ['#f0d6b0', 0.28], saturn: ['#f0e0b0', 0.25], uranus: ['#8fe6ee', 0.4], neptune: ['#6f8fff', 0.4], pluto: ['#000000', 0],
}
const HALO_R = 1.3 // halo sprite radius in planet radii

function Planet({ id, sunDir }: { id: BodyId; sunDir: THREE.Vector3 }) {
  const photo = useTexture(TEX_EARTH)
  const procedural = useMemo(() => planetTexture(id), [id])
  const map = id === 'earth' ? photo : procedural
  const spin = useRef<THREE.Mesh>(null)
  const quat = useMemo(() => {
    const [ra, dec] = POLES[id]
    return new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(Math.cos(dec * DEG) * Math.cos(ra * DEG), Math.sin(dec * DEG), -Math.cos(dec * DEG) * Math.sin(ra * DEG)))
  }, [id])
  const ring = useMemo(() => {
    if (id !== 'saturn') return null
    const geo = new THREE.RingGeometry(1.24, 2.27, 128, 1), pos = geo.attributes.position, uv = geo.attributes.uv
    for (let i = 0; i < pos.count; i++) uv.setXY(i, (Math.hypot(pos.getX(i), pos.getY(i)) - 1.24) / (2.27 - 1.24), 0.5)
    return { geo, tex: ringTexture() }
  }, [id])
  const [halo, haloK] = [HALO[id][0], HALO[id][1]]
  const haloMap = useMemo(() => haloTexture(1 / HALO_R), [])
  useFrame(() => { if (id === 'earth' && spin.current) spin.current.rotation.y = gmst(clock.t) }, EARLY)
  const b = BODIES[id]
  return (
    <>
      <directionalLight position={sunDir.clone().multiplyScalar(50)} intensity={3.2} />
      <group rotation={[-OBLIQUITY, 0, 0]}>
      <group quaternion={quat}>
        <mesh ref={spin}>
          <sphereGeometry args={[1, 128, 64]} />
          <meshStandardMaterial key={map ? 'tex' : 'plain'} map={map} color={map ? '#ffffff' : b.color} roughness={id === 'earth' ? 0.85 : 1} metalness={0} />
        </mesh>
        {ring && (
          <mesh rotation={[-Math.PI / 2, 0, 0]} geometry={ring.geo}>
            <meshStandardMaterial map={ring.tex} transparent side={THREE.DoubleSide} roughness={1} depthWrite={false} />
          </mesh>
        )}
      </group>
      {haloK > 0 && (
        <sprite scale={[HALO_R * 2, HALO_R * 2, 1]}>
          <spriteMaterial map={haloMap} color={halo} transparent opacity={haloK} depthWrite={false} blending={THREE.AdditiveBlending} />
        </sprite>
      )}
      </group>
    </>
  )
}

/** Arrow with a fixed head; origin → origin + dir·len. */
const arrow = (origin: THREE.Vector3, dir: THREE.Vector3, len: number, color: number) =>
  new THREE.ArrowHelper(dir.clone().normalize(), origin, len, color, len * 0.16, len * 0.08)

/** Smallest camera distance along `dir` (looking at the origin) at which every point projects inside the part of the
 *  window not covered by the side panel, the right column, the control strip on top and the time bar. */
function fitDistance(dir: THREE.Vector3, pts: THREE.Vector3[], fov: number, W: number, H: number, start: number) {
  const cam = new THREE.PerspectiveCamera(fov, W / H)
  cam.filmOffset = W > 900 ? -(208 / W) * cam.getFilmWidth() : 0 // same as kit's PanelOffset
  cam.updateProjectionMatrix()
  const wide = W >= 768
  const x0 = -1 + (2 * (wide ? 430 : 16)) / W, x1 = 1 - (2 * (wide ? 400 : 110)) / W // right: column + room for a label
  const y0 = -1 + (2 * (wide ? 90 : 60)) / H, y1 = 1 - (2 * (W >= 1400 ? 180 : 130)) / H
  const v = new THREE.Vector3()
  let d = start
  for (let i = 0; i < 90; i++, d *= 1.07) {
    cam.position.copy(dir).multiplyScalar(d)
    cam.lookAt(0, 0, 0)
    cam.updateMatrixWorld()
    if (pts.every((p) => { v.copy(p).project(cam); return v.z < 1 && v.x > x0 && v.x < x1 && v.y > y0 && v.y < y1 })) break
  }
  return d
}

export function FlybyScene({ sol, idx }: { sol: Solution; idx: number }) {
  const ev = sol.events[idx], b = BODIES[ev.body]
  const { g, rMax, tWin } = useMemo(() => flybyWindow(sol, idx), [sol, idx])
  const s = 1 / b.radius, R = rMax * s
  const cam = useApp((x) => x.flybyCam)
  const size = useThree((x) => x.size)
  const path = useMemo(() => Array.from({ length: 401 }, (_, k) => v3(g.at(-tWin + (2 * tWin * k) / 400), s)), [g, tWin, s])
  const pBody = useMemo(() => bodyState(ev.body, ev.t).r, [ev])
  const sunDir = useMemo(() => v3(unit(pBody.map((x) => -x) as Vec), 1), [pBody])
  const sky = useMemo(() => {
    const D = R * 30 // far enough that orbiting the camera around the pass barely moves them
    const bodies = BODY_IDS.filter((id) => id !== ev.body && id !== 'ceres' && id !== 'pluto').map((id) => {
      const d = sub(bodyState(id, ev.t).r, pBody)
      return { id, pos: v3(unit(d), D), au: norm(d) / AU }
    })
    return { D, bodies, sunAu: norm(pBody) / AU }
  }, [ev, pBody, R])
  const trail = useRef<{ geometry: { instanceCount: number } }>(null)
  const craft = useRef<THREE.Group>(null)
  const tag = useRef<HTMLSpanElement>(null)
  const [inside, setInside] = useState(() => Math.abs(clock.t - ev.t) <= tWin)
  const insideRef = useRef(inside)
  const frame = useRef(0)
  const arrows = useMemo(() => {
    const L = R / 3, inV = v3(unit(ev.vinfIn!), 1), outV = v3(unit(ev.vinfOut!), 1)
    return {
      inA: arrow(path[0].clone().addScaledVector(inV, -L), inV, L, 0x22d3ee),
      outA: arrow(path[400], outV, L, 0xf472b6),
      sun: arrow(sunDir.clone().multiplyScalar(1.5), sunDir, Math.max(2, R * 0.28), 0xffb347),
      sunTip: sunDir.clone().multiplyScalar(1.5 + Math.max(2, R * 0.28)),
    }
  }, [ev, path, R, sunDir])
  const camPos = useMemo(() => {
    const W = v3(unit(cross(g.pHat, g.qHat)), 1)
    if (W.dot(sunDir) < 0) W.negate()
    const P = v3(g.pHat, 1)
    // wide/close: from the lit side, slightly above the orbit plane; sun: from behind the planet so the Sun and the other planets are in view
    const dir = cam.mode === 'sun'
      ? W.multiplyScalar(0.4).addScaledVector(sunDir, -0.9).addScaledVector(P, 0.15).normalize()
      : W.multiplyScalar(0.75).addScaledVector(sunDir, 0.45).addScaledVector(P, -0.3).normalize()
    if (cam.mode === 'close') return dir.multiplyScalar(Math.max(g.rp * s * 8, 8))
    // whole pass in view: the path, the v∞ arrows and the Sun arrow
    const pts = path.filter((_, k) => k % 4 === 0).concat(arrows.inA.position, arrows.sunTip, path[400].clone().addScaledVector(v3(unit(ev.vinfOut!), 1), R / 3))
    return dir.multiplyScalar(fitDistance(dir, pts, 45, size.width, size.height, R * 0.5))
  }, [g, s, R, sunDir, cam.mode, cam.n, path, arrows, ev, size.width, size.height])
  // Both rings (planet-centred) and the dashed pass share one frame; only the craft moves.
  useFrame(() => {
    const off = clock.t - ev.t, ins = Math.abs(off) <= tWin
    if (ins !== insideRef.current) { insideRef.current = ins; setInside(ins) }
    const tRel = Math.max(-tWin, Math.min(tWin, off))
    if (trail.current) trail.current.geometry.instanceCount = off < -tWin ? 0 : Math.max(0, Math.round(((tRel + tWin) / (2 * tWin)) * 400))
    if (craft.current && ins) {
      const p = g.at(tRel)
      v3(p, s, craft.current.position)
      if (tag.current && frame.current++ % 6 === 0) tag.current.textContent = `h ${(norm(p) - b.radius).toFixed(0)} km · ${off < 0 ? 'T−' : 'T+'}${fmtDuration(off)}`
    }
  }, EARLY)
  useEffect(() => () => { arrows.inA.dispose(); arrows.outA.dispose(); arrows.sun.dispose() }, [arrows])
  const sunHalo = useMemo(() => haloTexture(0.06), [])
  const au = (x: number) => x.toFixed(x < 10 ? 2 : 1).replace('.', ',')
  const dim = 'cl-lo text-[10px] text-white/70'
  return (
    <Occluder.Provider value={1}>
      <CameraInit pos={camPos} />
      <ambientLight intensity={0.1} />
      <Planet id={ev.body} sunDir={sunDir} />

      <Line points={path} color="#c084fc" lineWidth={1.4} dashed dashSize={R * 0.012} gapSize={R * 0.008} transparent opacity={0.9} />
      <Line ref={trail as never} points={path} color="#fde047" lineWidth={2.6} />
      <primitive object={arrows.inA} />
      <primitive object={arrows.outA} />
      <primitive object={arrows.sun} />
      <group position={path[0]}><Label className="cl-lo bg-cyan-600/80">v∞ in {norm(ev.vinfIn!).toFixed(2)} km/s</Label></group>
      <group position={path[400]}><Label className="cl-lo bg-pink-600/80">v∞ uit {norm(ev.vinfOut!).toFixed(2)} km/s</Label></group>
      <group position={arrows.sunTip}><Label className="cl-lo bg-orange-500/80 font-semibold">Zon →</Label></group>
      <group position={v3(g.pHat, g.rp * s)}>
        <Dot color="#f8fafc" size={7} />
        <Label className="cl-lo">Periapsis · h = {(g.rp - b.radius).toFixed(0)} km · v = {g.vp.toFixed(2)} km/s</Label>
      </group>

      {/* the Sun and the other planets, at their true directions from here */}
      <group position={sunDir.clone().multiplyScalar(sky.D)}>
        <sprite scale={[R * 3.6, R * 3.6, 1]}>
          <spriteMaterial map={sunHalo} color="#ffc873" transparent opacity={0.9} depthWrite={false} blending={THREE.AdditiveBlending} />
        </sprite>
        <Dot color="#fff1c2" size={11} />
        <Label className="cl-lo text-yellow-100">Zon · {au(sky.sunAu)} AE</Label>
      </group>
      {sky.bodies.map((o) => (
        <group key={o.id} position={o.pos}>
          <Dot color={BODIES[o.id].color} size={6} />
          <Label className={dim}>{BODIES[o.id].name} · {au(o.au)} AE</Label>
        </group>
      ))}

      {inside && (
        <group ref={craft}>
          <Dot color="#fde047" size={11} />
          <Label className="cl-s0 bg-yellow-500/85 text-black">Ruimtevaartuig · <span ref={tag} /></Label>
        </group>
      )}
    </Occluder.Provider>
  )
}
