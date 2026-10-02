// Shared 3D building blocks for every scene (solar system, Earth, flyby, planet systems, galaxy).
import { useFrame, useThree } from '@react-three/fiber'
import { createContext, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import * as THREE from 'three'
import type { Vec } from '@/lib/astro'
import { labels } from '@/lib/labels'
import { cn } from '@/lib/utils'

/** Ecliptic/equatorial (x,y,z) → three.js y-up right-handed (x, z, −y). */
export const v3 = (v: Vec, s: number, out = new THREE.Vector3()) => out.set(v[0] * s, v[2] * s, -v[1] * s)
const tmp = new THREE.Vector3()
/** useFrame priority for anything that moves: runs before drei <Html> positions its labels. */
export const EARLY = -1

let dotTexture: THREE.Texture | null = null
export function dotTex() {
  if (dotTexture) return dotTexture
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')!
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  gr.addColorStop(0, 'rgba(255,255,255,1)')
  gr.addColorStop(0.45, 'rgba(255,255,255,0.95)')
  gr.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = gr
  g.fillRect(0, 0, 64, 64)
  return (dotTexture = new THREE.CanvasTexture(c))
}

export function useTexture(url: string) {
  const [tex, setTex] = useState<THREE.Texture | null>(null)
  useEffect(() => {
    let alive = true
    new THREE.TextureLoader().load(url, (t) => {
      t.colorSpace = THREE.SRGBColorSpace
      if (alive) setTex(t)
    })
    return () => { alive = false }
  }, [url])
  return tex
}

/** Fixed-pixel-size marker so bodies stay findable at true scale. */
export function Dot({ color, size = 7 }: { color: string; size?: number }) {
  const geo = useMemo(() => new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0], 3)), [])
  return (
    <points geometry={geo} renderOrder={2}>
      <pointsMaterial color={color} size={size} sizeAttenuation={false} map={dotTex()} transparent depthWrite={false} alphaTest={0.05} />
    </points>
  )
}

/** Radius (scene units) of a planet at the origin that hides labels behind it. */
export const Occluder = createContext(0)
const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3()

/** HTML label anchored to its parent in 3D (rendered by <LabelLayer/>, positioned by <LabelProjector/>). */
export function Label({ children, className }: { children: ReactNode; className?: string }) {
  const occluder = useContext(Occluder)
  const g = useRef<THREE.Group>(null)
  const id = useRef(0)
  useEffect(() => {
    id.current = labels.add({ obj: g.current!, node: null, occluder })
    return () => labels.remove(id.current)
  }, [occluder])
  useEffect(() => { labels.update(id.current, { node: children, className }) }, [children, className])
  return <group ref={g} />
}

/** Projects every label anchor to screen space each frame; hides labels behind the occluding planet. */
export function LabelProjector() {
  useFrame(({ camera, size }) => {
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
      e.el.style.transform = `translate(${((p.x + 1) / 2) * size.width}px, ${((1 - p.y) / 2) * size.height}px)`
    }
  })
  return null
}

/** DOM overlay holding the label contents; lives outside the Canvas. */
export function LabelLayer() {
  const list = useSyncExternalStore(labels.subscribe, labels.all)
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {list.map((e) => (
        <div key={e.id} ref={(el) => { e.el = el }} className="absolute top-0 left-0 opacity-0 will-change-transform">
          {e.node !== null && (
            <div className={cn('ml-2 -mt-2.5 whitespace-nowrap rounded-md bg-black/55 px-1.5 py-0.5 text-[10.5px] leading-tight text-white/90 backdrop-blur-sm', e.className)}>
              {e.node}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

export function Starfield() {
  const geo = useMemo(() => {
    const n = 5000, pos = new Float32Array(n * 3), col = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) {
      const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2, r = 2e5, s = Math.sqrt(1 - u * u)
      pos.set([r * s * Math.cos(th), r * u, r * s * Math.sin(th)], i * 3)
      const b = 0.35 + Math.random() ** 3 * 0.65
      col.set([b, b, b * (0.9 + Math.random() * 0.2)], i * 3)
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    g.setAttribute('color', new THREE.BufferAttribute(col, 3))
    return g
  }, [])
  return (
    <points geometry={geo}>
      <pointsMaterial size={1.3} sizeAttenuation={false} vertexColors depthWrite={false} />
    </points>
  )
}

/** Keeps the camera locked on a moving target while preserving the user's offset. */
export function Follow({ get }: { get: (() => THREE.Vector3 | null) | null }) {
  const controls = useThree((s) => s.controls) as unknown as { target: THREE.Vector3; update: () => void } | null
  const last = useRef<THREE.Vector3 | null>(null)
  useFrame(({ camera }) => {
    const p = get?.()
    if (!p || !controls) { last.current = null; return }
    camera.position.add(tmp.copy(p).sub(last.current ?? controls.target))
    controls.target.copy(p)
    last.current = (last.current ?? new THREE.Vector3()).copy(p)
  }, EARLY)
  return null
}

/** Places the camera when a view opens and recentres the orbit controls on the origin. */
export function CameraInit({ pos }: { pos: THREE.Vector3 }) {
  const camera = useThree((s) => s.camera)
  const controls = useThree((s) => s.controls) as unknown as { target: THREE.Vector3; update: () => void } | null
  useEffect(() => {
    camera.position.copy(pos)
    camera.lookAt(0, 0, 0)
    controls?.target.set(0, 0, 0)
    controls?.update()
  }, [camera, controls, pos])
  return null
}

/** Centres the 3D view in the free area to the right of the 416 px side panel. */
export function PanelOffset() {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const width = useThree((s) => s.size.width)
  useEffect(() => {
    camera.filmOffset = width > 900 ? -(208 / width) * camera.getFilmWidth() : 0
    camera.updateProjectionMatrix()
  }, [camera, width])
  return null
}

