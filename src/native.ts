// Native (Capacitor/Android) integration: hardware back button. No-op in a browser.
import { Capacitor } from '@capacitor/core'
import { App } from '@capacitor/app'
import { SplashScreen } from '@capacitor/splash-screen'
import { StatusBar, Style } from '@capacitor/status-bar'
import { store } from '@/lib/store'
import { ui } from '@/lib/ui-store'
import { endTour, tour } from '@/lib/tour-store'

/** Hide the native splash (launchAutoHide is off): called when the 3D canvas has rendered its first frame. */
export function hideSplash() {
  if (Capacitor.isNativePlatform()) void SplashScreen.hide().catch(() => {})
}

if (Capacitor.isNativePlatform()) {
  // dark UI: light status-bar icons, app draws behind the bars (the layout pads with env(safe-area-inset-*)), splash goes once React is up
  void StatusBar.setStyle({ style: Style.Dark }).catch(() => {})
  void StatusBar.setOverlaysWebView({ overlay: true }).catch(() => {})
  setTimeout(hideSplash, 4000) // safety: never leave the splash up if WebGL is slow or fails
  // Back closes the innermost thing first: settings → tour → flyby close-up → full drawer → half drawer → start screen → (then leaves the app)
  void App.addListener('backButton', () => {
    const u = ui.get()
    if (u.settingsOpen) ui.set({ settingsOpen: false })
    else if (tour.get().phase !== 'off') endTour('skipped')
    else if (store.get().view === 'flyby') store.set({ view: 'solar' })
    else if (u.sheet === 'full') ui.set({ sheet: 'half' })
    else if (u.sheet === 'half') ui.set({ sheet: 'closed' })
    else if (!u.home) ui.set({ home: true }) // back to the start screen before leaving the app
    else void App.minimizeApp()
  })
}
