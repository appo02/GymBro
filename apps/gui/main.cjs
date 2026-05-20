const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

function createWindow() {
  const win = new BrowserWindow({
    width: 760,
    height: 560,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.removeMenu();
  win.loadFile(path.join(__dirname, 'index.html'));
}

app.whenReady().then(createWindow);

ipcMain.on('start-extract', (event, { url, outdir }) => {
  try {
    if (!url || typeof url !== 'string') {
      event.sender.send('extract-output', 'Error: No valid URL provided');
      event.sender.send('extract-done', 1);
      return;
    }
    const resolvedOutdir = outdir && typeof outdir === 'string' ? outdir : process.cwd();
    const extractor = path.join(process.cwd(), 'scripts', 'playlist-extract.js');
    const child = spawn(process.execPath, [extractor, url], { cwd: resolvedOutdir });
    if (child.stdout) {
      child.stdout.on('data', (chunk) => event.sender.send('extract-output', chunk.toString()));
    }
    if (child.stderr) {
      child.stderr.on('data', (chunk) => event.sender.send('extract-output', chunk.toString()));
    }
    child.on('close', (code) => event.sender.send('extract-done', code));
  } catch (err) {
    event.sender.send('extract-output', `Error launching extractor: ${String(err.message || err)}`);
    event.sender.send('extract-done', 1);
  }
});

app.on('window-all-closed', () => app.quit());
