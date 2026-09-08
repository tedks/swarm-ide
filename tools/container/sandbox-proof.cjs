const fs = require('node:fs');

function parseStatus(pid, status) {
  return {
    pid,
    nspid: status.match(/^NSpid:\s+(.+)$/m)?.[1].trim().split(/\s+/),
    seccomp: status.match(/^Seccomp:\s+(\d+)/m)?.[1],
    noNewPrivs: status.match(/^NoNewPrivs:\s+(\d+)/m)?.[1],
  };
}

// Chromium rewrites its process title into a space-separated argv[0] on Linux.
function isRenderer(commandLine) {
  return commandLine.split(/[\0 ]/).includes('--type=renderer');
}

function inspectRenderers() {
  const results = [];
  for (const pid of fs.readdirSync('/proc').filter((name) => /^\d+$/.test(name))) {
    try {
      const commandLine = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8');
      if (!isRenderer(commandLine)) continue;
      results.push(parseStatus(pid, fs.readFileSync(`/proc/${pid}/status`, 'utf8')));
    } catch (error) {
      results.push({ pid, error: String(error) });
    }
  }
  return results;
}

module.exports = { parseStatus, isRenderer };
if (require.main === module) console.log(JSON.stringify(inspectRenderers()));
