// Detail tiles for the Moon/Mars/Mercury, under the same "Detail-beelden laden" setting and device tier as the Earth.
// Render inside a group that has the body's own orientation (pole = +y of the group, longitude 0 = +x) and scale = radius.
import { BODY_TILES, isTiled } from './bodyTiles'
import { useEarthConfig } from './EarthBody'
import { EarthTiles } from './EarthTiles'
import { earthSettings } from './settings'
import { detailEnabled } from './tiles'

const MIN_Z = 3 // geographic level 3 = 4096 px around, about the bundled HD map
export function BodyTiles({ kind }: { kind: string }) {
  const { cfg } = useEarthConfig()
  const mode = earthSettings.useStore((s) => s.detail)
  if (!isTiled(kind) || !detailEnabled(mode, cfg.tier === 'low', !!(navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData)) return null
  return <EarthTiles radius={1} body={kind} src={BODY_TILES[kind]} minZ={MIN_Z} tileCache={Math.round(cfg.tileCache / 2)} plain />
}
