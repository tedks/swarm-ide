// Linux-only lifetime boundary. Not a sandbox/profile verifier.
// The guardian owns no saved PID: it only signals its live ChildProcess.
// PID namespace init exit kills all namespace descendants, including setsid
// children and nested PID namespaces. See pid_namespaces(7), unshare(1).
import { spawn } from 'node:child_process';
import { createReadStream, readlinkSync, writeSync } from 'node:fs';

const [mode, encoded] = process.argv.slice(2);
let config;
try {
  config = JSON.parse(encoded);
  if (!['guardian', 'init'].includes(mode) || !Number.isSafeInteger(config.graceMs) ||
      config.graceMs < 1 || config.graceMs > 5000 || !Array.isArray(config.args) ||
      !/^pid:\[\d+\]$/.test(config.parentNamespace)) throw new Error();
} catch { process.exit(78); }

let statusBroken = false;
function report(value) {
  if (statusBroken) return;
  try { writeSync(4, JSON.stringify(value) + '\n'); }
  catch { statusBroken = true; }
}
const control = createReadStream(null, { fd: 3, autoClose: true });

// The control pipe is deliberately separate from provider stdin. No provider
// gets the guardian's control/status file descriptors through its exec boundary.
function commands(start, stop) {
  let command = '', started = false;
  control.on('data', (chunk) => {
    command += chunk.toString('utf8');
    if (command.length > 6 || started || !'start\n'.startsWith(command)) { stop(); return; }
    if (command === 'start\n') { started = true; start(); }
  });
  control.on('end', stop);
  control.on('error', stop);
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}

if (mode === 'guardian') {
  let ready = false, stopping = false, invalid = false, namespace = '';
  let buffer = '', bytes = 0, exited = false, timer, finalTimer;
  // setpriv ties unshare to this guardian; unshare ties PID1 to itself.
  // A guardian failure therefore requests namespace kill as well as closing
  // PID1's control pipe. No inherited process-group assumptions are used.
  const child = spawn(config.setprivExecutable, [
    '--pdeathsig', 'SIGKILL', '--', config.unshareExecutable,
    '--user', '--map-current-user', '--pid', '--fork', '--kill-child=SIGKILL', '--mount-proc', '--',
    config.nodeExecutable, config.ownerScript, 'init', encoded,
  ], { cwd: config.root, shell: false, stdio: [0, 1, 2, 'pipe', 'pipe'] });
  const innerControl = child.stdio[3], innerStatus = child.stdio[4];
  const stop = () => {
    if (stopping) return;
    stopping = true;
    innerControl.end();
    timer = setTimeout(() => {
      invalid = true;
      child.kill('SIGKILL'); // Only the live wrapper object. PDEATHSIG kills PID1.
      finalTimer = setTimeout(() => { report({ type: 'cleanup', status: 'unknown' }); process.exit(1); }, 1000);
    }, config.graceMs + 1000);
  };
  commands(() => { if (ready && !stopping) innerControl.write('start\n'); else { invalid = true; stop(); } }, stop);
  innerControl.on('error', () => { invalid = true; stop(); });
  innerStatus.on('error', () => { invalid = true; stop(); });
  child.on('error', () => { invalid = true; stop(); });
  innerStatus.setEncoding('utf8');
  innerStatus.on('data', (chunk) => {
    bytes += Buffer.byteLength(chunk);
    if (bytes > 2048 || invalid) { invalid = true; stop(); return; }
    buffer += chunk;
    for (;;) {
      const index = buffer.indexOf('\n');
      if (index < 0) break;
      const line = buffer.slice(0, index); buffer = buffer.slice(index + 1);
      let value;
      try { value = JSON.parse(line); } catch { invalid = true; stop(); return; }
      if (value?.type === 'ready' && !ready && /^pid:\[\d+\]$/.test(value.namespace) && value.namespace !== config.parentNamespace) {
        ready = true; namespace = value.namespace; report({ type: 'ready', namespace });
      } else if (value?.type === 'exit' && ready && !exited && (value.code === null || Number.isSafeInteger(value.code))) {
        exited = true; report({ type: 'exit', code: value.code });
      } else { invalid = true; stop(); return; }
    }
  });
  child.on('close', (code) => {
    clearTimeout(timer); clearTimeout(finalTimer);
    // Normal unshare wait completion means PID1's exit completed. Namespace
    // teardown occurs in the kernel before that wait can reap PID1. A signal
    // or missing handshake is deliberately NOT promoted to that proof.
    report({ type: 'cleanup', status: ready && !invalid && !buffer.length && code === 0 ? 'confirmed' : 'unknown' });
    process.exit(0);
  });
} else {
  const namespace = readlinkSync('/proc/self/ns/pid');
  // kill(-1) below must NEVER run outside the newly created namespace.
  if (process.pid !== 1 || namespace === config.parentNamespace) process.exit(78);
  let child, stopping = false, timer;
  const stop = () => {
    if (stopping) return;
    stopping = true;
    if (!child) { process.exit(0); return; }
    child.stdin.end();
    try { process.kill(-1, 'SIGTERM'); } catch (error) { if (error.code !== 'ESRCH') process.exit(1); }
    // PID1 exit invokes kernel-wide namespace SIGKILL and reaping. It does not
    // trust a scan, process group, provider promise or direct-child exit code.
    timer = setTimeout(() => process.exit(0), config.graceMs);
  };
  commands(() => {
    if (stopping) return;
    child = spawn(config.executable, config.args, { cwd: config.root, shell: false, stdio: ['pipe', 'pipe', 'pipe'] });
    process.stdin.pipe(child.stdin);
    child.stdout.pipe(process.stdout);
    child.stderr.pipe(process.stderr);
    child.stdin.on('error', stop);
    child.stdout.on('error', stop);
    child.stderr.on('error', stop);
    child.on('error', () => { report({ type: 'exit', code: null }); stop(); });
    child.on('exit', (code) => { report({ type: 'exit', code }); stop(); });
  }, stop);
  report({ type: 'ready', namespace });
}
