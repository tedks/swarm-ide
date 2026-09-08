// Test-only browser client on the container's own display; no app IPC replacement.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
app.disableHardwareAcceleration();
const deadline = setTimeout(() => { console.error('Browser connection timed out'); app.exit(1); }, 30000);
app.whenReady().then(async () => {
  const window = new BrowserWindow({ show: false, width: 1640, height: 1100,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } });
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
  const remote = (code) => window.webContents.executeJavaScript(`(async () => { const { default: UI } = await import('/app/ui.js'); ${code} })()`);
  const waitTitle = async (title) => {
    for (let attempt = 0; attempt < 50; attempt++) {
      try {
        if (execFileSync('xdotool', ['search', '--onlyvisible', '--name', title], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()) return;
      } catch {}
      await new Promise((done) => setTimeout(done, 100));
    }
    throw new Error(`Real desktop did not reach ${title}`);
  };
  // Exercise keyboard control through the actual browser WebSocket/VNC path.
  await remote(`UI.rfb.sendKey(0xffe3, 'ControlLeft', true); UI.rfb.sendKey(0x6b, 'KeyK'); UI.rfb.sendKey(0xffe3, 'ControlLeft', false);`);
  await waitTitle('Palette open');
  await remote(`for (const char of 'Open repository path') UI.rfb.sendKey(char.codePointAt(0)); UI.rfb.sendKey(0xff0d, 'Enter');`);
  await waitTitle('Palette open · exact path');
  await remote(`for (const char of 'README.md') UI.rfb.sendKey(char.codePointAt(0)); UI.rfb.sendKey(0xff0d, 'Enter');`);
  await waitTitle('Source README.md:saved');
  await new Promise((done) => setTimeout(done, 300));
  fs.writeFileSync('/tmp/container-browser.png', (await window.webContents.capturePage()).toPNG());
  fs.writeFileSync('/tmp/container-browser.json', JSON.stringify({ connected, url: window.webContents.getURL(), sandboxedBrowser: true, sourceOpenedThroughBrowser: true }));
  clearTimeout(deadline); app.exit(0);
}).catch((error) => { console.error(error); clearTimeout(deadline); app.exit(1); });
