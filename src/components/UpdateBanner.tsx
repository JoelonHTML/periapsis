import { useEffect, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { Download, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useT } from '@/lib/i18n'
import { canInstallInApp } from '@/lib/apk-install'
import { applyUpdate, updates, refreshUpdates, useUpdates } from '@/lib/update-store'

const SKIP_KEY = 'periapsis.update.skip' // version the user answered "Later" to: don't ask again for that one

/** Leaving the app's origin makes Capacitor hand the URL to the system browser, which downloads the APK
 *  (a native download+install plugin would save the user one tap). */
/** Only the Android app can swap its own web build, and only if the release carries one. */
export const canLiveUpdate = (u: { htmlUrl?: string }) => Capacitor.isNativePlatform() && (!!u.htmlUrl || canInstallInApp())

export function downloadApk(url: string) { window.location.href = url }

/** Android app only: on start, looks for a newer GitHub release and offers to download its APK.
 *  Reads the same store as the settings button, so both always show the same answer. */
export function UpdateBanner() {
  const t = useT()
  const st = useUpdates((s) => s.s)
  const [skipped, setSkipped] = useState(() => localStorage.getItem(SKIP_KEY))
  useEffect(() => {
    if (import.meta.env.DEV && location.hash.includes('fakeupdate')) { // dev: preview the banner in a browser
      updates.set({ s: { phase: 'available', latest: { version: '9.9.9', apkUrl: '#', notes: '' } } })
      return
    }
    if (Capacitor.isNativePlatform()) void refreshUpdates()
  }, [])
  const update = st.phase === 'available' && skipped !== st.latest.version ? st.latest : null
  if (!update) return null
  const live = canLiveUpdate(update)
  const later = () => { localStorage.setItem(SKIP_KEY, update.version); setSkipped(update.version) }
  return (
    <div role="status" className="update-banner absolute top-[max(0.75rem,env(safe-area-inset-top))] left-1/2 z-50 flex w-[min(22rem,calc(100vw-1rem))] -translate-x-1/2 items-center gap-2 rounded-xl border bg-card/95 p-2.5 pl-3.5 shadow-lg backdrop-blur">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{t('ban.title', { v: update.version })}</div>
        <div className="text-[11px] text-muted-foreground">{live ? t('ban.live') : t('ban.apk')}</div>
      </div>
      <Button size="sm" onClick={() => (live ? void applyUpdate(update) : downloadApk(update.apkUrl))}><Download /> {t('ban.update')}</Button>
      <Button size="icon" variant="ghost" aria-label={t('ban.later')} title={t('ban.later')} onClick={later}><X /></Button>
    </div>
  )
}
