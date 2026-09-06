import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { spawn } from 'node:child_process';
import { boundedProcess, LIMIT } from '../tools/policy/boundary.mjs';

vi.mock('node:child_process', () => ({ spawn: vi.fn() }));

function bootstrap() {
  vi.useFakeTimers();
  const stream = () => Object.assign(new EventEmitter(), { end: vi.fn(), destroy: vi.fn() });
  const child = Object.assign(new EventEmitter(), {
    stdout: stream(), stderr: stream(), stdin: stream(), stdio: [null, null, null, null, stream()], kill: vi.fn(),
  });
  vi.mocked(spawn).mockReturnValue(child as unknown as ReturnType<typeof spawn>);
  return child;
}

afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });

describe('bounded bootstrap diagnostics, never isolation acceptance', () => {
  it.each([
    ['Operation not permitted', 'NAMESPACE_OPERATION_NOT_PERMITTED'],
    ['Permission denied', 'NAMESPACE_PERMISSION_DENIED'],
  ])('drains an observed namespace stderr message after seed failure: %s', async (message, observation) => {
    const child = bootstrap();
    const result = boundedProcess('/synthetic/bwrap', [], { seed: true });
    child.stdio[4]!.emit('error', new Error('synthetic closed pipe'));
    expect(child.kill).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(50);
    child.stderr.emit('data', Buffer.from('bwrap: Creating new namespace '));
    child.stderr.emit('data', Buffer.from(`failed: ${message}\n`));
    child.emit('close', 1, null);
    expect(await result).toEqual({ ok: false, code: 'SEED_PIPE_FAILED', cleanup: 'reaped', exitCode: 1,
      signal: null, bootstrapDiagnostic: { observation, truncated: false } });
    await vi.advanceTimersByTimeAsync(10000);
    expect(child.kill).not.toHaveBeenCalled();
  });

  it('keeps seed failure fatal even if the child exits zero and prints successful-looking output', async () => {
    const child = bootstrap();
    const result = boundedProcess('/synthetic/bwrap', [], { seed: true });
    child.stdout.emit('data', Buffer.from('{"ok":true}'));
    child.stdio[4]!.emit('error', new Error('synthetic closed pipe'));
    child.emit('close', 0, null);
    expect(await result).toMatchObject({ ok: false, code: 'SEED_PIPE_FAILED',
      bootstrapDiagnostic: { observation: 'NO_STDERR', truncated: false } });
    expect(await result).not.toHaveProperty('stdout');
  });

  it('retains early stderr when the seed pipe subsequently closes', async () => {
    const child = bootstrap();
    const result = boundedProcess('/synthetic/bwrap', [], { seed: true });
    child.stderr.emit('data', Buffer.from('bwrap: Creating new namespace failed: Operation not permitted\n'));
    child.stdio[4]!.emit('error', new Error('synthetic closed pipe'));
    child.emit('close', 1, null);
    expect(await result).toMatchObject({ ok: false, code: 'SEED_PIPE_FAILED', cleanup: 'reaped',
      bootstrapDiagnostic: { observation: 'NAMESPACE_OPERATION_NOT_PERMITTED', truncated: false } });
  });

  it('kills at the finite seed grace then reports unknown cleanup if no close arrives', async () => {
    const child = bootstrap();
    const result = boundedProcess('/synthetic/bwrap', [], { seed: true });
    child.stdio[4]!.emit('error', new Error('synthetic closed pipe'));
    await vi.advanceTimersByTimeAsync(99);
    expect(child.kill).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(child.kill).toHaveBeenCalledWith('SIGKILL');
    await vi.advanceTimersByTimeAsync(2000);
    expect(await result).toMatchObject({ ok: false, code: 'SEED_PIPE_FAILED', cleanup: 'unknown',
      bootstrapDiagnostic: { observation: 'NO_STDERR', truncated: false } });
    for (const stream of [child.stdout, child.stderr, child.stdin, child.stdio[4]!]) expect(stream.destroy).toHaveBeenCalledOnce();
  });

  it('does not extend the original deadline to collect diagnostics', async () => {
    const child = bootstrap();
    const result = boundedProcess('/synthetic/bwrap', [], { seed: true, timeoutMs: 30 });
    child.stdio[4]!.emit('error', new Error('synthetic closed pipe'));
    await vi.advanceTimersByTimeAsync(30);
    expect(child.kill).toHaveBeenCalledWith('SIGKILL');
    child.emit('close', null, 'SIGKILL');
    expect(await result).toMatchObject({ ok: false, code: 'SEED_PIPE_FAILED', cleanup: 'reaped' });
  });

  it('enforces output bounds immediately during grace without leaking stderr', async () => {
    const child = bootstrap();
    const result = boundedProcess('/synthetic/bwrap', [], { seed: true });
    child.stdio[4]!.emit('error', new Error('synthetic closed pipe'));
    child.stderr.emit('data', Buffer.from(`synthetic-private-value${'x'.repeat(LIMIT)}`));
    expect(child.kill).toHaveBeenCalledWith('SIGKILL');
    child.emit('close', null, 'SIGKILL');
    expect(await result).toMatchObject({ ok: false, code: 'SEED_PIPE_FAILED', cleanup: 'reaped',
      bootstrapDiagnostic: { observation: 'UNRECOGNIZED_STDERR', truncated: true } });
    expect(JSON.stringify(await result)).not.toContain('synthetic-private-value');
  });

  it('does not infer causes from arbitrary prose or a diagnostic on stdout', async () => {
    const child = bootstrap();
    const result = boundedProcess('/synthetic/bwrap', [], { seed: true });
    child.stdout.emit('data', Buffer.from('bwrap: Creating new namespace failed: Operation not permitted\n'));
    child.stderr.emit('data', Buffer.from('Possible AppArmor/userns issue: synthetic-private-value\n'));
    child.emit('close', 1, null);
    expect(await result).toMatchObject({ ok: false, code: 'PROCESS_FAILED',
      bootstrapDiagnostic: { observation: 'UNRECOGNIZED_STDERR', truncated: false } });
    expect(JSON.stringify(await result)).not.toContain('synthetic-private-value');
  });

  it('cannot recognize an exact-looking prefix when the captured diagnostic is truncated', async () => {
    const child = bootstrap();
    const result = boundedProcess('/synthetic/bwrap', [], { seed: true });
    const line = 'bwrap: Creating new namespace failed: Operation not permitted';
    child.stderr.emit('data', Buffer.from(`${'x'.repeat(4096 - line.length - 1)}\n${line}more text`));
    child.emit('close', 1, null);
    expect(await result).toMatchObject({ ok: false, code: 'PROCESS_FAILED',
      bootstrapDiagnostic: { observation: 'UNRECOGNIZED_STDERR', truncated: true } });
  });
});
