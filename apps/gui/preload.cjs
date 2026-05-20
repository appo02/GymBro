const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  startExtract: (opts) => ipcRenderer.send('start-extract', opts),
  onOutput: (cb) => ipcRenderer.on('extract-output', (e, msg) => cb(msg)),
  onDone: (cb) => ipcRenderer.on('extract-done', (e, code) => cb(code)),
});
