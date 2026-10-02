import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'nl.periapsis.app',
  appName: 'Periapsis',
  webDir: 'dist',
  backgroundColor: '#04060b', // WebView background: no white flash while loading
  plugins: {
    // dark-only UI: light status/navigation bar icons from the very first frame, app draws behind the bars (padded with env(safe-area-inset-*))
    SystemBars: { style: 'DARK', insetsHandling: 'css', initialViewportFitValueHint: 'cover' },
    StatusBar: { style: 'DARK', overlaysWebView: true, backgroundColor: '#00000000' },
    LocalNotifications: { smallIcon: 'ic_stat_periapsis', iconColor: '#22d3ee' }, // monochrome status-bar icon (res/drawable)
    SplashScreen: { launchAutoHide: false, launchShowDuration: 0, backgroundColor: '#04060b' },
  },
};

export default config;
