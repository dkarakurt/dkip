const { app, BrowserWindow, ipcMain, Menu, clipboard, shell, session } = require('electron');

// IPTV sunucuları tarayıcı isteklerini (418 vb.) reddedebiliyor; istekleri oynatıcı kimliğiyle gönderiyoruz.
let currentUA = 'IPTVSmartersPro';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

let win;

function createWindow() {
  win = new BrowserWindow({
    width: 1400,
    height: 860,
    minWidth: 1000,
    minHeight: 640,
    backgroundColor: '#0b0d12',
    title: 'DKIP',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // IPTV sunucuları CORS başlığı göndermez; masaüstü uygulamasında bu kontrolü kapatıyoruz.
      webSecurity: false,
      backgroundThrottling: false
    }
  });

  Menu.setApplicationMenu(null);

  session.defaultSession.webRequest.onBeforeSendHeaders({ urls: ['http://*/*', 'https://*/*'] }, (d, cb) => {
    const h = {};
    for (const [k, v] of Object.entries(d.requestHeaders)) {
      const lk = k.toLowerCase();
      if (lk === 'origin' || lk === 'referer' || lk.startsWith('sec-') || lk === 'user-agent') continue;
      h[k] = v;
    }
    h['User-Agent'] = currentUA;
    cb({ requestHeaders: h });
  });

  win.webContents.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F12' || (input.control && input.shift && input.key.toLowerCase() === 'i')) {
      win.webContents.toggleDevTools();
    }
    if (input.key === 'F11') {
      win.setFullScreen(!win.isFullScreen());
      e.preventDefault();
    }
    if (input.control && input.key.toLowerCase() === 'r') {
      win.webContents.reload();
    }
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  win.loadFile(path.join(__dirname, 'src', 'index.html'));
}

function findVlc(customPath) {
  const candidates = [];
  if (customPath) candidates.push(customPath);
  if (process.platform === 'win32') {
    const pf = process.env['ProgramFiles'] || 'C:\\Program Files';
    const pf86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
    candidates.push(path.join(pf, 'VideoLAN', 'VLC', 'vlc.exe'));
    candidates.push(path.join(pf86, 'VideoLAN', 'VLC', 'vlc.exe'));
  } else if (process.platform === 'darwin') {
    candidates.push('/Applications/VLC.app/Contents/MacOS/VLC');
  } else {
    candidates.push('/usr/bin/vlc', '/snap/bin/vlc');
  }
  return candidates.find(p => { try { return fs.existsSync(p); } catch { return false; } });
}

ipcMain.handle('open-external', (_e, { url, title, vlcPath }) => {
  const vlc = findVlc(vlcPath);
  if (!vlc) {
    clipboard.writeText(url);
    return { ok: false, reason: 'vlc-not-found' };
  }
  const args = [url];
  if (title) args.push(`--meta-title=${title}`);
  const child = spawn(vlc, args, { detached: true, stdio: 'ignore' });
  child.unref();
  return { ok: true };
});

ipcMain.handle('set-ua', (_e, ua) => { if (ua) currentUA = String(ua); return currentUA; });
ipcMain.handle('copy-text', (_e, text) => { clipboard.writeText(String(text || '')); return true; });
ipcMain.handle('toggle-fullscreen', () => { if (win) win.setFullScreen(!win.isFullScreen()); return win && win.isFullScreen(); });
ipcMain.handle('app-version', () => app.getVersion());

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
