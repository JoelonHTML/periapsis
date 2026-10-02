import { Capacitor } from '@capacitor/core'
import { Haptics, ImpactStyle } from '@capacitor/haptics'
import { settings } from './settings.ts'

const on = () => Capacitor.isNativePlatform() && settings.get().haptics
/** Light tick for a button press. No-op in a browser or when switched off in the settings. */
export function tap() { if (on()) void Haptics.impact({ style: ImpactStyle.Light }).catch(() => {}) }
/** Firmer tick when something snaps into place (drawer, tab). */
export function snap() { if (on()) void Haptics.impact({ style: ImpactStyle.Medium }).catch(() => {}) }
