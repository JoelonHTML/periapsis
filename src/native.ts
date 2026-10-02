// Native (Capacitor/Android) integration: hardware back button. No-op in a browser.
import { Capacitor } from '@capacitor/core'
import { App } from '@capacitor/app'
import { store } from '@/lib/store'
import { ui } from '@/lib/ui-store'

if (Capacitor.isNativePlatform()) {
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
