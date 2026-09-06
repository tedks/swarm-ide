// Only the immutable synthetic hook calls this program. No configurable command,
// file, output, network, or detached work; malformed opportunity produces no witness.
import { readFileSync, writeFileSync, readlinkSync } from 'node:fs';
const chunks = []; let size = 0;
const timer = setTimeout(() => process.exit(1), 1000);
try {
  for await (const chunk of process.stdin) {
    if ((size += chunk.length) > 8192) throw new Error('INPUT_LIMIT');
    chunks.push(chunk);
  }
  const input = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)));
  if (input.hook_event_name !== 'SessionStart' || input.source !== 'startup' || input.cwd !== '/work' ||
      process.cwd() !== '/work' || process.argv.length !== 2) throw new Error('OPPORTUNITY_INVALID');
  const status = readFileSync('/proc/self/status', 'utf8');
  if (!['CapInh', 'CapPrm', 'CapEff', 'CapBnd', 'CapAmb'].every(key => new RegExp(`^${key}:\\s+0+$`, 'm').test(status)) ||
      !/^NoNewPrivs:\s+1$/m.test(status)) throw new Error('BOUNDARY_INVALID');
  writeFileSync('/state/sessionstart-witness', JSON.stringify({ witness: 'P5_SESSIONSTART',
    pidNamespace: readlinkSync('/proc/self/ns/pid'), netNamespace: readlinkSync('/proc/self/ns/net'),
    capabilitiesAbsent: true, source: input.source, cwd: input.cwd,
  }), { flag: 'wx', mode: 0o600 });
} catch { process.exitCode = 1; }
finally { clearTimeout(timer); }
