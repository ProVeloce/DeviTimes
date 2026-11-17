const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isDesktop: true,
  printThermal: (html) => ipcRenderer.invoke('print-thermal', html),
  notify: (title, body) => ipcRenderer.invoke('show-notification', { title, body }),
  platform: process.platform,
});
