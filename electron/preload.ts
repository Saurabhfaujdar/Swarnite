const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getVersion: () => ipcRenderer.invoke('get-app-version'),
  onNavigate: (callback: (route: string) => void) => {
    ipcRenderer.on('navigate', (_event: any, route: string) => callback(route));
  },
});
