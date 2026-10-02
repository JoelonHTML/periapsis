// Selected satellites in the 3D Earth view. Frame and scale are exactly those of EarthScene (Scene.tsx):
// scene units = km × 1e-3 (S_EAR), axes via v3() = (x, z, −y) of the J2000 equatorial frame, and the Earth mesh turns with
// gmst(clock.t) about the scene's y axis. SGP4 output is TEME; we use TEME ≈ J2000 equatorial (precession since 2000 ≈ 0.36°,
// i.e. ~40 km at LEO altitude; invisible at this scale). The orbit ring is one revolution from "now", fixed in inertial space like
// the planned orbit, so it stays consistent with the rotating Earth.
import { Line } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { Dot, EARLY, Label, Occluder, v3 } from '@/components/kit'
import { RE, toMs } from '@/lib/astro'
import { clock, useApp, type View } from '@/lib/store'
import { orbitInfo, temeAt } from './orbit'
import { SEL_COLORS, useSats } from './state'
import { satrecOf, type SatRecord } from './tle'

const S_EAR = 1e-3 // same as Scene.tsx: 1 scene unit = 1000 km

function SatMarker({ rec, color, label }: { rec: SatRecord; color: string; label: boolean }) {
  const sr = satrecOf(rec)
  const g = useRef<THREE.Group>(null)
  const [bucket, setBucket] = useState(0)
  const built = useRef(NaN), lastBuild = useRef(0)
  useFrame(() => {
    if (!sr) return
    const s = temeAt(sr, toMs(clock.t))
    g.current!.visible = !!s
    if (s) v3(s.r, S_EAR, g.current!.position)
    // rebuild the ring when the clock has moved a fair bit (or jumped)
    if (!(Math.abs(clock.t - built.current) < 300) && performance.now() - lastBuild.current > 500) { built.current = clock.t; lastBuild.current = performance.now(); setBucket((b) => b + 1) }
  }, EARLY)
  const ring = useMemo(() => {
    if (!sr || !Number.isFinite(built.current)) return null
    const P = orbitInfo(sr).periodS, n = 180, t0 = toMs(built.current)
    const pts: THREE.Vector3[] = []
    for (let k = 0; k <= n; k++) {
      const s = temeAt(sr, t0 + (k / n) * P * 1000)
      if (s) pts.push(v3(s.r, S_EAR))
    }
    return pts.length > 2 ? pts : null
  }, [sr, bucket]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!sr) return null
  return (
    <>
      {ring && <Line points={ring} color={color} lineWidth={1.4} transparent opacity={0.8} />}
      <group ref={g}>
        <Dot color={color} size={9} />
        {label && <Label className="cl-s1">{rec.name}</Label>}
      </group>
    </>
  )
}

export function SatsSceneLayer({ view }: { view: View }) {
  const selected = useSats((s) => s.selected)
  const labels = useApp((s) => s.showLabels)
  if ((view !== 'earth' && view !== 'earthmoon') || !selected.length) return null
  return (
    <Occluder.Provider value={RE * S_EAR}>
      {selected.map((r, i) => <SatMarker key={r.norad} rec={r} color={SEL_COLORS[i % 4]} label={labels} />)}
    </Occluder.Provider>
  )
}
