// Coastlines, country borders and city dots/labels. Lives inside the rotating Earth group; unit sphere scaled to the Earth radius.
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useState } from 'react'
import * as THREE from 'three'
import { Label } from '@/components/kit'
import { loadBorders, lineSegmentPositions } from './borders'
import { CITIES, labelCount } from './cities'
import { latLonToXyz } from './geo'
import type { Layers } from './tier'

const LIFT = 1.0015 // lines/dots sit ~10 km above the surface (the depth buffer is logarithmic)

let segCache: { coast?: Float32Array; borders?: Float32Array } = {}
function useSegments(kind: 'coast' | 'borders') {
  return useMemo(() => {
    const b = loadBorders()
    return (segCache[kind] ??= lineSegmentPositions(b[kind], 1))
  }, [kind])
}

function Lines({ kind, color, opacity }: { kind: 'coast' | 'borders'; color: string; opacity: number }) {
  const pos = useSegments(kind)
  const geo = useMemo(() => new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(pos, 3)), [pos])
  useEffect(() => () => geo.dispose(), [geo])
  return (
    <lineSegments geometry={geo} renderOrder={1} frustumCulled={false}>
      <lineBasicMaterial color={color} transparent opacity={opacity} depthWrite={false} />
    </lineSegments>
  )
}

const cityPos = (() => {
  const a = new Float32Array(CITIES.length * 3)
  CITIES.forEach((c, i) => latLonToXyz(c.lat, c.lon, 1, a, i * 3))
  return a
})()

function Cities({ radius }: { radius: number }) {
  const [n, setN] = useState(0)
  const geo = useMemo(() => new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(cityPos, 3)), [])
  useEffect(() => () => geo.dispose(), [geo])
  useFrame(({ camera }) => {
    const k = labelCount(camera.position.length() / radius)
    if (k !== n) setN(k)
  })
  const dots = useMemo(() => new THREE.PointsMaterial({ color: '#ffd9a0', size: 4.5, sizeAttenuation: false, transparent: true, depthWrite: false, alphaTest: 0.05 }), [])
  return (
    <>
      <points geometry={geo} material={dots} renderOrder={2} frustumCulled={false} />
      {CITIES.slice(0, n).map((c, i) => (
        <group key={c.name} position={[cityPos[i * 3], cityPos[i * 3 + 1], cityPos[i * 3 + 2]]}>
          <Label className="cl-lo bg-black/40 text-[10px]">{c.name}</Label>
        </group>
      ))}
    </>
  )
}

export function EarthOverlays({ radius, layers }: { radius: number; layers: Layers }) {
  if (!layers.coast && !layers.borders && !layers.cities) return null
  return (
    <group scale={radius * LIFT}>
      {layers.coast && <Lines kind="coast" color="#cfe8ff" opacity={0.55} />}
      {layers.borders && <Lines kind="borders" color="#ffcf7a" opacity={0.5} />}
      {layers.cities && <Cities radius={radius} />}
    </group>
  )
}
