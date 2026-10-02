// Extra solar-system objects drawn in the solar view (1 scene unit = 1e6 km): dwarf planets, asteroids, comets (with tails),
// a centaur and a Kuiper-belt cloud. Orbit data and sources: src/lib/extra-bodies.ts.
import { useFrame } from '@react-three/fiber'
import { Line } from '@react-three/drei'
import { useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { AU, MU_SUN, keplerE } from '@/lib/astro'
import { EXTRA, extraOrbit, extraState, kuiperRows, type ExtraDef } from '@/lib/extra-bodies'
import { clock, useApp } from '@/lib/store'
import { Dot, EARLY, Label, dotTex, v3 } from './kit'

export interface ExtraObjectsProps {
  /** Planet magnification used by the solar scene (1 = true scale). Scene units: 1 unit = 1e6 km. */
  mag: number
  labels: boolean
}
const S = 1e-6
const DOT: Record<ExtraDef['kind'], number> = { dwarf: 5, asteroid: 3.5, comet: 5, centaur: 4.5 }
const NEAR = 160 // scene units (≈ 1 AU): labels of the minor objects only appear when the camera is this close

/** Comet tail: a line from the nucleus whose far end fades to black (additive blending = transparent). */
function makeTail(color: string, dust: boolean) {
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3))
  const c = new THREE.Color(color)
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array([c.r, c.g, c.b, 0, 0, 0]), 3))
  const l = new THREE.Line(g, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }))
  l.frustumCulled = false
  l.userData.dust = dust
  return l
}

function ExtraBody({ d, mag, labels }: { d: ExtraDef; mag: number; labels: boolean }) {
  const g = useRef<THREE.Group>(null)
  const [near, setNear] = useState(false)
  const pts = useMemo(() => extraOrbit(d).map((p) => v3(p, S)), [d])
  const tails = useMemo(() => (d.kind === 'comet' ? [makeTail('#7dd3fc', false), makeTail('#fde7b0', true)] : []), [d])
  const tmp = useMemo(() => ({ dir: new THREE.Vector3(), vel: new THREE.Vector3() }), [])
  useFrame(({ camera }) => {
    const st = extraState(d, clock.t)
    v3(st.r, S, g.current!.position)
    const n = camera.position.distanceTo(g.current!.position) < NEAR
    if (n !== near) setNear(n)
    if (d.kind === 'comet') {
      const rAU = Math.hypot(st.r[0], st.r[1], st.r[2]) / AU
      const L = 28 * Math.max(0, Math.min(1, (3 - rAU) / 2)) // tail grows as the comet nears the Sun, gone beyond ~3 AU
      tmp.dir.copy(g.current!.position).normalize()
      v3(st.v, 1, tmp.vel).normalize()
      for (const t of tails) {
        const dust = t.userData.dust, arr = t.geometry.attributes.position.array as Float32Array
        const e = dust ? tmp.dir.clone().multiplyScalar(0.85).addScaledVector(tmp.vel, -0.35).normalize().multiplyScalar(L * 0.6) : tmp.dir.clone().multiplyScalar(L)
        arr[3] = e.x; arr[4] = e.y; arr[5] = e.z
        t.geometry.attributes.position.needsUpdate = true
        t.visible = L > 0.01
      }
    }
  }, EARLY)
  const showLabel = labels && (d.notable || near)
  return (
    <>
      <Line points={pts} color={d.color} lineWidth={1} transparent opacity={near ? 0.4 : d.kind === 'dwarf' ? 0.2 : 0.07} />
      <group ref={g}>
        <mesh scale={d.R * S * mag}>
          <sphereGeometry args={[1, 16, 8]} />
          <meshStandardMaterial color={d.color} roughness={0.9} />
        </mesh>
        <Dot color={d.color} size={DOT[d.kind]} />
        {tails.map((t, k) => <primitive key={k} object={t} />)}
        {showLabel && <Label className="text-[10px]">{d.name}</Label>}
      </group>
    </>
  )
}

/** Kuiper belt: 2 000 test particles on Keplerian orbits (cold/hot classical, 3:2 and 2:1 resonant clumps, scattered disc). */
function Kuiper({ labels }: { labels: boolean }) {
  const { geo, el } = useMemo(() => {
    const rows = kuiperRows(2000)
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(rows.length * 3), 3))
    return {
      geo: g,
      el: rows.map((r) => ({ a: r[0] * AU, e: r[1], i: r[2], O: r[3], w: r[4], M0: r[5], n: Math.sqrt(MU_SUN / (r[0] * AU) ** 3) })),
    }
  }, [])
  useFrame(() => {
    const arr = geo.attributes.position.array as Float32Array
    for (let k = 0; k < el.length; k++) {
      const o = el[k]
      const E = keplerE(o.M0 + o.n * clock.t, o.e)
      const x = o.a * (Math.cos(E) - o.e), y = o.a * Math.sqrt(1 - o.e * o.e) * Math.sin(E)
      const cO = Math.cos(o.O), sO = Math.sin(o.O), cw = Math.cos(o.w), sw = Math.sin(o.w), ci = Math.cos(o.i), si = Math.sin(o.i)
      const X = (cO * cw - sO * sw * ci) * x + (-cO * sw - sO * cw * ci) * y
      const Y = (sO * cw + cO * sw * ci) * x + (-sO * sw + cO * cw * ci) * y
      const Z = sw * si * x + cw * si * y
      arr[k * 3] = X * S; arr[k * 3 + 1] = Z * S; arr[k * 3 + 2] = -Y * S
    }
    geo.attributes.position.needsUpdate = true
  }, EARLY)
  const anchor = 44 * AU * S * Math.SQRT1_2
  return (
    <>
      <points geometry={geo} frustumCulled={false}>
        <pointsMaterial size={2} sizeAttenuation={false} color="#9bb2d6" map={dotTex()} transparent opacity={0.65} depthWrite={false} alphaTest={0.05} />
      </points>
      {labels && <group position={[anchor, 0, anchor]}><Label className="text-[10px] text-sky-200">Kuipergordel (30–50 AE)</Label></group>}
    </>
  )
}

export function ExtraObjects({ mag, labels }: ExtraObjectsProps) {
  const belt = useApp((s) => s.showBelt)
  return (
    <>
      {belt && <Kuiper labels={labels} />}
      {EXTRA.map((d) => <ExtraBody key={d.id} d={d} mag={mag} labels={labels} />)}
    </>
  )
}
