const { app, BrowserWindow, screen, ipcMain, shell, globalShortcut, session, desktopCapturer } = require('electron');
const path = require('path'), fs = require('fs'), { spawn, execFile } = require('child_process');

if (!app.requestSingleInstanceLock()) app.quit();

const cfgFile = () => path.join(app.getPath('userData'), 'config.json');
let cfg = { bar: 'pill' };
try { cfg = Object.assign(cfg, JSON.parse(fs.readFileSync(cfgFile(), 'utf8'))); } catch (e) {}
const saveCfg = () => { try { fs.writeFileSync(cfgFile(), JSON.stringify(cfg)); } catch (e) {} };

const PS = path.join(__dirname, 'media.ps1').replace('app.asar', 'app.asar.unpacked');
const PSARGS = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', PS];
let wWin, bWin, media;
const wins = () => [wWin, bWin].filter((w) => w && !w.isDestroyed());

function barBounds() {
  const d = screen.getPrimaryDisplay().bounds;
  const box = (w, h, x, y) => ({ width: w, height: h, x: Math.round(x), y: Math.round(y) });
  switch (cfg.bar) {
    case 'dock': return box(760, 120, d.x + (d.width - 760) / 2, d.y + d.height - 120);
    case 'auto': return box(820, 120, d.x + (d.width - 820) / 2, d.y + d.height - 120);
    case 'side': { const h = Math.min(d.height - 80, 640); return box(90, h, d.x, d.y + (d.height - h) / 2); }
    default: return box(d.width, 64, d.x, d.y + d.height - 64);
  }
}

function makeWin(mode, bounds, top) {
  const w = new BrowserWindow(Object.assign({
    frame: false, transparent: true, hasShadow: false, skipTaskbar: true, resizable: false, movable: false,
    minimizable: false, maximizable: false, fullscreenable: false, show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, backgroundThrottling: false }
  }, bounds));
  if (top) w.setAlwaysOnTop(true, 'screen-saver');
  w.setIgnoreMouseEvents(true, { forward: true });
  w.loadFile(path.join(__dirname, 'renderer', 'index.html'), { query: { mode } });
  w.once('ready-to-show', () => w.showInactive());
  w.webContents.on('did-finish-load', () => w.webContents.send('config', cfg));
  return w;
}

function startMedia() {
  media = spawn('powershell.exe', PSARGS, { windowsHide: true });
  let buf = '';
  media.stdout.setEncoding('utf8');
  media.stdout.on('data', (d) => {
    buf += d; let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (!line) continue;
      try { const m = JSON.parse(line); wins().forEach((w) => w.webContents.send('media', m)); } catch (e) {}
    }
  });
  media.on('exit', () => { media = null; });
}

async function pinned() {
  const dir = path.join(process.env.APPDATA || '', 'Microsoft', 'Internet Explorer', 'Quick Launch', 'User Pinned', 'TaskBar');
  let files = [];
  try { files = fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.lnk')); } catch (e) {}
  const out = [];
  for (const f of files) {
    const lnk = path.join(dir, f); let target = '', icon = '';
    try { target = shell.readShortcutLink(lnk).target || ''; } catch (e) {}
    try { icon = (await app.getFileIcon(target || lnk, { size: 'large' })).toDataURL(); } catch (e) {}
    out.push({ name: f.replace(/\.lnk$/i, ''), lnk, target, icon });
  }
  return out;
}

function running() {
  return new Promise((res) => execFile('powershell.exe',
    ['-NoProfile', '-Command', 'Get-Process | Where-Object { $_.MainWindowHandle -ne 0 } | ForEach-Object { $_.Path }'],
    { windowsHide: true }, (e, out) => res((out || '').split(/\r?\n/).map((s) => s.trim().toLowerCase()).filter(Boolean))));
}

ipcMain.handle('apps', pinned);
ipcMain.on('cmd', (e, c, a) => {
  if (!['toggle', 'next', 'prev', 'seek'].includes(c)) return;
  execFile('powershell.exe', [...PSARGS, '-Cmd', c, '-Arg', String(Number(a) || 0)], { windowsHide: true }, () => {});
});
ipcMain.on('bar', (e, v) => {
  if (!['pill', 'dock', 'dots', 'side', 'auto'].includes(v)) return;
  cfg.bar = v; saveCfg();
  if (bWin) bWin.setBounds(barBounds());
  wins().forEach((w) => w.webContents.send('config', cfg));
});
ipcMain.on('launch', (e, p) => { if (typeof p === 'string') shell.openPath(p); });
ipcMain.on('start', () => execFile('powershell.exe',
  ['-NoProfile', '-Command', "(New-Object -ComObject WScript.Shell).SendKeys('^{ESC}')"], { windowsHide: true }, () => {}));
ipcMain.on('ignore', (e, b) => { const w = BrowserWindow.fromWebContents(e.sender); if (w) w.setIgnoreMouseEvents(!!b, { forward: true }); });
ipcMain.on('bands', (e, b) => { if (bWin && !bWin.isDestroyed()) bWin.webContents.send('bands', b); });
ipcMain.on('quit', () => app.quit());

app.whenReady().then(() => {
  // Захват системного звука для визуализаторов
  session.defaultSession.setDisplayMediaRequestHandler((req, cb) => {
    desktopCapturer.getSources({ types: ['screen'] }).then((s) => cb({ video: s[0], audio: 'loopback' })).catch(() => cb({}));
  });
  wWin = makeWin('widgets', screen.getPrimaryDisplay().workArea, false);
  bWin = makeWin('bar', barBounds(), true);
  startMedia();
  const tick = async () => { const r = await running(); if (bWin && !bWin.isDestroyed()) bWin.webContents.send('running', r); };
  tick(); setInterval(tick, 4000);
  globalShortcut.register('CommandOrControl+Alt+W', () => { if (!wWin) return; wWin.isVisible() ? wWin.hide() : wWin.show(); });
  globalShortcut.register('CommandOrControl+Alt+Q', () => app.quit());
});
app.on('window-all-closed', () => app.quit());
app.on('will-quit', () => { globalShortcut.unregisterAll(); if (media) media.kill(); });
