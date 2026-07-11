const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('chromecastinum', {
  onOpenInNewTab: (handler) => {
    ipcRenderer.on('open-in-new-tab', (_event, url) => handler(url));
  },
  wipeSession: () => ipcRenderer.invoke('wipe-session'),
  applyZip: (zip) => ipcRenderer.invoke('apply-zip', zip),
  clearOverrides: () => ipcRenderer.invoke('clear-overrides'),
  proxyList: () => ipcRenderer.invoke('proxy-list'),
  proxyAdd: (p) => ipcRenderer.invoke('proxy-add', p),
  proxyDelete: (id) => ipcRenderer.invoke('proxy-delete', id),
  proxySelect: (id) => ipcRenderer.invoke('proxy-select', id)
});
