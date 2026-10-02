import { useEffect, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { Download, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { checkForUpdate, type Update } from '@/lib/update'

const SKIP_KEY = 'periapsis.update.skip' // version the user answered "Later" to: don't ask again for that one

/** Android app only: on start, looks for a newer GitHub release and offers to download its APK. */
export function UpdateBanner() {
  const [update, setUpdate] = useState<Update | null>(null)
  useEffect(() => {
    if (import.meta.env.DEV && location.hash.includes('fakeupdate')) { // dev: preview the banner in a browser
      setUpdate({ version: '9.9.9', apkUrl: '#', notes: '' })
      return
    }
    if (!Capacitor.isNativePlatform()) return
    let alive = true
    checkForUpdate().then((u) => {
      if (alive && u && localStorage.getItem(SKIP_KEY) !== u.version) setUpdate(u)
    })
    return () => { alive = false }
  }, [])
  if (!update) return null
  const later = () => { localStorage.setItem(SKIP_KEY, update.version); setUpdate(null) }
  return (
    <div role="status" className="update-banner absolute top-[max(0.75rem,env(safe-area-inset-top))] left-1/2 z-50 flex w-[min(22rem,calc(100vw-1rem))] -translate-x-1/2 items-center gap-2 rounded-xl border bg-card/95 p-2.5 pl-3.5 shadow-lg backdrop-blur">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">Versie {update.version} beschikbaar</div>
        <div className="text-[11px] text-muted-foreground">Download de nieuwe APK en tik erop om te installeren.</div>
      </div>
      {/* ponytail: leaving the app's origin makes Capacitor hand the URL to the system browser, which downloads the APK;
          a native download+install plugin would make this one tap less */}
      <Button size="sm" onClick={() => { window.location.href = update.apkUrl }}><Download /> Bijwerken</Button>
      <Button size="icon" variant="ghost" aria-label="Later" title="Later" onClick={later}><X /></Button>
    </div>
  )
}
