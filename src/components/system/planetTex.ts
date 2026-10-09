// Real planet/Moon maps: a ~2k default is bundled (src/assets/planets); a 4k/8k "HD" version is fetched on demand from a fixed git tag of
// this repo (textures/, see HD_BASE) when the camera gets close. Any failure (offline, blocked, 404) silently keeps the bundled map.
// Maps: Solar System Scope (CC BY 4.0, derived from NASA data), see PLANET_CREDITS.
import * as THREE from 'three'
import { getCaps } from '@/features/earth/caps'
import { selectTier } from '@/features/earth/tier'
import { createStore } from '@/lib/mini-store'
import CALLISTO from '@/assets/planets/callisto.jpg'
import ENCELADUS from '@/assets/planets/enceladus.jpg'
import EUROPA from '@/assets/planets/europa.jpg'
import GANYMEDE from '@/assets/planets/ganymede.jpg'
import IO from '@/assets/planets/io.jpg'
import JUPITER from '@/assets/planets/jupiter.jpg'
import MARS from '@/assets/planets/mars.jpg'
import MERCURY from '@/assets/planets/mercury.jpg'
import MOON from '@/assets/planets/moon.jpg'
import NEPTUNE from '@/assets/planets/neptune.jpg'
import SATURN from '@/assets/planets/saturn.jpg'
import SATURN_RING from '@/assets/planets/saturn-ring.png'
import TITAN from '@/assets/planets/titan.jpg'
import URANUS from '@/assets/planets/uranus.jpg'
import VENUS from '@/assets/planets/venus.jpg'

/** Bundled map per body texture kind (kinds without an entry keep their procedural texture). */
export const PLANET_MAPS: Record<string, string> = { mercury: MERCURY, mars: MARS, jupiter: JUPITER, saturn: SATURN, uranus: URANUS, neptune: NEPTUNE, moon: MOON,
  venus: VENUS, io: IO, europa: EUROPA, ganymede: GANYMEDE, callisto: CALLISTO, titan: TITAN, enceladus: ENCELADUS }
export { SATURN_RING }

// Immutable commit that contains textures/ (the browser cache relies on it never changing). After merging a commit that adds files to
// textures/, set this to that commit's hash (the files below only exist from that commit on; until then they 404 and the bundled map stays).
export const HD_COMMIT = '22120a490927afa81d8ebee22add99f8e5b8fd3a'
export const HD_BASE = `https://raw.githubusercontent.com/JoelonHTML/periapsis/${HD_COMMIT}/textures/`
const HD: Record<string, { k4: string; k8?: string }> = {
  mercury: { k4: 'mercury-4k.jpg', k8: 'mercury-8k.jpg' }, mars: { k4: 'mars-4k.jpg', k8: 'mars-8k.jpg' }, moon: { k4: 'moon-4k.jpg', k8: 'moon-8k.jpg' },
  jupiter: { k4: 'jupiter-4k.jpg', k8: 'jupiter-8k.jpg' }, saturn: { k4: 'saturn-4k.jpg' },
  io: { k4: 'io-4k.jpg' }, europa: { k4: 'europa-4k.jpg' }, callisto: { k4: 'callisto-4k.jpg' }, titan: { k4: 'titan-4k.jpg' }, enceladus: { k4: 'enceladus-4k.jpg' },
}

export const PLANET_CREDITS = {
  who: 'Solar System Scope textures (solarsystemscope.com/textures), derived from NASA imagery; recompressed/resized, hosted via the open-source repo of computationalcore/worldline-kinematics',
  licence: 'CC BY 4.0',
}
/** Moon maps as redistributed in CosmoScout VR (DLR, plugins/csp-simple-bodies/textures, credit table there); recompressed. */
export const MOON_CREDITS = {
  who: 'Io: USGS Voyager/Galileo SSI global mosaic (public domain). Ganymede: USGS Voyager/Galileo mosaic. Enceladus: NASA/JPL/SSI Cassini colour map PIA18435 (public domain). Titan: USGS/Cassini ISS global mosaic 4 km (infrared, tinted warm here). Europa, Callisto: John van Vliet (Celestia Motherlode), from Voyager/Galileo data',
  licence: 'Public domain (NASA/USGS); Europa and Callisto: CC (type not stated by the source)',
}

export type HdMode = 'auto' | 'on' | 'off'
const KEY = 'periapsis.hdtex.v1'
const read = (): HdMode => { try { const v = localStorage.getItem(KEY); return v === 'on' || v === 'off' ? v : 'auto' } catch { return 'auto' } }
export const hdSetting = createStore<{ mode: HdMode }>({ mode: read() })
export function setHdMode(mode: HdMode) { hdSetting.set({ mode }); try { localStorage.setItem(KEY, mode) } catch { /* private mode */ } }

/** File to fetch for this body (null = no HD map or HD disabled): 8k only on strong desktops, 4k elsewhere, nothing on weak/data-saving devices in auto. */
export function hdFile(kind: string): string | null {
  const h = HD[kind], mode = hdSetting.get().mode
  if (!h || mode === 'off') return null
  const c = getCaps(), tier = selectTier(c)
  const saver = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData
  if (mode === 'auto' && (tier === 'low' || saver)) return null
  return h.k8 && tier === 'high' && c.maxTextureSize >= 8192 ? h.k8 : c.maxTextureSize >= 4096 ? h.k4 : null
}

const cache = new Map<string, Promise<THREE.Texture | null>>() // ponytail: never disposed (≤5 bodies); add ref-counting like earth/textures.ts if memory matters
export function loadHd(kind: string): Promise<THREE.Texture | null> {
  const f = hdFile(kind)
  if (!f) return Promise.resolve(null)
  let p = cache.get(f)
  if (!p) {
    p = new Promise<THREE.Texture | null>((res) => {
      const l = new THREE.TextureLoader(); l.setCrossOrigin('anonymous')
      l.load(HD_BASE + f, (t) => {
        t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter
        res(t)
      }, undefined, () => { cache.delete(f); res(null) })
    })
    cache.set(f, p)
  }
  return p
}
