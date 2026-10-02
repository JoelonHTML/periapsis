import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Line } from '@react-three/drei'
import * as THREE from 'three'
import { Dot, EARLY, Label, v3 } from '@/components/kit'
import { useT } from '@/lib/i18n'
import { useSettings } from '@/lib/settings'
import { clock, useApp, type View } from '@/lib/store'
import { useUi } from '@/lib/ui-store'
import { missionById } from './data'
import './i18n'
import { eventPosition, reconstruct, samplePath, stateAt, type Recon } from './recon'
import { missionsUi } from './store'
import { eventTitle, fmtEvDate, legColor } from './texts'

const S_SOL = 1e-6 // scene units per km, same as the solar view

/** One leg: faded full arc plus a bright, growing "already flown" part (setDrawRange, no React renders). */
function LegLine({ pts, ts, color }: { pts: THREE.Vector3[]; ts: number[]; color: string }) {
  const flown = useMemo(() => {
    const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color }))
    l.frustumCulled = false
    return l
  }, [pts, color])
  useEffect(() => () => { flown.geometry.dispose(); (flown.material as THREE.Material).dispose() }, [flown])
  useFrame(() => {
    const t = clock.t
    let lo = 0, hi = ts.length
    while (lo < hi) { const m = (lo + hi) >> 1; if (ts[m] <= t) lo = m + 1; else hi = m }
    flown.geometry.setDrawRange(0, lo)
  }, EARLY)
  return (
    <>
      <Line points={pts} color={color} lineWidth={1.4} transparent opacity={0.28} />
      <primitive object={flown} />
    </>
  )
}

function Craft({ rc, label }: { rc: Recon; label: boolean }) {
  const g = useRef<THREE.Group>(null)
  const [on, setOn] = useState(false) // labels are DOM overlays: they must be unmounted, not just hidden, outside the flight
  useFrame(() => {
    const s = stateAt(rc, clock.t)
    if (s && g.current) v3(s.r, S_SOL, g.current.position)
    if (!!s !== on) setOn(!!s)
  }, EARLY)
  return (
    <group ref={g}>
      {on && <Dot color="#fde047" size={11} />}
      {on && label && (
        <Label className="cl-s0 mt-3 bg-transparent p-0 backdrop-blur-none">
          <span className="rounded-md bg-yellow-300 px-1.5 py-0.5 text-[11px] font-semibold text-black">{rc.mission.name}</span>
        </Label>
      )}
    </group>
  )
}

function MissionPath({ id }: { id: string }) {
  const t = useT()
  const lang = useSettings((s) => s.lang)
  const labels = useApp((s) => s.showLabels)
  const m = missionById(id)!
  const rc = useMemo(() => reconstruct(m), [m])
  const legs = useMemo(() => {
    if (rc.error) return []
    const p = samplePath(rc, 160)
    return rc.legs.map((_, k) => {
      const idx = p.legIdx.map((l, i) => (l === k ? i : -1)).filter((i) => i >= 0)
      return { pts: idx.map((i) => v3(p.pts[i], S_SOL)), ts: idx.map((i) => p.ts[i]) }
    })
  }, [rc])
  const markers = useMemo(
    () => m.events.map((e) => ({ e, pos: eventPosition(rc, e) })).filter((x): x is { e: typeof x.e; pos: NonNullable<typeof x.pos> } => !!x.pos),
    [m, rc],
  )
  if (rc.error) return null
  return (
    <>
      {legs.map((l, k) => <LegLine key={`${id}-${k}`} pts={l.pts} ts={l.ts} color={legColor(k)} />)}
      {markers.map(({ e, pos }, i) => {
        const node = e.kind === 'launch' || e.kind === 'flyby' || e.kind === 'arrival'
        return (
          <group key={`${id}-e${i}`} position={v3(pos, S_SOL)}>
            <Dot color={node ? '#f8fafc' : '#94a3b8'} size={node ? 8 : 6} />
            {labels && (
              <Label className="cl-ev -mt-9 border border-white/10">
                <b>{eventTitle(e, t, lang)}</b>
                <br />{fmtEvDate(e)}
              </Label>
            )}
          </group>
        )
      })}
      <Craft rc={rc} label={labels} />
    </>
  )
}

/** Reconstructed path of the selected real mission (solar view, Missies tab only). */
export function MissionsSceneLayer({ view }: { view: View }) {
  const id = missionsUi.useStore((s) => s.selected)
  const tab = useUi((s) => s.tab)
  if (view !== 'solar' || tab !== 'missions' || !id || !missionById(id)) return null
  return <MissionPath id={id} />
}
