const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('chromecastinum', {
  onOpenInNewTab: (handler) => {
    ipcRenderer.on('open-in-new-tab', (_event, url) => handler(url));
  },
  wipeSession: () => ipcRenderer.invoke('wipe-session'),
  setOverrides: (o) => ipcRenderer.invoke('set-overrides', o),
  getOverrides: () => ipcRenderer.invoke('get-overrides')
});
