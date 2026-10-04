// The Windows build (desktop/) wraps this same web app in Electron and exposes `window.periapsisDesktop` (desktop/preload.cjs).
// Everything here is a no-op in a browser or in the Android app.
import { updates } from './update-store.ts'

export interface DesktopBridge {
  fetch(url: string, headers?: Record<string, string>): Promise<{ status: number; body: string; error?: string }>
  openExternal(url: string): Promise<void>
  info(): Promise<{ portable: boolean; version: string; packaged: boolean }>
  checkUpdate(): Promise<boolean>
  installUpdate(): Promise<unknown>
  onUpdate(cb: (m: DesktopUpdateMsg) => void): () => void
}
export type DesktopUpdateMsg = { type: 'available' | 'downloaded'; version: string } | { type: 'progress'; percent: number } | { type: 'error'; message: string }

export const desktop = (): DesktopBridge | null => (globalThis as { periapsisDesktop?: DesktopBridge }).periapsisDesktop ?? null
export const isDesktop = () => desktop() !== null

let portable = false
/** Start listening to the installer's automatic updates (download in the background → "Herstart" banner). Call once at start. */
export function initDesktop() {
  const d = desktop()
  if (!d) return
  void d.info().then((i) => { portable = i.portable })
  let latest: { version: string; apkUrl: string; notes: string } | null = null
  d.onUpdate((m) => {
    if (m.type === 'available') { latest = { version: m.version, apkUrl: '', notes: '' }; updates.set({ s: { phase: 'downloading', latest } }) }
    else if (m.type === 'progress' && latest) updates.set({ s: { phase: 'downloading', latest, pct: m.percent } })
    else if (m.type === 'downloaded') updates.set({ s: { phase: 'readyrestart', latest: latest ?? { version: m.version, apkUrl: '', notes: '' } } })
    else if (m.type === 'error' && latest) updates.set({ s: { phase: 'applyfail', latest, why: 'bad-file' } })
  })
}
export const isPortable = () => portable
