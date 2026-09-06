import { describe, expect, it } from 'vitest';
import { chmod, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildArgs, boundedProcess, digestTree, ENV, LIMIT, summarizePages, summarizeConfig, validatePackageManifest, validatePackageLayout, verifyAfterProcess } from '../tools/policy/boundary.mjs';

const runtime = '/nix/store/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-runtime';
const fixture = '/tmp/swarm-policy-Abc123/baseline';
const command = ['/runtime/bin/node', '/fixture/inner.mjs', 'boundary'];

describe('offline policy boundary contract (not production authority)', () => {
  it('requires private namespaces, no privilege escalation, readonly root and no host fallback', () => {
    const args = buildArgs(runtime, [runtime], fixture, command);
    for (const flag of ['--unshare-all', '--unshare-user', '--disable-userns', '--cap-drop', '--new-session', '--die-with-parent', '--clearenv']) expect(args).toContain(flag);
    expect(args.slice(-5)).toEqual(['/', '--', ...command]);
    expect(args).not.toContain('--as-pid-1');
    expect(args).not.toContain('--share-net');
    const binds = args.flatMap((item, i) => item === '--ro-bind' ? [args[i + 1]] : []);
    expect(binds).toEqual([runtime, runtime, ...['home', 'work', 'etc', 'fixture', 'package'].map(name => `${fixture}/${name}`)]);
    expect(binds.some(path => ['/', '/home', '/run', '/proc', '/etc', '/nix/store'].includes(path))).toBe(false);
  });
  it('has an exact nonsecret environment rather than inherited credentials, bus, display or loader hooks', () => {
    expect(Object.keys(ENV).sort()).toEqual(['CODEX_HOME', 'HOME', 'LANG', 'PATH', 'PWD', 'SHELL', 'TMPDIR', 'XDG_CACHE_HOME', 'XDG_CONFIG_HOME', 'XDG_DATA_HOME', 'XDG_RUNTIME_DIR']);
    expect(ENV.HOME).toBe('/home/probe');
    expect(ENV.CODEX_HOME).toBe('/home/probe/.codex');
    expect(Object.isFrozen(ENV)).toBe(true);
  });
  it.each(['/', '/tmp/../home', '/home/tedks', '/tmp/swarm-policy-Abc123/../bad', '/tmp/swarm-policy-Abc123/bad\n'])('rejects unsafe fixture path %s', path => {
    expect(() => buildArgs(runtime, [runtime], path, command)).toThrow('INVALID_BOUNDARY_INPUT');
  });
  it('rejects incomplete runtime identity, whole store and invalid command bounds', () => {
    expect(() => buildArgs(runtime, [], fixture, command)).toThrow();
    expect(() => buildArgs(runtime, [runtime, '/nix/store'], fixture, command)).toThrow();
    expect(() => buildArgs(runtime, [runtime], fixture, ['bad\0command'])).toThrow();
    expect(() => buildArgs(runtime, [runtime], fixture, Array(33).fill('x'))).toThrow();
  });
  it('pins version and complete executable/companion layout rather than accepting changed packages', () => {
    const manifest = { version: '0.153.4', layoutVersion: 1, target: 'x86_64-unknown-linux-musl', variant: 'codex',
      entrypoint: 'bin/codex', resourcesDir: 'codex-resources', pathDir: 'codex-path' };
    expect(() => validatePackageManifest(manifest)).not.toThrow();
    for (const changed of [{ version: '0.146.0' }, { version: '0.153.5' }, { layoutVersion: 2 },
      { target: 'other' }, { entrypoint: '../codex' }, { pathDir: '/usr/bin' }]) {
      expect(() => validatePackageManifest({ ...manifest, ...changed })).toThrow('UNSUPPORTED_PACKAGE');
    }
    expect(() => validatePackageManifest(null)).toThrow();
  });
  it('requires actual executable resources, not only manifest strings and two binaries', async () => {
    const root = await mkdtemp(join(tmpdir(), 'policy-package-'));
    try {
      for (const dir of ['bin', 'codex-path', 'codex-resources/zsh/bin']) await mkdir(join(root, dir), { recursive: true });
      for (const path of ['bin/codex', 'bin/codex-code-mode-host', 'codex-path/rg', 'codex-resources/bwrap', 'codex-resources/zsh/bin/zsh']) {
        await expect(validatePackageLayout(root)).rejects.toThrow();
        await writeFile(join(root, path), 'synthetic executable'); await chmod(join(root, path), 0o700);
      }
      await expect(validatePackageLayout(root)).resolves.toBeUndefined();
      await chmod(join(root, 'codex-resources/bwrap'), 0o600);
      await expect(validatePackageLayout(root)).rejects.toThrow('INCOMPLETE_PACKAGE');
    } finally { await rm(root, { recursive: true, force: true }); }
  });
  it('retains uncertain ownership before any fallible post-process hashing', async () => {
    let called = false;
    const result = await verifyAfterProcess({ cleanup: 'unknown' }, async () => { called = true; throw new Error('changed or inaccessible'); });
    expect(result).toEqual({ ok: false, failure: 'PROBE_CLEANUP_UNPROVED', cleanupSafe: false });
    expect(called).toBe(false);
    expect(await verifyAfterProcess({ cleanup: 'reaped' }, async () => false)).toMatchObject({ ok: false, failure: 'INPUT_CHANGED', cleanupSafe: true });
    expect(await verifyAfterProcess({ cleanup: 'reaped' }, async () => { throw new Error(); })).toMatchObject({ ok: false, failure: 'INPUT_RECHECK_FAILED' });
  });
  it('accepts complete effective pages but reports missing required features as unknown', () => {
    const value = summarizePages([{ data: [{ name: 'hooks', enabled: false }], nextCursor: 'next' },
      { data: [{ name: 'apps', enabled: true }], nextCursor: null }], ['hooks', 'apps', 'plugins']);
    expect(value).toEqual({ features: { hooks: false, apps: true }, pages: 2, missing: ['plugins'] });
  });
  it('does not turn missing configuration into a successful notify/MCP counterexample', () => {
    const response = { config: { notify: [], mcp_servers: {} }, layers: [] };
    expect(summarizeConfig(response, { requirements: null })).toMatchObject({ notifyEmpty: true, mcpEntries: 0, requirementsPresent: false });
    for (const config of [{ mcp_servers: {} }, { notify: null, mcp_servers: {} }, { notify: [{}], mcp_servers: {} },
      { notify: [], mcp_servers: [] }, { notify: [] }]) {
      expect(() => summarizeConfig({ config, layers: [] }, { requirements: null })).toThrow('CONFIG_OBSERVATION_INCOMPLETE');
    }
    expect(() => summarizeConfig(response, {})).toThrow();
    expect(() => summarizeConfig(response, { requirements: [] })).toThrow();
  });
  it.each([
    [], [{ data: [], nextCursor: 'missing' }], [{ data: [] }],
    [{ data: [], nextCursor: null }, { data: [], nextCursor: null }],
    [{ data: [], nextCursor: 'repeat' }, { data: [], nextCursor: 'repeat' }, { data: [], nextCursor: null }],
    [{ data: [{ name: 'hooks', enabled: false }, { name: 'hooks', enabled: true }], nextCursor: null }],
    [{ data: [{ name: 'hooks', enabled: 'false' }], nextCursor: null }],
    [{ data: [{ name: '__proto__', enabled: false }], nextCursor: null }],
  ].map(pages => ({ pages })))('refuses ambiguous, incomplete or malformed effective-feature observations %#', ({ pages }) => {
    expect(() => summarizePages(pages)).toThrow();
  });
  it('detects config identity changes and rejects symlink input trees', async () => {
    const root = await mkdtemp(join(tmpdir(), 'policy-digest-'));
    try {
      await mkdir(join(root, 'home'));
      await writeFile(join(root, 'home/config.toml'), 'hooks=false');
      const initial = await digestTree(root);
      expect(await digestTree(root)).toBe(initial);
      await writeFile(join(root, 'home/config.toml'), 'hooks=true');
      expect(await digestTree(root)).not.toBe(initial);
      await symlink('/etc/passwd', join(root, 'escape'));
      await expect(digestTree(root)).rejects.toThrow('UNSUPPORTED_INPUT_TREE');
    } finally { await rm(root, { recursive: true, force: true }); }
  });
  it('does not inherit secret-like synthetic env or extra descriptors in subprocesses', async () => {
    const previous = process.env.SWARM_SYNTHETIC_SECRET;
    process.env.SWARM_SYNTHETIC_SECRET = 'synthetic-only';
    try {
      const result = await boundedProcess(process.execPath, ['-e', 'process.stdout.write(JSON.stringify(process.env))']);
      expect(result.ok && JSON.parse(result.stdout)).toEqual({ LANG: 'C.UTF-8' });
    } finally { if (previous === undefined) delete process.env.SWARM_SYNTHETIC_SECRET; else process.env.SWARM_SYNTHETIC_SECRET = previous; }
  });
  it('bounds deadlines and both output streams, reports failures without raw output', async () => {
    const timeout = await boundedProcess(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { timeoutMs: 30 });
    expect(timeout).toMatchObject({ ok: false, code: 'DEADLINE', cleanup: 'reaped' });
    for (const stream of ['stdout', 'stderr']) {
      const result = await boundedProcess(process.execPath, ['-e', `process.${stream}.write('x'.repeat(${LIMIT + 4096}));setInterval(()=>{},1000)`]);
      expect(result).toMatchObject({ ok: false, code: 'OUTPUT_LIMIT', cleanup: 'reaped' });
      expect(result).not.toHaveProperty('stdout');
    }
  });
  it('fails missing executables and invalid bounds without fallback', async () => {
    expect(await boundedProcess('/missing/policy/binary', [])).toMatchObject({ ok: false, code: 'START_FAILED', cleanup: 'not-started' });
    expect(await boundedProcess(process.execPath, [], { timeoutMs: Infinity })).toMatchObject({ ok: false, code: 'INVALID_LIMIT' });
    expect(await boundedProcess(process.execPath, [], { input: 'x'.repeat(LIMIT + 1) })).toMatchObject({ ok: false, code: 'INVALID_LIMIT' });
  });
});
