const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('daynote', {
  load: () => ipcRenderer.invoke('state:load'),
  dispatch: (action) => ipcRenderer.invoke('state:dispatch', action),
  testNotification: () => ipcRenderer.invoke('notification:test'),
  getStartupStatus: () => ipcRenderer.invoke('startup:read'),
  setStartupEnabled: (enabled) => ipcRenderer.invoke('startup:set', enabled),
  onChange: (callback) => { const listener = (_event, state) => callback(state); ipcRenderer.on('state:changed', listener); return () => ipcRenderer.removeListener('state:changed', listener); },
  onOpenTask: (callback) => { const listener = (_event, id) => callback(id); ipcRenderer.on('task:open', listener); return () => ipcRenderer.removeListener('task:open', listener); },
  onError: (callback) => { const listener = (_event, message) => callback(message); ipcRenderer.on('app:error', listener); return () => ipcRenderer.removeListener('app:error', listener); }
});
