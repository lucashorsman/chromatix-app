const { contextBridge, ipcRenderer } = require('electron');

// Expose Electron status flags matching Chromatix's internal expectations
contextBridge.exposeInMainWorld('isElectron', true);
contextBridge.exposeInMainWorld('electronProcess', {
  platform: 'win',
  appVersion: '0.4.0',
  buildDate: Math.floor(Date.now() / 1000).toString(),
});

// Expose standard IPC interface
contextBridge.exposeInMainWorld('ipcRenderer', {
  send: (channel, data) => {
    ipcRenderer.send(channel, data);
  },
  on: (channel, func) => {
    const handler = (event, ...args) => func(event, ...args);
    ipcRenderer.on(channel, handler);
    return handler;
  },
  removeListener: (channel, func) => {
    ipcRenderer.removeListener(channel, func);
  },
});
