// The Milky Way itself: ~200 k GPU points, diffuse disc/bulge glow, Magellanic Clouds, Andromeda, catalogue markers.
// Scene units: 1 unit = 10 ly, origin = the Sun, three.js axes (x, z, −y) of the galactic frame (see lib/galaxy.ts).
import { Line } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { BODIES, SUN_GC_LY, galToXyz } from '@/lib/galaxy'
import { currentTarget, gstore } from '@/lib/galaxy-store'
import { ARMS, BAR_ANGLE, BAR_HALF, armPoint, generateGalaxy } from './generate'

export const UNIT_LY = 10
export const GC = new THREE.Vector3(SUN_GC_LY / UNIT_LY, 0, 0)
/** galactic Cartesian (ly) → scene vector */
export const toScene = (p: [number, number, number], out = new THREE.Vector3()) => out.set(p[0] / UNIT_LY, p[2] / UNIT_LY, -p[1] / UNIT_LY)

const smooth = (a: number, b: number, x: number) => { const t = Math.min(Math.max((x - a) / (b - a), 0), 1); return t * t * (3 - 2 * t) }

// ------------------------------------------------------------------ point material (round, soft, additive, fixed pixel size)
function starMaterial(px: number, ring = false) {
  return new THREE.ShaderMaterial({
    uniforms: { uPx: { value: px }, uFade: { value: 1 } },
    vertexShader: `attribute vec3 aColor; attribute float aSize; uniform float uPx; uniform float uFade; varying vec3 vC;
      void main(){ vC = aColor * uFade; gl_PointSize = aSize * uPx; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `varying vec3 vC;
      void main(){ vec2 p = gl_PointCoord - 0.5; float d = dot(p, p) * 4.0; if (d > 1.0) discard;
        ${ring ? 'float a = smoothstep(0.42, 0.62, d) * (1.0 - smoothstep(0.78, 1.0, d));' : 'float a = 1.0 - smoothstep(0.1, 1.0, d);'}
        gl_FragColor = vec4(vC, a); }`,
    transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending,
  })
}

export function PointCloud({ pos, col, size, order = -2, fadeNear, ring }: {
  pos: Float32Array; col: Float32Array; size: Float32Array; order?: number; fadeNear?: boolean; ring?: boolean
}) {
  const dpr = useThree((s) => s.viewport.dpr)
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    g.setAttribute('aColor', new THREE.BufferAttribute(col, 3))
    g.setAttribute('aSize', new THREE.BufferAttribute(size, 1))
    return g
  }, [pos, col, size])
  const mat = useMemo(() => starMaterial(dpr, ring), [dpr, ring])
  const pts = useRef<THREE.Points>(null)
  useEffect(() => () => { geo.dispose() }, [geo])
  useEffect(() => () => { mat.dispose() }, [mat])
  useFrame(({ camera }) => {
    if (fadeNear) { const f = 1 - smooth(500, 2200, camera.position.length()); mat.uniforms.uFade.value = f; if (pts.current) pts.current.visible = f > 0.002 }
  })
  return <points ref={pts} geometry={geo} material={mat} frustumCulled={false} renderOrder={order} />
}

// ------------------------------------------------------------------ canvas textures
function glowTexture(stops: [number, string][], w = 256, h = 256) {
  const c = document.createElement('canvas')
  c.width = w; c.height = h
  const g = c.getContext('2d')!
  const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2)
  for (const [o, col] of stops) gr.addColorStop(o, col)
  g.fillStyle = gr; g.fillRect(0, 0, w, h)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

const HAZE_SIZE = 112000 // ly covered by the haze texture
function hazeTexture() {
  const W = 1024, c = document.createElement('canvas')
  c.width = c.height = W
  const g = c.getContext('2d')!
  const px = (ly: number) => (ly / HAZE_SIZE) * W
  const X = (gx: number) => W / 2 + px(gx), Y = (gy: number) => W / 2 - px(gy)
  g.globalCompositeOperation = 'lighter'
  const blob = (x: number, y: number, r: number, rgb: string, a: number) => {
    const gr = g.createRadialGradient(X(x), Y(y), 0, X(x), Y(y), px(r))
    gr.addColorStop(0, `rgba(${rgb},${a})`); gr.addColorStop(1, `rgba(${rgb},0)`)
    g.fillStyle = gr; g.fillRect(X(x) - px(r), Y(y) - px(r), px(r) * 2, px(r) * 2)
  }
  for (let r = 1500; r < 50000; r += 1500) blob(0, 0, r * 0.7, '255,226,176', 0.03) // old disc, brightest inside
  ARMS.forEach((_, i) => {
    for (let r = 10500; r < 49000; r += 450) {
      const [x, y] = armPoint(i, r), fade = r > 38000 ? (49000 - r) / 11000 : 1
      blob(x, y, 2300 + 0.06 * r, '120,160,255', 0.06 * fade * Math.min(1, (r - 10500) / 4000))
    }
  })
  for (let u = -BAR_HALF; u <= BAR_HALF; u += 900) blob(u * Math.cos(BAR_ANGLE), u * Math.sin(BAR_ANGLE), 2300, '255,196,120', 0.07)
  blob(0, 0, 7000, '255,200,130', 0.16)
  blob(0, 0, 2600, '255,214,160', 0.2)
  return new THREE.CanvasTexture(c)
}

// ------------------------------------------------------------------ the Galaxy
export function MilkyWay() {
  const data = useMemo(() => generateGalaxy(), [])
  const haze = useMemo(hazeTexture, [])
  const glowA = useMemo(() => glowTexture([[0, 'rgba(255,220,160,0.9)'], [0.2, 'rgba(255,190,110,0.45)'], [0.6, 'rgba(255,150,70,0.1)'], [1, 'rgba(255,140,60,0)']]), [])
  const lmcTex = useMemo(() => glowTexture([[0, 'rgba(200,220,255,0.55)'], [0.4, 'rgba(160,190,255,0.22)'], [1, 'rgba(140,170,255,0)']]), [])
  const m31Tex = useMemo(() => {
    const c = document.createElement('canvas')
    c.width = 512; c.height = 128
    const g = c.getContext('2d')!
    g.translate(256, 64); g.scale(1, 0.25)
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, 256)
    gr.addColorStop(0, 'rgba(255,236,200,0.85)'); gr.addColorStop(0.15, 'rgba(255,220,170,0.4)'); gr.addColorStop(0.55, 'rgba(190,200,255,0.12)'); gr.addColorStop(1, 'rgba(190,200,255,0)')
    g.fillStyle = gr; g.fillRect(-256, -256, 512, 512)
    return new THREE.CanvasTexture(c)
  }, [])
  const hazeMat = useRef<THREE.MeshBasicMaterial>(null)
  const coreMat = useRef<THREE.SpriteMaterial>(null)
  const sat = useRef<THREE.Group>(null)
  const controls = useThree((s) => s.controls) as unknown as { target: THREE.Vector3 } | null
  useFrame(({ camera }) => {
    // satellite galaxies are only drawn when zoomed out (otherwise Andromeda would be a smudge next to the Sun)
    if (sat.current) sat.current.visible = !controls || camera.position.distanceTo(controls.target) > 600
    const dist = camera.position.length(), inside = smooth(150, 1800, camera.position.distanceTo(GC)) // no blown-out glow when flying through the core
    if (hazeMat.current) hazeMat.current.opacity = smooth(250, 2600, dist) * inside
    if (coreMat.current) coreMat.current.opacity = (0.2 + 0.7 * smooth(200, 3000, dist)) * inside
  })
  const cloudPos = (id: string) => { const b = BODIES.find((x) => x.id === id)!; return toScene(galToXyz(b.l, b.b, b.d)) }
  const lmc = cloudPos('lmc'), smc = cloudPos('smc'), m31 = cloudPos('m31')
  return (
    <group>
      <mesh position={GC} rotation={[-Math.PI / 2, 0, 0]} renderOrder={-4} frustumCulled={false}>
        <planeGeometry args={[HAZE_SIZE / UNIT_LY, HAZE_SIZE / UNIT_LY]} />
        <meshBasicMaterial ref={hazeMat} map={haze} transparent opacity={0} blending={THREE.AdditiveBlending} depthTest={false} depthWrite={false} toneMapped={false} />
      </mesh>
      <PointCloud pos={data.main.pos} col={data.main.col} size={data.main.size} order={-3} />
      <PointCloud pos={data.local.pos} col={data.local.col} size={data.local.size} order={-3} fadeNear />
      <sprite position={GC} scale={[2200, 2200, 1]} renderOrder={-2}>
        <spriteMaterial ref={coreMat} map={glowA} transparent opacity={0.6} blending={THREE.AdditiveBlending} depthTest={false} depthWrite={false} toneMapped={false} />
      </sprite>
      <group ref={sat}>
      <sprite position={lmc} scale={[1500, 1500, 1]} renderOrder={-2}>
        <spriteMaterial map={lmcTex} transparent blending={THREE.AdditiveBlending} depthTest={false} depthWrite={false} toneMapped={false} />
      </sprite>
      <sprite position={smc} scale={[900, 900, 1]} renderOrder={-2}>
        <spriteMaterial map={lmcTex} transparent blending={THREE.AdditiveBlending} depthTest={false} depthWrite={false} toneMapped={false} />
      </sprite>
      <sprite position={m31} scale={[26000, 6500, 1]} renderOrder={-2}>
        <spriteMaterial map={m31Tex} rotation={0.65} transparent blending={THREE.AdditiveBlending} depthTest={false} depthWrite={false} toneMapped={false} />
      </sprite>
      </group>
    </group>
  )
}

// ------------------------------------------------------------------ catalogue markers, Sun, target highlight
export const SUN_NAME = 'Zon (Orion-arm)'
export function Markers() {
  const { pos, col, size } = useMemo(() => {
    const list = BODIES.filter((b) => b.kind !== 'galaxy')
    const n = list.length + 1, pos = new Float32Array(n * 3), col = new Float32Array(n * 3), size = new Float32Array(n)
    const v = new THREE.Vector3(), c = new THREE.Color()
    list.forEach((b, i) => {
      toScene(galToXyz(b.l, b.b, b.d), v).toArray(pos, i * 3)
      c.set(b.tint).toArray(col, i * 3)
      size[i] = b.kind === 'star' ? 6.5 : 8
    })
    pos.set([0, 0, 0], list.length * 3); c.set('#ffe9a8').toArray(col, list.length * 3); size[list.length] = 10
    return { pos, col, size }
  }, [])
  return <PointCloud pos={pos} col={col} size={size} order={1} />
}

/** Highlight ring + a dashed-looking route line from the Sun to the selected target. */
export function TargetMark() {
  const targetId = gstore.useStore((s) => s.targetId)
  const cd = gstore.useStore((s) => s.custom.d), cl = gstore.useStore((s) => s.custom.l), cb = gstore.useStore((s) => s.custom.b)
  const { p, ring } = useMemo(() => {
    const t = currentTarget(), p = toScene(t.xyz)
    return { p, ring: { pos: new Float32Array(p.toArray()), col: new Float32Array([0.35, 0.95, 1]), size: new Float32Array([26]) } }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetId, cd, cl, cb])
  return (
    <>
      <PointCloud {...ring} order={3} ring />
      <Line points={[[0, 0, 0], p.toArray() as [number, number, number]]} color="#7dd3fc" lineWidth={1} transparent opacity={0.4} depthTest={false} renderOrder={0} />
    </>
  )
}
