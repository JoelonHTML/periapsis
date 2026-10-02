// Native (Capacitor/Android) integration: hardware back button. No-op in a browser.
import { Capacitor } from '@capacitor/core'
import { App } from '@capacitor/app'
import { SplashScreen } from '@capacitor/splash-screen'
import { StatusBar, Style } from '@capacitor/status-bar'
import { store } from '@/lib/store'
import { ui } from '@/lib/ui-store'

if (Capacitor.isNativePlatform()) {
  // dark UI: light status-bar icons, app draws behind the bars (the layout pads with env(safe-area-inset-*)), splash goes once React is up
  void StatusBar.setStyle({ style: Style.Dark }).catch(() => {})
  void StatusBar.setOverlaysWebView({ overlay: true }).catch(() => {})
  requestAnimationFrame(() => void SplashScreen.hide().catch(() => {}))
  // Back closes the innermost thing first: settings → flyby close-up → full drawer → half drawer → (then leaves the app)
  void App.addListener('backButton', () => {
    const u = ui.get()
    if (u.settingsOpen) ui.set({ settingsOpen: false })
    else if (store.get().view === 'flyby') store.set({ view: 'solar' })
    else if (u.sheet === 'full') ui.set({ sheet: 'half' })
    else if (u.sheet === 'half') ui.set({ sheet: 'closed' })
    else void App.minimizeApp()
  })
}
