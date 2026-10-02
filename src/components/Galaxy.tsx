import { Flight } from './galaxy/Flight'
import { MilkyWay, Markers, TargetMark } from './galaxy/GalaxyField'
export { GalaxyPanel } from './galaxy/Panel'

/** Rendered inside the shared <Canvas> when view === 'galaxy'. Camera placement lives in <Flight/> (mode-dependent). */
export function GalaxyScene() {
  return (
    <>
      <MilkyWay />
      <Markers />
      <TargetMark />
      <Flight />
    </>
  )
}
