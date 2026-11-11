const { contextBridge, ipcRenderer } = require('electron');
const on = (ch) => (f) => ipcRenderer.on(ch, (_e, v) => f(v));
contextBridge.exposeInMainWorld('api', {
  onMedia: on('media'), onConfig: on('config'), onRunning: on('running'), onBands: on('bands'),
  getApps: () => ipcRenderer.invoke('apps'),
  cmd: (c, a) => ipcRenderer.send('cmd', c, a),
  setBar: (v) => ipcRenderer.send('bar', v),
  launch: (p) => ipcRenderer.send('launch', p),
  start: () => ipcRenderer.send('start'),
  ignore: (b) => ipcRenderer.send('ignore', b),
  bands: (b) => ipcRenderer.send('bands', b),
  quit: () => ipcRenderer.send('quit')
});
