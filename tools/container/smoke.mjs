import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { disposeContainer } from './cleanup.mjs';
const evidence = mkdtempSync(join(tmpdir(), 'swarm-container-proof.'));
const name = `swarm-container-proof-${randomUUID()}`;
const image = process.env.SWARM_CONTAINER_IMAGE || 'swarm-ide-demo:local';
const port = process.env.SWARM_CONTAINER_PORT || '55418';
assert(/^[1-9][0-9]{0,4}$/.test(port) && Number(port) <= 65535, 'Valid dedicated host port required');
const docker = (...args) => execFileSync('docker', args, { encoding: 'utf8', timeout: 120000, maxBuffer: 8 * 1024 * 1024 });
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
let ownedId;
function cleanup() {
  if (!ownedId) return;
  const id = ownedId; ownedId = undefined;
  disposeContainer(id, docker, (file, bytes) => writeFileSync(join(evidence, file), bytes));
}
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
  try { cleanup(); } finally { process.exit(signal === 'SIGINT' ? 130 : 143); }
});
try {
  docker('image', 'inspect', image);
  ownedId = docker('create', '--name', name, '--init', '--cap-drop=ALL', '--security-opt=no-new-privileges:true',
    `--security-opt=seccomp=${resolve('tools/container/seccomp.json')}`, '--shm-size=512m',
    '--publish', `127.0.0.1:${port}:6080`, image).trim();
  docker('start', ownedId);
  const deadline = Date.now() + 60000;
  let response;
  while (Date.now() < deadline) {
    assert.equal(JSON.parse(docker('inspect', name))[0].State.Running, true, 'Container must remain running');
    response = await fetch(`http://127.0.0.1:${port}/vnc.html`, { signal: AbortSignal.timeout(1500) }).catch(() => null);
    if (response?.ok) break;
    await sleep(250);
  }
  assert(response?.ok, 'noVNC must serve its browser client');
  assert.match(await response.text(), /noVNC/);
  assert.equal(docker('exec', name, 'id', '-u').trim(), '1000');
  const inspection = JSON.parse(docker('inspect', name))[0];
  assert.equal(inspection.HostConfig.Privileged, false);
  assert.equal(inspection.Mounts.length, 0, 'No host data/credentials mounted in proof');
  assert.equal(inspection.NetworkSettings.Ports['6080/tcp'][0].HostIp, '127.0.0.1');
  const windows = docker('exec', name, 'xdotool', 'search', '--sync', '--onlyvisible', '--name', 'swarm-ide');
  assert(windows.trim(), 'Actual Electron window is visible on the container display');
  docker('exec', name, 'xdotool', 'key', '--clearmodifiers', 'ctrl+k');
  await sleep(200);
  docker('exec', name, 'xdotool', 'type', '--clearmodifiers', '--delay', '20', 'README.md');
  docker('exec', name, 'xdotool', 'key', 'Return');
  await sleep(700);
  docker('cp', 'tools/container/browser-proof.cjs', `${name}:/tmp/browser-proof.cjs`);
  docker('exec', name, 'electron', '/tmp/browser-proof.cjs');
  docker('cp', `${name}:/tmp/container-browser.png`, join(evidence, 'browser.png'));
  docker('cp', `${name}:/tmp/container-browser.json`, join(evidence, 'browser.json'));
  const processes = docker('exec', name, 'ps', '-eo', 'pid,args');
  assert(processes.includes('--type=renderer'), 'Real renderer process exists');
  assert(!processes.includes('--no-sandbox'), 'No sandbox-disabling flags');
  writeFileSync(join(evidence, 'processes.txt'), processes);
  const sandbox = JSON.parse(docker('exec', name, 'node', '-e', `
    const fs = require('fs');
    const results = [];
    for (const pid of fs.readdirSync('/proc').filter(p => /^\\d+$/.test(p))) {
      try {
        const args = fs.readFileSync('/proc/' + pid + '/cmdline', 'utf8').split('\\0');
        if (!args.includes('--type=renderer')) continue;
        const status = fs.readFileSync('/proc/' + pid + '/status', 'utf8');
        results.push({pid, nspid: status.match(/^NSpid:\\s+(.+)$/m)?.[1].trim().split(/\\s+/),
          seccomp: status.match(/^Seccomp:\\s+(\\d+)/m)?.[1], noNewPrivs: status.match(/^NoNewPrivs:\\s+(\\d+)/m)?.[1]});
      } catch {}
    }
    console.log(JSON.stringify(results));
  `));
  assert(sandbox.some((p) => p.nspid?.length >= 2 && p.seccomp === '2' && p.noNewPrivs === '1'), 'Actual renderer has a nested PID namespace and active seccomp/no-new-privileges');
  writeFileSync(join(evidence, 'renderer-sandbox.json'), JSON.stringify(sandbox, null, 2));
  writeFileSync(join(evidence, 'proof.json'), JSON.stringify({ ok: true, dockerArchitecture: JSON.parse(docker('image', 'inspect', image))[0].Architecture,
    nativeMacTest: false, noHostMounts: true, loopbackOnly: true, nonroot: true, realElectron: true, browserTransport: true }, null, 2));
  console.log(`Actual container/browser proof passed: ${evidence}`);
} catch (error) {
  writeFileSync(join(evidence, 'failure.txt'), error.stack || String(error));
  throw error;
} finally {
  cleanup();
  console.log(`Evidence retained: ${evidence}`);
}
