const { contextBridge, ipcRenderer } = require('electron')
contextBridge.exposeInMainWorld('periapsisDesktop', {
  fetch: (url, headers) => ipcRenderer.invoke('periapsis:fetch', url, headers),
  openExternal: (url) => ipcRenderer.invoke('periapsis:openExternal', url),
  info: () => ipcRenderer.invoke('periapsis:info'),
  checkUpdate: () => ipcRenderer.invoke('periapsis:checkUpdate'),
  installUpdate: () => ipcRenderer.invoke('periapsis:installUpdate'),
  updateState: () => ipcRenderer.invoke('periapsis:updateState'),
  onUpdate: (cb) => { const h = (_e, m) => cb(m); ipcRenderer.on('periapsis:update', h); return () => ipcRenderer.removeListener('periapsis:update', h) },
})
