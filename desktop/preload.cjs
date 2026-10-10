const { contextBridge, ipcRenderer } = require('electron')
contextBridge.exposeInMainWorld('periapsisDesktop', {
  fetch: (url, headers) => ipcRenderer.invoke('periapsis:fetch', url, headers),
  openExternal: (url) => ipcRenderer.invoke('periapsis:openExternal', url),
  info: () => ipcRenderer.invoke('periapsis:info'),
  checkUpdate: () => ipcRenderer.invoke('periapsis:checkUpdate'),
  installUpdate: () => ipcRenderer.invoke('periapsis:installUpdate'),
  updateState: () => ipcRenderer.invoke('periapsis:updateState'),
  updateLog: () => ipcRenderer.invoke('periapsis:updateLog'),
  openInstaller: () => ipcRenderer.invoke('periapsis:openInstaller'),
  alertsConfig: (o) => ipcRenderer.invoke('periapsis:alertsConfig', o),
  alertsStatus: () => ipcRenderer.invoke('periapsis:alertsStatus'),
  alertsCheckNow: () => ipcRenderer.invoke('periapsis:alertsCheckNow'),
  notify: (n) => ipcRenderer.invoke('periapsis:notify', n),
  onNavigate: (cb) => { const h = (_e, l) => cb(l); ipcRenderer.on('periapsis:navigate', h); return () => ipcRenderer.removeListener('periapsis:navigate', h) },
  onUpdate: (cb) => { const h = (_e, m) => cb(m); ipcRenderer.on('periapsis:update', h); return () => ipcRenderer.removeListener('periapsis:update', h) },
})
