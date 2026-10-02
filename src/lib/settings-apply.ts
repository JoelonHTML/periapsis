import { Capacitor } from '@capacitor/core'
import { KeepAwake } from '@capacitor-community/keep-awake'
import { SPEEDS, setSpeedNow, store } from './store.ts'
import { SPEED_COUNT, setSetting, settings, type Settings } from './settings.ts'

if (SPEEDS.length !== SPEED_COUNT) throw new Error('SPEED_COUNT in settings.ts is out of sync with SPEEDS')

let wake: WakeLockSentinel | null = null
async function keepAwake(on: boolean) {
  try {
    if (Capacitor.isNativePlatform()) { await (on ? KeepAwake.keepAwake() : KeepAwake.allowSleep()); return }
    if (on && !wake && 'wakeLock' in navigator) { wake = await navigator.wakeLock.request('screen'); wake.addEventListener('release', () => { wake = null }) }
    else if (!on) { await wake?.release(); wake = null }
  } catch { /* unsupported or refused (e.g. low battery): the setting just has no effect */ }
}

function apply(s: Settings, prev?: Settings) {
  store.set({ showLabels: s.showLabels, trueScale: s.trueScale })
  if (!prev || prev.speedIdx !== s.speedIdx) setSpeedNow(SPEEDS[s.speedIdx].s)
  document.documentElement.toggleAttribute('data-reduce-motion', s.reduceMotion)
  document.documentElement.lang = s.lang
  if (!prev || prev.keepAwake !== s.keepAwake) void keepAwake(s.keepAwake)
}

/** Push the saved settings into the app once, then keep both directions in sync:
 *  settings → store/clock/DOM, and the Weergave card's switches → settings (so they persist too). */
export function initSettings() {
  apply(settings.get())
  let prev = settings.get()
  settings.subscribe(() => { const s = settings.get(); apply(s, prev); prev = s })
  store.subscribe(() => {
    const { showLabels, trueScale } = store.get()
    if (showLabels !== settings.get().showLabels) setSetting('showLabels', showLabels)
    if (trueScale !== settings.get().trueScale) setSetting('trueScale', trueScale)
  })
  // the OS drops a web wake lock when the tab is hidden; take it again on return
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && settings.get().keepAwake) void keepAwake(true) })
}
