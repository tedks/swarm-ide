import { execFileSync, spawn } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, readlink, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { createHash } from 'node:crypto';
import { buildArgs, boundedProcess, digestFile, digestTree, sameNamespace, validatePackageManifest, validatePackageLayout, verifyAfterProcess, INSTALLATION_SEED } from './boundary.mjs';
import { summarizeActivationCases } from './activation-contract.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const runtime = process.argv[2];
const mode = process.argv[3];
const packagePath = join(homedir(), '.npm-global/lib/node_modules/@openai/codex/node_modules/@openai/codex-linux-x64/vendor/x86_64-unknown-linux-musl');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const baseConfig = `allow_login_shell = false
notify = []
[projects."/work"]
trust_level = "trusted"
[features]
apps = false
hooks = false
plugin_hooks = false
plugins = false
multi_agent = false
multi_agent_v2 = false
remote_control = false
remote_plugin = false
recommended_plugins = false
`;

export const CASES = Object.freeze([
  { name: 'baseline', user: baseConfig },
  { name: 'aliases', user: baseConfig + 'connectors = true\ncodex_hooks = true\ncollab = true\n' },
  { name: 'project', user: baseConfig, project: '[features]\napps = true\n' },
  { name: 'inherited-mcp', user: baseConfig + '[mcp_servers.sentinel]\ncommand = "/runtime/bin/node"\nargs = ["/fixture/canary.mjs", "mcp"]\n', project: '[mcp_servers]\n' },
  { name: 'notify', user: baseConfig.replace('notify = []', 'notify = ["/runtime/bin/node", "/fixture/canary.mjs", "notify"]') },
  { name: 'managed', user: baseConfig, managed: '[feature_requirements]\napps = true\n' },
  { name: 'malformed', user: 'features = [ broken TOML' },
]);

// A unique synthetic provider disables the actual websocket-prewarm capability;
// removed features.responses_websockets flags would not do so in pinned 0.153.4.
const activationConfig = 'model = "gpt-5.2"\nmodel_provider = "policy_offline"\n' + baseConfig + `
code_mode_prewarm = false
memories = false
memory_tool = false
use_agent_identity = false
[memories]
generate_memories = false
use_memories = false
[model_providers.policy_offline]
name = "Policy offline"
base_url = "http://127.0.0.1:9/v1"
wire_api = "responses"
requires_openai_auth = false
supports_websockets = false
`;
const mcpConfig = enabled => `[mcp_servers.policy_canary]
command = "/runtime/bin/node"
args = ["/fixture/mcp-canary.mjs"]
cwd = "/work"
enabled = ${enabled}
required = true
startup_timeout_sec = 2
tool_timeout_sec = 2
`;
const ACTIVATION_CASES = [
  { name: 'mcp-enabled', user: activationConfig + mcpConfig(true) },
  { name: 'mcp-disabled', user: activationConfig + mcpConfig(false) },
  { name: 'mcp-inherited', user: activationConfig + mcpConfig(true), project: '[mcp_servers]\n' },
  { name: 'mcp-project-disabled', user: activationConfig + mcpConfig(true), project: mcpConfig(false) },
  { name: 'mcp-required-fails', user: activationConfig + mcpConfig(true).replace('"/fixture/mcp-canary.mjs"]', '"/fixture/mcp-canary.mjs", "fail"]') },
];

async function makeFixture(root, name, config, packageSource) {
  const path = join(root, name);
  for (const dir of ['home/probe/.codex', 'home/probe/.config', 'work/.codex', 'etc/codex', 'fixture', ...(packageSource ? [] : ['package'])])
    await mkdir(join(path, dir), { recursive: true, mode: 0o700 });
  await writeFile(join(path, 'home/probe/.codex/config.toml'), config.user);
  await writeFile(join(path, 'home/probe/.codex/installation_id'), INSTALLATION_SEED);
  await writeFile(join(path, 'work/.codex/config.toml'), config.project ?? '');
  await writeFile(join(path, 'etc/codex/requirements.toml'), config.managed ?? '');
  await writeFile(join(path, 'etc/profile'), '/runtime/bin/node /fixture/canary.mjs login\n');
  await writeFile(join(path, 'home/probe/.bash_profile'), '/runtime/bin/node /fixture/canary.mjs login\n');
  for (const name of ['inner.mjs', 'boundary.mjs', 'activation.mjs', 'activation-contract.mjs', 'mcp-canary.mjs']) await cp(join(here, name), join(path, 'fixture', name));
  await writeFile(join(path, 'fixture/canary.mjs'),
    `import {writeFileSync} from 'node:fs'; const name=process.argv[2]; if(!/^(positive|login|notify|hooks|plugin|mcp)$/.test(name))process.exit(1);writeFileSync('/state/'+name,'synthetic-canary');`);
  if (packageSource) await cp(packageSource, join(path, 'package'), { recursive: true, force: false, errorOnExist: false });
  return path;
}

/** A disposable owner; the outer test SIGKILLs it rather than orderly disposal. */
async function owner(args) {
  const child = spawn(`${runtime}/bin/bwrap`, ['--info-fd', '3', ...args], {
    env: { LANG: 'C.UTF-8' }, cwd: '/', stdio: ['ignore', 'pipe', 'pipe', 'pipe', 'pipe'],
  });
  let info = '', output = '', total = 0, reported = false;
  const fail = () => { child.kill('SIGKILL'); process.exitCode = 1; };
  child.on('error', fail);
  child.stdio[4].on('error', fail); child.stdio[4].end(INSTALLATION_SEED);
  child.stderr.on('data', chunk => { total += chunk.length; if (total > 4096) fail(); });
  function ready() {
    if (reported || !info.includes('}') || !output.includes('\n')) return;
    try {
      const parsed = JSON.parse(info), held = JSON.parse(output.trim());
      if (!Number.isInteger(parsed['child-pid']) || !held.holding || !/^pid:\[\d+\]$/.test(held.namespace)) throw new Error();
      reported = true;
      process.stdout.write(JSON.stringify({ pid: parsed['child-pid'], namespace: held.namespace, descendant: held.descendant }) + '\n');
    } catch { fail(); }
  }
  child.stdio[3].on('data', chunk => { info += chunk; if (info.length > 4096) fail(); else ready(); });
  child.stdout.on('data', chunk => { output += chunk; if (output.length > 4096) fail(); else ready(); });
  child.on('close', () => { if (!reported) process.exitCode = 1; });
}

async function ownerDeath(args) {
  const ownerChild = spawn(`${runtime}/bin/node`, [fileURLToPath(import.meta.url), runtime, '--owner', JSON.stringify(args)],
    { env: { LANG: 'C.UTF-8' }, cwd: '/', stdio: ['ignore', 'pipe', 'ignore'] });
  const observed = await new Promise(resolve => {
    let bytes = ''; const timer = setTimeout(() => resolve(null), 3000);
    ownerChild.on('error', () => { clearTimeout(timer); resolve(null); });
    ownerChild.on('exit', () => { clearTimeout(timer); resolve(null); });
    ownerChild.stdout.on('data', chunk => {
      bytes += chunk;
      if (bytes.length > 4096) { clearTimeout(timer); resolve(null); return; }
      if (bytes.includes('\n')) {
        clearTimeout(timer);
        try { resolve(JSON.parse(bytes.trim())); } catch { resolve(null); }
      }
    });
  });
  let valid = observed && Number.isInteger(observed.pid) && observed.pid > 1 &&
    /^pid:\[\d+\]$/.test(observed.namespace) && observed.descendant > 1 &&
    observed.namespace !== await readlink('/proc/self/ns/pid') && await sameNamespace(observed.pid, observed.namespace);
  const exited = new Promise(resolve => { if (ownerChild.exitCode !== null || ownerChild.signalCode !== null) resolve(); else ownerChild.once('exit', resolve); });
  ownerChild.kill('SIGKILL'); await exited;
  if (!valid) return false;
  for (let attempt = 0; attempt < 40; attempt++) {
    if (!await sameNamespace(observed.pid, observed.namespace)) return true;
    await sleep(50);
  }
  return false;
}

async function main() {
  const report = { schemaVersion: 1, productionAvailable: false, codexStarted: false,
    status: 'ISOLATION_UNAVAILABLE', isolation: {}, cases: [], unproved: [] };
  let root, cleanupSafe = true;
  try {
    if (process.platform !== 'linux' || ![undefined, '--boundary-test', '--trace-startup', '--activation'].includes(mode)) throw new Error('UNSUPPORTED_PLATFORM_OR_MODE');
    // Store metadata only, never provider/config execution. The derivation is pinned.
    const closure = execFileSync('nix-store', ['--query', '--requisites', runtime], {
      env: { PATH: process.env.PATH }, encoding: 'utf8', timeout: 10000, maxBuffer: 65536,
    }).trim().split('\n');
    report.runtime = { path: runtime, closureDigest: createHash('sha256').update(closure.sort().join('\n')).digest('hex') };
    root = await mkdtemp('/tmp/swarm-policy-');
    const fixture = await makeFixture(root, 'boundary', { user: baseConfig });
    async function verifyBoundary(fixture) {
    const args = command => buildArgs(runtime, closure, fixture, ['/runtime/bin/node', '/fixture/inner.mjs', command]);
    const before = await digestTree(fixture);
    const result = await boundedProcess(`${runtime}/bin/bwrap`, args('boundary'), { seed: true });
    if (!result.ok) { cleanupSafe = result.cleanup !== 'unknown'; report.failure = result.code;
      report.bootstrapDiagnostic = result.bootstrapDiagnostic; return false; }
    const observed = JSON.parse(result.stdout);
    report.isolation = observed.checks;
    if (!observed.checks || !Object.keys(observed.checks).length || Object.values(observed.checks).some(v => v !== true)) {
      report.failure = 'BOUNDARY_CHECKS_FAILED'; return false;
    }
    report.isolation.freshPidNamespace = /^pid:\[\d+\]$/.test(observed.namespace ?? '') && observed.namespace !== await readlink('/proc/self/ns/pid');
    report.isolation.freshNetworkNamespace = /^net:\[\d+\]$/.test(observed.networkNamespace ?? '') && observed.networkNamespace !== await readlink('/proc/self/ns/net');
    report.isolation.ownerDeathCleanup = await ownerDeath(args('hold'));
    if (!report.isolation.ownerDeathCleanup) { cleanupSafe = false; report.failure = 'OWNER_CLEANUP_UNPROVED'; return false; }
    const timed = await boundedProcess(`${runtime}/bin/bwrap`, args('hold'), { timeoutMs: 400, seed: true });
    report.isolation.deadlineStops = !timed.ok && timed.code === 'DEADLINE' && timed.cleanup === 'reaped';
    if (timed.cleanup === 'unknown') { cleanupSafe = false; report.failure = 'DEADLINE_CLEANUP_UNPROVED'; return false; }
    const flooded = await boundedProcess(`${runtime}/bin/bwrap`, args('flood'), { seed: true });
    report.isolation.outputStops = !flooded.ok && flooded.code === 'OUTPUT_LIMIT' && flooded.cleanup === 'reaped';
    if (flooded.cleanup === 'unknown') { cleanupSafe = false; report.failure = 'OUTPUT_CLEANUP_UNPROVED'; return false; }
    report.isolation.inputsUnchanged = before === await digestTree(fixture);
    report.boundaryDigest = before;
    if (Object.values(report.isolation).some(v => v !== true)) { report.failure = 'BOUNDARY_LIFETIME_FAILED'; return false; }
    return true;
    }
    if (!await verifyBoundary(fixture)) return report;
    report.status = 'BOUNDARY_VERIFIED';
    if (mode === '--boundary-test') return report;
    // Inspect and copy ONLY the declared executable/resource package, never auth/config.
    const packageBefore = await digestTree(packagePath);
    const manifest = JSON.parse(await readFile(join(packagePath, 'codex-package.json'), 'utf8'));
    validatePackageManifest(manifest);
    await validatePackageLayout(packagePath);
    report.package = { version: manifest.version, sourceDigest: packageBefore,
      executableSha256: await digestFile(join(packagePath, 'bin/codex')),
      companionSha256: await digestFile(join(packagePath, 'bin/codex-code-mode-host')) };
    for (const config of mode === '--activation' ? ACTIVATION_CASES : mode === '--trace-startup' ? CASES.slice(0, 1) : CASES) {
      const path = await makeFixture(root, config.name, config, packagePath);
      if (await digestTree(join(path, 'package')) !== packageBefore || await digestTree(packagePath) !== packageBefore) throw new Error('PACKAGE_CHANGED');
      const digest = await digestTree(path);
      // Same fixture/package identity, full lifetime proof, BEFORE every activation launch.
      if (mode === '--activation' && !await verifyBoundary(path)) return report;
      const result = await boundedProcess(`${runtime}/bin/bwrap`, buildArgs(runtime, closure, path,
        ['/runtime/bin/node', '/fixture/inner.mjs', mode === '--activation' ? 'activate' : mode === '--trace-startup' ? 'inspect-trace' : 'inspect']), { timeoutMs: mode === '--activation' ? 12000 : 8000, seed: true });
      report.codexStarted = true; // Conservative: inspection may have started before a transport failure.
      const verification = await verifyAfterProcess(result, async () => digest === await digestTree(path) && packageBefore === await digestTree(packagePath));
      cleanupSafe = verification.cleanupSafe;
      if (!verification.ok) { report.failure = verification.failure; return report; }
      let observation;
      if (!result.ok) observation = { status: result.code, cleanup: result.cleanup, bootstrapDiagnostic: result.bootstrapDiagnostic };
      else { try { observation = JSON.parse(result.stdout); } catch { observation = { status: 'INVALID_PROBE_OUTPUT' }; } }
      report.cases.push({ name: config.name, digest, inputsUnchanged: true,
        ...(mode === '--activation' ? { isolation: { ...report.isolation } } : {}), ...observation });
      await rm(path, { recursive: true, force: true });
    }
    report.status = 'OFFLINE_CHECKPOINT';
    if (mode === '--activation') {
      report.status = 'OFFLINE_ACTIVATION_CHECKPOINT';
      if (!summarizeActivationCases(report.cases)) report.failure = 'ACTIVATION_CONTROL_UNPROVED';
    } else if (mode === '--trace-startup') {
      if (report.cases[0]?.status !== 'OFFLINE_OBSERVED') report.failure = 'TRACED_STARTUP_UNPROVED';
    } else {
      const find = name => report.cases.find(item => item.name === name);
      report.counterexamples = {
        baselineInspected: find('baseline')?.status === 'OFFLINE_OBSERVED' && find('baseline')?.observations?.features.apps === false,
        aliasOverridesCanonicalFalse: find('aliases')?.observations?.features.apps === true,
        projectLayerLoaded: find('project')?.observations?.features.apps === true,
        emptyProjectTablePreservesMcp: find('inherited-mcp')?.observations?.mcpEntries === 1,
        legacyNotifyNotEmpty: find('notify')?.observations?.notifyEmpty === false,
        managedRequirementObserved: find('managed')?.observations?.requirementsPresent === true && find('managed')?.observations?.features.apps === true,
        malformedStrictlyRejected: find('malformed')?.status === 'SERVER_EXITED' && /TOML parse error/.test(find('malformed')?.diagnostic ?? ''),
        requiredFeatureCoverage: report.cases.filter(item => item.name !== 'malformed').every(item => item.observations?.missingFeatures?.length === 0),
      };
      if (Object.values(report.counterexamples).some(value => value !== true)) report.failure = 'COUNTEREXAMPLE_UNPROVED';
    }
    report.unproved = ['only named static stdio MCP startup is covered by activation mode, not general auxiliary disablement',
      'SessionStart/notify hooks require a turn in pinned source; hooks/trust bypass/bundled-executor plugins remain unproved',
      'persisted plugin/remote-control and managed-layer interpretation need dedicated fixtures',
      'network denial is not disabled telemetry; offline credentials/config differ from production',
      'thread echo matches only this synthetic fixture; no model turn or credentialed production equivalence'];
    return report;
  } catch (error) {
    report.failure = /^[A-Z_]+$/.test(error.message) ? error.message : 'PROBE_UNAVAILABLE';
    return report;
  } finally {
    if (root && cleanupSafe) await rm(root, { recursive: true, force: true });
    else if (root) report.retainedOwnedScratch = root;
  }
}

if (mode === '--owner') await owner(JSON.parse(process.argv[4]));
else {
  const report = await main();
  if (report.failure) report.status = 'UNAVAILABLE';
  process.stdout.write(JSON.stringify(report) + '\n');
  if (report.failure || (mode === '--boundary-test' && report.status !== 'BOUNDARY_VERIFIED')) process.exitCode = 1;
}
