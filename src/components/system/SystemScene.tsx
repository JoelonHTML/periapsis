// 3D planet-system view. Scale: 1 scene unit = 1000 km. Everything lives in an "ecliptic" group (ecliptic J2000 axes, centred on the
// planet); the planet's own inertial frame (pole from IAU RA/Dec) sits inside it and holds the rings, moon orbits and spacecraft orbits.
import { useFrame, useThree } from '@react-three/fiber'
import { Line } from '@react-three/drei'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import * as THREE from 'three'
import TEX_EARTH from '@/assets/earth.jpg'
import { BODIES, DAY, fmtDateTime, moonGeoEcliptic, perifocalBasis, type Vec } from '@/lib/astro'
import { clock } from '@/lib/store'
import { sys, shipKey, ensureShip, currentSeg, type Ship } from '@/lib/system-store'
import {
  SYSTEMS, fitRadius, moonOrbitPlanet, moonPosEcl, orbPeriod, orbState, orbitArc, planManeuver, planetFrame, segAt, shipState, spinAngle, sunDir,
  sysMu, sysR, toEcl, type Frame, type MoonDef, type Orb, type SysId,
} from '@/lib/system'
import { Dot, EARLY, Label, Occluder, dotTex, useTexture, v3 } from '../kit'
import { BodyTiles } from '@/features/earth/BodyTiles'
import { Rings } from './Rings'
import { PLANET_MAPS, hdSetting, loadHd } from './planetTex'
import { bodyTexture } from './textures'

const S = 1e-3
const ecl = (p: ArrayLike<number>, out: THREE.Vector3) => out.set(p[0] * S, p[1] * S, p[2] * S) // ecliptic-group local coordinates
const world = (p: ArrayLike<number>, out: THREE.Vector3) => v3(p as [number, number, number], S, out) // → three world coordinates

export function SystemScene() {
  const body = sys.useStore((s) => s.body)
  return <SystemBody key={body} id={body} />
}

/** Group whose matrix is the given basis (columns) — used for the planet frame and orbit planes. */
function Basis({ x, y, z, children }: { x: ArrayLike<number>; y: ArrayLike<number>; z: ArrayLike<number>; children?: ReactNode }) {
  const ref = useCallback((g: THREE.Group | null) => {
    if (!g) return
    g.matrix.makeBasis(new THREE.Vector3(x[0], x[1], x[2]), new THREE.Vector3(y[0], y[1], y[2]), new THREE.Vector3(z[0], z[1], z[2]))
    g.matrixWorldNeedsUpdate = true
  }, [x, y, z])
  return <group ref={ref} matrixAutoUpdate={false}>{children}</group>
}

function PhotoSurface({ url }: { url: string }) {
  const map = useTexture(url)
  return <meshStandardMaterial key={map ? 'tex' : 'plain'} map={map} color={map ? '#ffffff' : '#4b5563'} roughness={1} metalness={0} />
}
/** Bundled ~2k map, swapped for the 4k/8k one (fetched once, see planetTex.ts) when the camera comes within 10 radii of `at`. */
function RealSurface({ kind, at, R }: { kind: string; at: React.RefObject<THREE.Object3D | null>; R: number }) {
  const base = useTexture(PLANET_MAPS[kind])
  const mode = hdSetting.useStore((s) => s.mode)
  const [hd, setHd] = useState<THREE.Texture | null>(null)
  const asked = useRef(false), tmp = useMemo(() => new THREE.Vector3(), [])
  useEffect(() => { asked.current = false }, [mode])
  useFrame(({ camera }) => {
    if (asked.current || !at.current || camera.position.distanceTo(at.current.getWorldPosition(tmp)) > R * S * 10) return
    asked.current = true
    loadHd(kind).then((t) => { if (t) setHd(t) })
  })
  const map = (mode !== 'off' && hd) || base
  return <meshStandardMaterial key={map ? 'tex' : 'plain'} map={map} color={map ? '#ffffff' : '#4b5563'} roughness={1} metalness={0} />
}
function ProcSurface({ kind, variant }: { kind: string; variant: string }) {
  const proc = useMemo(() => bodyTexture(kind, variant), [kind, variant])
  return <meshStandardMaterial map={proc} color="#ffffff" roughness={1} metalness={0} />
}
const PlanetSurface = ({ id, at, R }: { id: SysId; at: React.RefObject<THREE.Object3D | null>; R: number }) => (
  id === 'earth' ? <PhotoSurface url={TEX_EARTH} /> : PLANET_MAPS[SYSTEMS[id].tex] ? <RealSurface kind={SYSTEMS[id].tex} at={at} R={R} /> : <ProcSurface kind={SYSTEMS[id].tex} variant="" />
)

function Planet({ id, R, labels }: { id: SysId; R: number; labels: boolean }) {
  const def = SYSTEMS[id], spin = useRef<THREE.Group>(null)
  useFrame(() => { spin.current!.rotation.z = spinAngle(id, clock.t) }, EARLY)
  const color = BODIES[id].color
  return (
    <>
      <group ref={spin}>
        <mesh scale={R * S} rotation={[Math.PI / 2, 0, 0]}>
          <sphereGeometry args={[1, 128, 64]} />
          <PlanetSurface id={id} at={spin} R={R} />
        </mesh>
        <group scale={R * S} rotation={[Math.PI / 2, 0, 0]}><BodyTiles kind={def.tex} /></group>
      </group>
      {def.atm && (
        <mesh scale={R * S * 1.025}>
          <sphereGeometry args={[1, 64, 32]} />
          <meshBasicMaterial color={def.atm.color} transparent opacity={def.atm.opacity} side={THREE.BackSide} depthWrite={false} blending={THREE.AdditiveBlending} />
        </mesh>
      )}
      <group>
        <Dot color={color} size={6} />
      </group>
      {labels && (
        <group position={[0, 0, R * S * 1.35]}>
          <Label className="font-semibold">{BODIES[id].name}</Label>
        </group>
      )}
    </>
  )
}

function MoonOrbitLine({ mn }: { mn: MoonDef }) {
  const pts = useMemo(() => moonOrbitPlanet(mn).map((p) => ecl(p, new THREE.Vector3())), [mn])
  return <Line points={pts} color={mn.color} lineWidth={1} transparent opacity={mn.far ? 0.2 : 0.38} />
}

/** The Moon's real (perturbed) path: re-sampled around the current date, like the Earth–Moon view. */
function MoonPath() {
  const line = useMemo(() => new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: '#94a3b8', transparent: true, opacity: 0.5 })), [])
  const last = useRef(-Infinity)
  useFrame(() => {
    if (Math.abs(clock.t - last.current) < 0.5 * DAY) return
    last.current = clock.t
    line.geometry.setFromPoints(Array.from({ length: 181 }, (_, k) => ecl(moonGeoEcliptic(clock.t + ((k - 90) / 90) * 13.66 * DAY), new THREE.Vector3())))
  }, EARLY)
  return <primitive object={line} />
}

const LABEL_K = 10 // a moon's label shows while the camera is closer to the planet than K × its orbital radius
function MoonBody({ id, mn, frame, labels }: { id: SysId; mn: MoonDef; frame: Frame; labels: boolean }) {
  const g = useRef<THREE.Group>(null), spin = useRef<THREE.Group>(null)
  const [near, setNear] = useState(false)
  const tmp = useMemo(() => new THREE.Vector3(), [])
  useFrame(({ camera }) => {
    const p = moonPosEcl(id, mn, clock.t, frame)
    ecl(p, g.current!.position)
    spin.current!.rotation.z = Math.atan2(-p[1], -p[0]) // tidally locked: prime meridian (+x of the texture) faces the planet
    const n = camera.position.length() < LABEL_K * mn.a * S || camera.position.distanceTo(world(p, tmp)) < Math.max(mn.R * S * 40, 0.5)
    if (n !== near) setNear(n)
  }, EARLY)
  const segs = mn.R > 400 ? [64, 32] : [24, 12]
  return (
    <group ref={g}>
      <group ref={spin}>
        <mesh scale={mn.R * S} rotation={[Math.PI / 2, 0, 0]}>
          <sphereGeometry args={[1, segs[0], segs[1]]} />
          {PLANET_MAPS[mn.tex] ? <RealSurface kind={mn.tex} at={g} R={mn.R} /> : <ProcSurface kind={mn.tex} variant={mn.id} />}
        </mesh>
        <group scale={mn.R * S} rotation={[Math.PI / 2, 0, 0]}><BodyTiles kind={mn.tex} /></group>
      </group>
      <Dot color={mn.color} size={5} />
      {labels && near && <Label>{mn.name}</Label>}
    </group>
  )
}

// ---------------------------------------------------------------------------------------------- spacecraft
function OrbitArc({ orb, nu0 = 0, nu1 = Math.PI * 2, color, width, opacity, dashed }: {
  orb: Orb; nu0?: number; nu1?: number; color: string; width: number; opacity: number; dashed?: boolean
}) {
  const pts = useMemo(() => orbitArc(orb, nu0, nu1, nu1 - nu0 < 7 ? 200 : 360).map((p) => new THREE.Vector3(p[0] * S, p[1] * S, 0)), [orb, nu0, nu1])
  const { P, Q, W } = useMemo(() => perifocalBasis(orb.i, orb.O, orb.w), [orb])
  const dash = Math.max(1e-3, orb.ra * S * 0.025)
  return (
    <Basis x={P} y={Q} z={W}>
      <Line points={pts} color={color} lineWidth={width} transparent opacity={opacity} dashed={dashed} dashSize={dash} gapSize={dash * 0.7} />
    </Basis>
  )
}

/** Burn marker: dot at the burn point plus a flash that peaks at the burn epoch. Placed in the planet frame. */
function BurnMarker({ orb, mu, t, text, planned }: { orb: Orb; mu: number; t: number; text: string; planned?: boolean }) {
  const pos = useMemo(() => { const r = orbState(orb, mu, t).r; return [r[0] * S, r[1] * S, r[2] * S] as [number, number, number] }, [orb, mu, t])
  const flash = useRef<THREE.PointsMaterial>(null)
  const w = Math.max(90, 0.03 * orbPeriod(orb, mu))
  const geo = useMemo(() => new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0], 3)), [])
  useFrame(() => {
    if (!flash.current) return
    const x = Math.abs(clock.t - t) / w
    flash.current.visible = x < 1
    flash.current.size = 14 + 46 * (1 - Math.min(1, x))
    flash.current.opacity = 1 - Math.min(1, x)
  }, EARLY)
  return (
    <group position={pos}>
      <Dot color={planned ? '#bef264' : '#fb923c'} size={planned ? 7 : 9} />
      {!planned && (
        <points geometry={geo} renderOrder={3}>
          <pointsMaterial ref={flash} color="#fb923c" map={dotTex()} size={14} sizeAttenuation={false} transparent depthWrite={false} blending={THREE.AdditiveBlending} />
        </points>
      )}
      {text && <Label className={planned ? 'bg-lime-600/70' : 'bg-orange-600/85'}>{text}</Label>}
    </group>
  )
}

const fmtDv = (dv: number) => (dv < 0.1 ? `${(dv * 1000).toFixed(1)} m/s` : `${dv.toFixed(3)} km/s`)

function ShipOrbits({ id, ship, dim, labels }: { id: SysId; ship: Ship; dim: boolean; labels: boolean }) {
  const mu = sysMu(id), n = ship.segs.length
  const preview = useMemo(() => {
    if (n < 1) return null
    const last = currentSeg(ship), R = sysR(id)
    const p = planManeuver(mu, last.orb, { rp: R + ship.target.rpAlt, ra: R + ship.target.raAlt, i: (ship.target.incDeg * Math.PI) / 180 }, clock.t, 1, 300)
    return p.same ? null : p
  }, [ship.segs, ship.target, id, mu, n])
  return (
    <>
      {ship.segs.map((s, k) => {
        const lastSeg = k === n - 1
        if (s.kind === 'transfer') {
          const raising = Math.abs(s.orb.tp - s.t0) < Math.abs(s.orb.tp - s.t1)
          return (
            <group key={k}>
              <OrbitArc orb={s.orb} nu0={raising ? 0 : Math.PI} nu1={raising ? Math.PI : 2 * Math.PI} color="#f59e0b" width={1.8} opacity={dim ? 0.4 : 0.95} dashed />
            </group>
          )
        }
        return <OrbitArc key={k} orb={s.orb} color={lastSeg ? '#22d3ee' : '#38bdf8'} width={lastSeg ? 2 : 1.2} opacity={dim ? 0.35 : lastSeg ? 1 : 0.3} />
      })}
      {ship.segs.map((s, k) => s.kind === 'transfer' && !dim && ship.log.filter((l) => l.t === s.t0 || l.t === s.t1).map((l) => (
        <BurnMarker key={`${k}-${l.n}`} orb={s.orb} mu={mu} t={l.t} text={labels ? `Burn ${l.n} · Δv ${fmtDv(l.dv)} · ${fmtDateTime(l.t)}` : ''} />
      )))}
      {preview && !dim && (
        <>
          <OrbitArc orb={preview.transfer} nu0={preview.transfer.tp === preview.tb1 ? 0 : Math.PI} nu1={preview.transfer.tp === preview.tb1 ? Math.PI : 2 * Math.PI} color="#fbbf24" width={1.4} opacity={0.8} dashed />
          <OrbitArc orb={preview.final} color="#4ade80" width={1.4} opacity={0.75} dashed />
          {labels && preview.burns.map((b) => (
            <BurnMarker key={`p${b.n}`} planned orb={preview.transfer} mu={mu} t={b.t} text={`Gepland: burn ${b.n} · Δv ${fmtDv(b.dv)}`} />
          ))}
        </>
      )}
    </>
  )
}

function Craft({ id, ship, frame, labels, onPre }: { id: SysId; ship: Ship; frame: Frame; labels: boolean; onPre: (v: boolean) => void }) {
  const g = useRef<THREE.Group>(null), alt = useRef<HTMLSpanElement>(null)
  const mu = sysMu(id), R = sysR(id), tmp = useMemo(() => new THREE.Vector3(), [])
  const pre = useRef(false)
  const [near, setNear] = useState(false)
  let frameNo = 0
  useFrame(({ camera }) => {
    const hidden = ship.src === 'mission' && clock.t < ship.tp
    if (hidden !== pre.current) { pre.current = hidden; onPre(hidden) }
    g.current!.visible = !hidden
    if (hidden) return
    const st = shipState(ship.segs, mu, clock.t)
    ecl(toEcl(frame, st.r), g.current!.position)
    const n = camera.position.distanceTo(world(toEcl(frame, st.r), tmp)) < 14 * Math.max(R, segAt(ship.segs, clock.t).orb.ra) * S
    if (n !== near) setNear(n)
    if (alt.current && frameNo++ % 6 === 0) alt.current.textContent = `${(st.rad - R).toFixed(0)} km · ${st.speed.toFixed(2)} km/s`
  }, EARLY)
  return (
    <group ref={g}>
      <Dot color="#fde047" size={10} />
      {labels && near && <Label className="mt-3 bg-yellow-500/80 text-black">Ruimtevaartuig · <span ref={alt} /></Label>}
    </group>
  )
}

/** World position of the craft (null while it is still on its way). */
function craftWorld(id: SysId, frame: Frame, out: THREE.Vector3) {
  const ship = sys.get().ships[shipKey(id)]
  if (!ship || (ship.src === 'mission' && clock.t < ship.tp)) return null
  return world(toEcl(frame, shipState(ship.segs, sysMu(id), clock.t).r), out)
}

// ---------------------------------------------------------------------------------------------- camera
function CamRig({ id, frame }: { id: SysId; frame: Frame }) {
  const camera = useThree((s) => s.camera)
  const controls = useThree((s) => s.controls) as unknown as { target: THREE.Vector3; update: () => void } | null
  const cam = sys.useStore((s) => s.cam)
  const first = useRef(true)
  const anim = useRef<{ t0: number; dur: number; from: THREE.Vector3; fromDist: number; toDist: number; dir: THREE.Vector3 } | null>(null)
  const v = useMemo(() => ({ a: new THREE.Vector3(), b: new THREE.Vector3() }), [])
  const R = sysR(id)

  /** What the camera aims at for the current preset (world coordinates); null = keep. */
  const aim = useCallback((out: THREE.Vector3) => {
    const c = sys.get().cam
    if (c.kind === 'moon') {
      const mn = SYSTEMS[id].moons.find((x) => x.id === c.moon)
      return mn ? world(moonPosEcl(id, mn, clock.t, frame), out) : out.set(0, 0, 0)
    }
    if (c.kind === 'craft' && c.moon === 'chase') return craftWorld(id, frame, out) ?? out.set(0, 0, 0)
    return out.set(0, 0, 0)
  }, [id, frame])

  useEffect(() => {
    if (!controls) return
    const c = sys.get().cam, ship = sys.get().ships[shipKey(id)]
    let dist = fitRadius(id) * S * 2.0
    if (c.kind === 'planet') dist = R * S * 3.2
    else if (c.kind === 'craft') {
      const ra = ship ? currentSeg(ship).orb.ra : R * 1.5
      dist = c.moon === 'chase' ? Math.max(1e-3, Math.min(R * S * 0.7, ra * S * 0.6)) : Math.max(R, ra) * S * 5.5
    } else if (c.kind === 'moon') dist = (SYSTEMS[id].moons.find((x) => x.id === c.moon)?.R ?? 100) * S * 7
    // Presets keep the user's viewing direction (same part of space in view) and only retarget + dolly; the initial view looks from the Sun's side, slightly above the equator.
    let dir: THREE.Vector3
    if (first.current) {
      const sd = sunDir(id, clock.t), Z = frame.Z, k = sd[0] * Z[0] + sd[1] * Z[1] + sd[2] * Z[2]
      let h: Vec = [sd[0] - Z[0] * k, sd[1] - Z[1] * k, sd[2] - Z[2] * k]
      if (Math.hypot(h[0], h[1], h[2]) < 0.2) h = frame.X
      const hn = Math.hypot(h[0], h[1], h[2])
      dir = v3([(h[0] / hn) * 0.8 + Z[0] * 0.6, (h[1] / hn) * 0.8 + Z[1] * 0.6, (h[2] / hn) * 0.8 + Z[2] * 0.6], 1).normalize()
    } else dir = camera.position.clone().sub(controls.target).normalize()
    anim.current = {
      t0: performance.now(), dur: first.current ? 0 : 900, from: controls.target.clone(),
      fromDist: Math.max(1e-6, camera.position.distanceTo(controls.target)), toDist: dist, dir,
    }
    first.current = false
    if (import.meta.env.DEV) Object.assign(window, { __cam: { camera, controls } }) // dev hook for scripted screenshots
  }, [cam.nonce, controls, camera, id, R, frame])

  useFrame(() => {
    if (!controls) return
    const a = anim.current
    if (a) {
      const s = a.dur ? Math.min(1, (performance.now() - a.t0) / a.dur) : 1, e = s * s * (3 - 2 * s)
      controls.target.lerpVectors(a.from, aim(v.a), e)
      camera.position.copy(controls.target).addScaledVector(a.dir, a.fromDist * Math.pow(a.toDist / a.fromDist, e))
      if (s >= 1) anim.current = null
      return
    }
    const f = sys.get().follow
    let tgt: THREE.Vector3 | null = null
    if (f === 'craft') tgt = craftWorld(id, frame, v.a)
    else if (f.startsWith('moon:')) {
      const mn = SYSTEMS[id].moons.find((x) => x.id === f.slice(5))
      if (mn) tgt = world(moonPosEcl(id, mn, clock.t, frame), v.a)
    }
    if (tgt) { camera.position.add(v.b.copy(tgt).sub(controls.target)); controls.target.copy(tgt) }
  }, EARLY)
  return null
}

// ---------------------------------------------------------------------------------------------- scene
function SystemBody({ id }: { id: SysId }) {
  const def = SYSTEMS[id], R = sysR(id)
  const frame = useMemo(() => planetFrame(id), [id])
  const labels = sys.useStore((s) => s.labels), orbits = sys.useStore((s) => s.orbits)
  const ship = sys.useStore((s) => s.ships[shipKey(id)])
  const [pre, setPre] = useState(false)
  const light = useRef<THREE.DirectionalLight>(null)
  useEffect(() => { ensureShip(id) }, [id])
  useFrame(() => { v3(sunDir(id, clock.t), 1000, light.current!.position) }, EARLY)
  return (
    <Occluder.Provider value={R * S}>
      <ambientLight intensity={0.2} />
      <directionalLight ref={light} intensity={2.8} />
      <CamRig id={id} frame={frame} />
      <group rotation={[-Math.PI / 2, 0, 0]}>
        <Basis x={frame.X} y={frame.Y} z={frame.Z}>
          <Planet id={id} R={R} labels={labels} />
          {def.rings && <Rings id={id} def={def.rings} frame={frame} R={R} />}
          {orbits && def.moons.filter((m) => m.id !== 'moon').map((m) => <MoonOrbitLine key={m.id} mn={m} />)}
          {ship && <ShipOrbits id={id} ship={ship} dim={pre} labels={labels} />}
        </Basis>
        {orbits && id === 'earth' && <MoonPath />}
        {def.moons.map((m) => <MoonBody key={m.id} id={id} mn={m} frame={frame} labels={labels} />)}
        {ship && <Craft id={id} ship={ship} frame={frame} labels={labels} onPre={setPre} />}
      </group>
    </Occluder.Provider>
  )
}
