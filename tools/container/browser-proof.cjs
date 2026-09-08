// Test-only browser client on the container's own display; no app IPC replacement.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
app.disableHardwareAcceleration();
const deadline = setTimeout(() => { console.error('Browser connection timed out'); app.exit(1); }, 30000);
app.whenReady().then(async () => {
  const window = new BrowserWindow({ show: false, width: 1640, height: 1100,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
  await window.loadURL('http://127.0.0.1:6080/vnc.html?autoconnect=1&resize=scale');
  let connected = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (await window.webContents.executeJavaScript(`document.querySelector('#noVNC_credentials_dlg')?.classList.contains('noVNC_open')`)) {
      const password = fs.readFileSync('/tmp/swarm-runtime/browser-password', 'utf8');
      await window.webContents.executeJavaScript(`document.querySelector('#noVNC_password_input').value = ${JSON.stringify(password)}; document.querySelector('#noVNC_credentials_button').click()`);
    }
    connected = await window.webContents.executeJavaScript(`document.documentElement.classList.contains('noVNC_connected') && !!document.querySelector('#noVNC_container canvas')?.width`);
    if (connected) break;
    await new Promise((done) => setTimeout(done, 100));
  }
  if (!connected) throw new Error('The actual browser did not connect to VNC');
  await new Promise((done) => setTimeout(done, 300));
  fs.writeFileSync('/tmp/container-browser.png', (await window.webContents.capturePage()).toPNG());
  fs.writeFileSync('/tmp/container-browser.json', JSON.stringify({ connected, url: window.webContents.getURL(), sandboxedBrowser: true }));
  clearTimeout(deadline); app.exit(0);
}).catch((error) => { console.error(error); clearTimeout(deadline); app.exit(1); });
