const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('privacyBrowser', {
  onOpenInNewTab: (handler) => {
    ipcRenderer.on('open-in-new-tab', (_event, url) => handler(url));
  },
  wipeSession: () => ipcRenderer.invoke('wipe-session')
});
