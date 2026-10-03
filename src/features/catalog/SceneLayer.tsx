// Comets and asteroids toggled on in the catalogue tab, drawn in the solar view only. Frame and scale are exactly those of SolarScene
// (Scene.tsx): SBDB elements are heliocentric ecliptic J2000, like the planets' bodyState(); positions in km are mapped with
// v3() = (x, z, −y) and S_SOL = 1e-6 scene units per km (1 unit = 1 million km), the same as planets and their orbit lines.
import { Line } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { Dot, EARLY, Label, v3 } from '@/components/kit'
import { clock, useApp, type View } from '@/lib/store'
import { useUi } from '@/lib/ui-store'
import { smallOrbit, smallState, SMALL_LIST, type Small } from './sbdb.ts'
import { cat, smallEntry } from './store'

const S_SOL = 1e-6

function SmallBody({ s, name, color, label }: { s: Small; name: string; color: string; label: boolean }) {
  const g = useRef<THREE.Group>(null)
  const pts = useMemo(() => smallOrbit(s, 360).map((p) => v3(p, S_SOL)), [s])
  useFrame(() => { v3(smallState(s, clock.t).r, S_SOL, g.current!.position) }, EARLY)
  return (
    <>
      <Line points={pts} color={color} lineWidth={1.2} transparent opacity={0.7} />
      <group ref={g}>
        <Dot color={color} size={8} />
        {label && <Label className="cl-s1">{name}</Label>}
      </group>
    </>
  )
}

export function CatalogSceneLayer({ view }: { view: View }) {
  const tab = useUi((s) => s.tab)
  const labels = useApp((s) => s.showLabels)
  const shown = cat.useStore((s) => s.shown)
  const small = cat.useStore((s) => s.small)
  if (view !== 'solar' || tab !== 'catalog' || !shown.length) return null
  return (
    <>
      {shown.map((id) => {
        const data = smallEntry({ small }, id).data
        const item = SMALL_LIST.find((x) => x.id === id)
        return data && item ? <SmallBody key={id} s={data} name={item.label} color={item.color} label={labels} /> : null
      })}
    </>
  )
}
