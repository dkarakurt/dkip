const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('dkip', {
  openExternal: (url, title, vlcPath) => ipcRenderer.invoke('open-external', { url, title, vlcPath }),
  setUserAgent: (ua) => ipcRenderer.invoke('set-ua', ua),
  copyText: (text) => ipcRenderer.invoke('copy-text', text),
  toggleFullscreen: () => ipcRenderer.invoke('toggle-fullscreen'),
  version: () => ipcRenderer.invoke('app-version')
});
