// Imperative bits shared by the Stage, the info card and the panel: what the render loop computed last, hints, "go to object".
import { toMs } from '../../lib/astro.ts'
import { clock } from '../../lib/store.ts'
import { observer } from '../../lib/observer.ts'
import { t } from '../../lib/i18n.ts'
import { computeBodies, computeSats, describe, objectAltAz, skyCtx, type Bodies, type Obj, type SatPos } from './scene.ts'
import { tap } from '../../lib/haptics.ts'
import { view } from './state.ts'

/** What the loop computed last (read by the info card and by `gotoObj`). */
export const live: { b: Bodies | null; sats: SatPos[]; ms: number } = { b: null, sats: [], ms: Date.now() }
export const simMs = () => toMs(clock.t)
export const siteNow = () => { const o = observer.get(); return { lat: o.lat, lon: o.lon, altM: o.altM } }
export const clampAlt = (a: number) => Math.max(-89.9, Math.min(89.9, a))
export const PLANET_IDS = ['mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune']
let hintTimer: ReturnType<typeof setTimeout> | undefined
export function showHint(text: string, ms = 5000) { clearTimeout(hintTimer); view.set({ hint: text }); if (text) hintTimer = setTimeout(() => view.set({ hint: '' }), ms) }

/** Select an object and turn the view to it (not in AR, where the screen follows the phone and an arrow points the way). */
export function gotoObj(o: Obj) {
  const ms = simMs(), site = siteNow(), b = live.b ?? computeBodies(ms, site)
  const sats = live.sats.length || o.k !== 'sat' ? live.sats : computeSats(skyCtx.sats, ms, site)
  const aa = objectAltAz(o, ms, site, b, sats)
  view.set({ sel: o })
  if (!aa) return
  if (view.get().ar !== 'on') view.set({ az: aa.az, alt: Math.max(aa.alt, 4) })
  if (aa.alt < 0) showHint(t('sv.belowHint', { n: describe(o, ms, site, b, sats)?.title ?? '' }))
}

/** AR on/off. iOS asks for permission (must run inside a tap handler). */
export async function toggleAr() {
  tap()
  const st = view.get().ar
  if (st === 'on' || st === 'asking') { view.set({ ar: 'off' }); showHint(''); return }
  view.set({ ar: 'asking' })
  const DOE = (window as unknown as { DeviceOrientationEvent?: { requestPermission?: () => Promise<string> } }).DeviceOrientationEvent
  try {
    if (DOE?.requestPermission) { const r = await DOE.requestPermission(); if (r !== 'granted') { view.set({ ar: 'denied' }); showHint(t('sv.ar.denied'), 7000); return } }
  } catch { view.set({ ar: 'denied' }); showHint(t('sv.ar.denied'), 7000); return }
  if (!DOE && !('ondeviceorientation' in window)) { view.set({ ar: 'nosensor' }); showHint(t('sv.ar.none'), 6000); return }
  view.set({ ar: 'on', fov: Math.min(view.get().fov, 70) })
}
