import { EventEmitter } from 'node:events';
import { spawn } from 'node:child_process';
import { closeSync, existsSync, fstatSync, openSync, readSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { activate } from '../tools/policy/activation.mjs';
import { activationVerdict } from '../tools/policy/activation-contract.mjs';

vi.mock('node:child_process', () => ({ spawn: vi.fn() }));
vi.mock('node:fs', async importOriginal => ({
  ...await importOriginal<typeof import('node:fs')>(),
  existsSync: vi.fn(), openSync: vi.fn(), fstatSync: vi.fn(), readSync: vi.fn(), closeSync: vi.fn(),
}));

const booted = 'boot\ninitialize\ninitialized\ntools/list\n';
const requiredPrefix = 'required MCP servers failed to initialize: policy_canary: ';

function observer(expected = 'enabled', canary?: string) {
  vi.useFakeTimers();
  let marker = canary === undefined ? undefined : Buffer.from(canary), nextFd = 10;
  const descriptors = new Map<number, { bytes: Buffer; offset: number }>();
  vi.mocked(existsSync).mockImplementation(path => String(path) === '/state/mcp-canary' && marker !== undefined);
  vi.mocked(openSync).mockImplementation(path => {
    if (String(path) !== '/state/mcp-canary' || marker === undefined) throw new Error('synthetic missing file');
    const fd = nextFd++;
    descriptors.set(fd, { bytes: marker, offset: 0 });
    return fd;
  });
  vi.mocked(fstatSync).mockReturnValue({ isFile: () => true } as ReturnType<typeof fstatSync>);
  vi.mocked(readSync).mockImplementation(((fd: number, buffer: Buffer, offset: number, length: number) => {
    const file = descriptors.get(fd)!;
    const amount = Math.min(length, file.bytes.length - file.offset);
    file.bytes.copy(buffer, offset, file.offset, file.offset + amount);
    file.offset += amount;
    return amount;
  }) as typeof readSync);
  vi.mocked(closeSync).mockImplementation(fd => { descriptors.delete(fd); });
  const child = Object.assign(new EventEmitter(), {
    stdin: Object.assign(new EventEmitter(), { write: vi.fn(), end: vi.fn() }),
    stdout: new EventEmitter(), stderr: new EventEmitter(), kill: vi.fn(),
  });
  vi.mocked(spawn).mockReturnValue(child as unknown as ReturnType<typeof spawn>);
  const result = activate(expected);
  let settled = false;
  void result.then(() => { settled = true; });
  const reply = (value: unknown) => child.stdout.emit('data', Buffer.from(JSON.stringify(value) + '\n'));
  const startup = (status: string, name = 'policy_canary', threadId = 'synthetic-thread') => reply({
    method: 'mcpServer/startupStatus/updated', params: { name, status, threadId },
  });
  async function threadReply(error?: string, statuses: string[] = []) {
    reply({ id: 1, result: { codexHome: '/home/probe/.codex' } });
    await Promise.resolve();
    for (const status of statuses) startup(status);
    reply(error ? { id: 2, error: { message: error } } : {
      id: 2, result: { thread: { id: 'synthetic-thread', ephemeral: true }, cwd: '/work',
        modelProvider: 'policy_offline', approvalPolicy: 'never', sandbox: { type: 'readOnly' } },
    });
    await Promise.resolve();
  }
  function close(code: number | null = 0, signal: string | null = null) {
    child.emit('exit', code, signal); child.emit('close', code, signal);
  }
  return { child, result, reply, startup, threadReply, close, settled: () => settled,
    setCanary: (value: string) => { marker = Buffer.from(value); } };
}

afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });

describe('activation lifecycle evidence, not a universal execution observer', () => {
  it.each(['unknown', 'turn/start', '', '__proto__'])('rejects unsupported case %s before spawning', async kind => {
    expect(await activate(kind)).toMatchObject({ status: 'ACTIVATION_CASE_INVALID' });
    expect(spawn).not.toHaveBeenCalled();
  });

  it('waits for ready and exact handshake before EOF, then waits for clean close', async () => {
    const run = observer('enabled', 'boot\ninitialize\n');
    await run.threadReply(undefined, ['starting']);
    await vi.advanceTimersByTimeAsync(100);
    expect(run.child.stdin.end).not.toHaveBeenCalled();
    run.setCanary(booted);
    await vi.advanceTimersByTimeAsync(100);
    expect(run.child.stdin.end).not.toHaveBeenCalled();
    run.startup('ready');
    await vi.advanceTimersByTimeAsync(100);
    expect(run.child.stdin.end).toHaveBeenCalledOnce();
    expect(run.settled()).toBe(false);
    run.close();
    const result = await run.result;
    expect(result.status).toBe('ACTIVATION_OBSERVED');
    expect(result.observation).toMatchObject({ processClosed: true, generationObserved: false,
      canaryRecords: ['boot', 'initialize', 'initialized', 'tools/list'], providerReportedStartup: ['starting', 'ready'] });
    expect(activationVerdict(result.observation, 'enabled')).toBe(true);
    expect(activationVerdict(result.observation, 'disabled')).toBe(false);
  });

  it('requires startup notifications even when the marker is complete', async () => {
    const run = observer('enabled', booted);
    await run.threadReply();
    await vi.advanceTimersByTimeAsync(7999);
    expect(run.child.stdin.end).not.toHaveBeenCalled();
    expect(run.settled()).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await run.result).toMatchObject({ status: 'SERVER_DEADLINE' });
  });

  it('does not treat ready alone as a successful canary handshake', async () => {
    const run = observer('enabled', 'boot\n');
    await run.threadReply(undefined, ['starting', 'ready']);
    await vi.advanceTimersByTimeAsync(8000);
    expect(activationVerdict((await run.result).observation, 'enabled')).toBe(false);
  });

  it('rejects startup notifications belonging to another synthetic thread', async () => {
    const run = observer('enabled', booted); await run.threadReply();
    run.startup('starting', 'policy_canary', 'wrong-thread'); run.startup('ready', 'policy_canary', 'wrong-thread');
    await vi.advanceTimersByTimeAsync(100); run.close();
    expect(await run.result).toMatchObject({ status: 'MCP_THREAD_MISMATCH' });
  });

  it('rejects an invalid named startup status', async () => {
    const run = observer('enabled', booted); await run.threadReply();
    run.startup('invented-success');
    expect(await run.result).toMatchObject({ status: 'MCP_STATUS_INVALID' });
  });

  it('requires clean close for the negative and sends only fixed allowed RPCs', async () => {
    const run = observer('disabled');
    await run.threadReply();
    expect(run.child.stdin.end).toHaveBeenCalledOnce();
    expect(run.settled()).toBe(false);
    run.close();
    const result = await run.result;
    expect(result.status).toBe('ACTIVATION_OBSERVED');
    expect(activationVerdict(result.observation, 'disabled')).toBe(true);
    expect(result.observation).not.toHaveProperty('execAttempts');
    expect(result.observation).not.toHaveProperty('traceComplete');
    expect(run.child.stdin.write.mock.calls.map(([line]) => JSON.parse(line).method)).toEqual(['initialize', 'initialized', 'thread/start']);
    expect(vi.mocked(spawn).mock.calls[0][0]).toBe('/package/bin/codex');
  });

  it.each([
    ['fails', 'boot\ninitialize\n', 'synthetic initialize rejection', 'initialization-failed'],
    ['missing', undefined, 'No such file or directory (os error 2)', 'executable-not-found'],
  ])('records exact named %s rejection without requiring success-only startup events', async (kind, marker, message, rejectionReason) => {
    const run = observer(kind, marker);
    await run.threadReply(requiredPrefix + message);
    run.close();
    const result = await run.result;
    expect(result.status).toBe('ACTIVATION_OBSERVED');
    expect(result.observation).toMatchObject({ rejectionReason, providerReportedStartup: [], processClosed: true });
    expect(activationVerdict(result.observation, kind!)).toBe(true);
    expect(activationVerdict(result.observation, 'disabled')).toBe(false);
  });

  it.each([[1, null], [null, 'SIGKILL']] as const)('rejects close (%s, %s) after a valid reply', async (code, signal) => {
    const run = observer('disabled'); await run.threadReply(); run.close(code, signal);
    expect((await run.result).status).not.toBe('ACTIVATION_OBSERVED');
  });

  it('keeps the original eight-second deadline while awaiting process close', async () => {
    const run = observer('disabled');
    await vi.advanceTimersByTimeAsync(7000); await run.threadReply();
    await vi.advanceTimersByTimeAsync(999); expect(run.settled()).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await run.result).toMatchObject({ status: 'SERVER_DEADLINE' });
    expect(run.child.kill).toHaveBeenCalledWith('SIGKILL');
  });

  it.each([
    ['malformed JSON', 'not-json\n'], ['non-object JSON', '[]\n'],
    ['unexpected request', JSON.stringify({ id: 90, method: 'account/login/complete', params: {} }) + '\n'],
    ['unexpected reply', JSON.stringify({ id: 90, result: {} }) + '\n'],
    ['ambiguous reply', JSON.stringify({ id: 1, result: {}, error: {} }) + '\n'],
  ])('rejects %s', async (_label, text) => {
    const run = observer('disabled'); run.child.stdout.emit('data', Buffer.from(text));
    expect((await run.result).status).not.toBe('ACTIVATION_OBSERVED');
  });

  it.each(['turn/started', 'turn/completed', 'item/agentMessage/delta', 'codex/event/task_started'])('rejects generation notification %s', async method => {
    const run = observer('disabled'); await run.threadReply(); run.reply({ method, params: {} }); run.close();
    expect(await run.result).toMatchObject({ status: 'GENERATION_OBSERVED', observation: { generationObserved: true } });
  });

  it.each(['required MCP servers failed to initialize: unrelated_server: synthetic failure', 'authentication required'])
  ('rejects unrelated required error or unknown rejection: %s', async message => {
    const run = observer('fails', 'boot\ninitialize\n'); await run.threadReply(message); run.close();
    const result = await run.result;
    expect(result.status).not.toBe('ACTIVATION_OBSERVED');
    expect(activationVerdict(result.observation, 'fails')).toBe(false);
    expect(activationVerdict(result.observation, 'missing')).toBe(false);
  });

  it.each(['stdout', 'stderr'] as const)('bounds %s without exposing raw output', async stream => {
    const run = observer('disabled');
    run.child[stream].emit('data', Buffer.from('synthetic-private-text' + 'x'.repeat(256 * 1024)));
    const result = await run.result;
    expect(result.status).toBe('SERVER_OUTPUT_LIMIT');
    expect(JSON.stringify(result)).not.toContain('synthetic-private-text');
  });

  it.each([['oversized marker', 'x'.repeat(513)], ['invalid marker', 'boot\nunexpected-record\n'], ['too many records', 'boot\n'.repeat(17)]])
  ('rejects %s', async (_label, marker) => {
    const run = observer('enabled', marker); await run.threadReply(undefined, ['starting', 'ready']);
    await vi.advanceTimersByTimeAsync(100); run.close();
    expect((await run.result).status).not.toBe('ACTIVATION_OBSERVED');
  });

  it('rejects an incomplete final protocol record after close', async () => {
    const run = observer('disabled'); await run.threadReply();
    run.child.stdout.emit('data', Buffer.from('{"method":')); run.close();
    expect(await run.result).toMatchObject({ status: 'SERVER_INCOMPLETE_JSON' });
  });

  it('rejects non-regular canary state without treating it as an absent canary', async () => {
    const run = observer('enabled', booted);
    vi.mocked(fstatSync).mockReturnValue({ isFile: () => false } as ReturnType<typeof fstatSync>);
    await run.threadReply(undefined, ['starting', 'ready']);
    expect(await run.result).toMatchObject({ status: 'OBSERVATION_NOT_FILE' });
  });
});
