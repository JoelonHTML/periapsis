// Flight playback (own clock), craft + trail, camera modes and declutter-aware labels for the Melkweg view.
import { Line } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { BODIES, fmtLy, galToXyz } from '@/lib/galaxy'
import { currentPlan, currentTarget, flight, gstore } from '@/lib/galaxy-store'
import { ARMS, LOCAL_ARM, SPUR, armAtRadius } from './generate'
import { EARLY, Label } from '../kit'
import { GC, PointCloud, SUN_NAME, UNIT_LY, toScene } from './GalaxyField'

const HALO = { pos: new Float32Array(3), col: new Float32Array([0.15, 0.55, 0.65]), size: new Float32Array([30]) }
const CORE = { pos: new Float32Array(3), col: new Float32Array([1, 1, 1]), size: new Float32Array([8]) }
const Z = new THREE.Vector3(0, 0, 1), Y = new THREE.Vector3(0, 1, 0)
type Controls = { target: THREE.Vector3; update: () => void; enabled: boolean }

interface Cand { id: string; name: string; pos: THREE.Vector3; farOnly?: boolean; arm?: boolean }

export function chaseDistance(rate: number) { return Math.min(Math.max(rate * 0.05, 0.03), 600) } // scene units behind the craft

/** Unit vector (scene axes) of the flight direction and the craft position for travelled distance s (ly). */
function craftFrame(s: number, out: { u: THREE.Vector3; p: THREE.Vector3; up: THREE.Vector3 }) {
  const t = currentTarget()
  toScene(t.unit, out.u).normalize()
  out.p.copy(out.u).multiplyScalar(s / UNIT_LY)
  out.up.copy(Y).addScaledVector(out.u, -Y.dot(out.u))
  if (out.up.lengthSq() < 1e-6) out.up.set(1, 0, 0)
  out.up.normalize()
  return t
}

export function Flight() {
  const camera = useThree((s) => s.camera)
  const controls = useThree((s) => s.controls) as unknown as Controls | null
  const craft = useRef<THREE.Group>(null)
  if (import.meta.env?.DEV) (window as unknown as { __gal?: unknown }).__gal = { camera, controls }
  const trail = useRef<THREE.Group>(null)
  const frame = useMemo(() => ({ u: new THREE.Vector3(), p: new THREE.Vector3(), up: new THREE.Vector3() }), [])
  const last = useRef(new THREE.Vector3())
  const tick = useRef(0)
  const [shown, setShown] = useState<string[]>([])
  const [craftLabel, setCraftLabel] = useState(false)
  const cam = gstore.useStore((s) => s.cam)
  const nonce = gstore.useStore((s) => s.camNonce)
  const rate = gstore.useStore((s) => s.rate)
  const tkey = gstore.useStore((s) => `${s.targetId}|${s.custom.d}|${s.custom.l}|${s.custom.b}`)

  const cands = useMemo<Cand[]>(() => {
    const l: Cand[] = [{ id: 'sun', name: SUN_NAME, pos: new THREE.Vector3() }]
    for (const b of BODIES) l.push({ id: b.id, name: `${b.name} · ${fmtLy(b.d)}`, pos: toScene(galToXyz(b.l, b.b, b.d)) })
    ARMS.forEach((a, i) => {
      const [x, y] = armAtRadius(i, a.id === 'outer' ? 38000 : a.id === 'sag' ? 28000 : 33000)
      l.push({ id: 'arm' + i, name: a.name, pos: toScene([26000 + x, y, 0]), farOnly: true, arm: true })
    })
    const [sx, sy] = armAtRadius(LOCAL_ARM, 25500)
    l.push({ id: 'spur', name: SPUR.name, pos: toScene([26000 + sx, sy - 0, 0]), farOnly: true, arm: true })
    return l
  }, [])

  // ---- camera placement when the mode (or target, or chase distance) changes
  useEffect(() => {
    if (!controls) return
    const set = (pos: THREE.Vector3, target: THREE.Vector3) => {
      camera.position.copy(pos); controls.target.copy(target); camera.lookAt(target); controls.update()
    }
    const t = craftFrame(flight.s, frame)
    const { u, p, up } = frame
    const dTot = t.d / UNIT_LY
    if (cam === 'galaxy') set(GC.clone().add(new THREE.Vector3(-0.6, 0.76, 0.2).normalize().multiplyScalar(12500)), GC)
    else if (cam === 'sun') set(new THREE.Vector3(0.5, 0.42, 0.75).normalize().multiplyScalar(14), new THREE.Vector3())
    else if (cam === 'overview') {
      const dist = Math.min(Math.max(dTot * 1.25, 1.2), 19000), mid = u.clone().multiplyScalar(Math.min(dTot / 2, 9000))
      const side = new THREE.Vector3().crossVectors(u, Y)
      if (side.lengthSq() < 1e-6) side.set(1, 0, 0)
      side.normalize()
      set(mid.clone().addScaledVector(side, dist * 0.8).addScaledVector(Y, dist * 0.55).addScaledVector(u, -dist * 0.15), mid)
    } else {
      const D = chaseDistance(gstore.get().rate)
      if (cam === 'chase') set(p.clone().addScaledVector(u, -D).addScaledVector(up, 0.3 * D), p.clone().addScaledVector(u, 1.5 * D))
      else set(p.clone().addScaledVector(u, 0.05 * D), p.clone().addScaledVector(u, 0.6 * D)) // cockpit: just ahead of the craft, looking at the destination
    }
    last.current.copy(p)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera, controls, cam, nonce, tkey, cam === 'chase' ? rate : 0])

  useFrame(({ size }, delta) => {
    const g = gstore.get(), plan = currentPlan()
    if (g.playing && flight.s < plan.d) {
      flight.s = Math.min(plan.d, flight.s + g.rate * Math.min(delta, 0.1))
      if (flight.s >= plan.d) gstore.set({ playing: false })
    }
    craftFrame(flight.s, frame)
    const { u, p } = frame
    craft.current?.position.copy(p)
    if (trail.current) {
      trail.current.visible = flight.s > 1e-6
      trail.current.quaternion.setFromUnitVectors(Z, u)
      trail.current.scale.z = Math.max(flight.s / UNIT_LY, 1e-9)
    }
    // follow the craft in chase / cockpit mode, keeping the user's orbit offset
    if (controls && (g.cam === 'chase' || g.cam === 'dest')) {
      const dx = p.x - last.current.x, dy = p.y - last.current.y, dz = p.z - last.current.z
      camera.position.x += dx; camera.position.y += dy; camera.position.z += dz
      controls.target.x += dx; controls.target.y += dy; controls.target.z += dz
    }
    last.current.copy(p)

    // label declutter, ~7×/s: priority Sun/target, then nearest; skip overlaps, off-screen and out-of-range candidates
    if (++tick.current % 8 !== 1) return
    const far = camera.position.length() > 4000
    const range = (controls ? camera.position.distanceTo(controls.target) : 1e9) * 60 // only label what is within ~60× the zoom distance
    const tgt = currentTarget().id
    // zoomed out the Sun label wins over a nearby target; zoomed in the target wins
    const sunFirst = camera.position.length() > 300
    const rank = (id: string) => (id === (sunFirst ? 'sun' : tgt) ? 0 : id === (sunFirst ? tgt : 'sun') ? 1 : 2)
    const order = cands.filter((c) => !c.farOnly || far)
      .map((c) => ({ c, d: c.pos.distanceTo(camera.position) }))
      .sort((a, b) => rank(a.c.id) - rank(b.c.id) || a.d - b.d)
    const left = size.width > 900 ? 420 : 0 // the side panel covers the left 416 px
    const boxes: [number, number][] = [], ids: string[] = []
    const v = new THREE.Vector3()
    for (const { c, d } of order) {
      if (d < 1e-3 || ids.length >= 13 || (d > range && c.id !== tgt && c.id !== 'sun')) continue
      v.copy(c.pos).applyMatrix4(camera.matrixWorldInverse)
      if (v.z >= 0) continue
      v.copy(c.pos).project(camera)
      const sx = ((v.x + 1) / 2) * size.width, sy = ((1 - v.y) / 2) * size.height
      if (sx < left || sx > size.width || sy < 0 || sy > size.height) continue
      if (boxes.some(([bx, by]) => Math.abs(bx - sx) < 150 && Math.abs(by - sy) < 17)) continue
      boxes.push([sx, sy]); ids.push(c.id)
    }
    setShown((prev) => (prev.join() === ids.join() ? prev : ids))
    const showCraft = flight.s > 0
    setCraftLabel((prev) => (prev === showCraft ? prev : showCraft))
  }, EARLY)

  const tgtId = currentTarget().id
  return (
    <>
      <group ref={trail} visible={false}>
        <Line points={[[0, 0, 0], [0, 0, 1]]} color="#22d3ee" lineWidth={7} transparent opacity={0.16} depthTest={false} renderOrder={4} />
        <Line points={[[0, 0, 0], [0, 0, 1]]} color="#a5f3fc" lineWidth={2} transparent opacity={0.95} depthTest={false} renderOrder={5} />
      </group>
      <group ref={craft}>
        <PointCloud {...HALO} order={5} />
        <PointCloud {...CORE} order={6} />
        {craftLabel && <Label className="text-cyan-200">Ruimtevaartuig</Label>}
      </group>
      {cands.filter((c) => shown.includes(c.id)).map((c) => (
        <group key={c.id} position={c.pos}>
          <Label className={c.id === tgtId ? 'bg-cyan-950/70 text-cyan-100' : c.arm ? 'italic text-blue-200/80' : c.id === 'sun' ? 'text-amber-200' : undefined}>{c.name}</Label>
        </group>
      ))}
    </>
  )
}
