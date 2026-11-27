import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { acquireNamespaceLockIn } from '../operations/namespace-lock';
import { describe, expect, it } from 'vitest';

const modulePath = new URL('../operations/namespace-lock.ts', import.meta.url).href;

function child(code: string) {
  return spawn(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', code], {
    cwd: process.cwd(), env: process.env, stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function result(proc: ReturnType<typeof child>): Promise<{ code: number | null; stdout: string; stderr: string }> {
  let stdout = ''; let stderr = '';
  proc.stdout.on('data', chunk => stdout += chunk);
  proc.stderr.on('data', chunk => stderr += chunk);
  return new Promise((resolve, reject) => {
    proc.once('error', reject);
    proc.once('close', code => resolve({ code, stdout: stdout.trim(), stderr: stderr.trim() }));
  });
}

describe('namespace lock process behavior', () => {
  it('passes isolated profile and temp directories to child processes', async () => {
    const proc = child("const os = await import('node:os'); console.log(JSON.stringify([os.homedir(), os.tmpdir(), process.env.USERPROFILE, process.env.TEMP]));");
    const output = await result(proc);
    expect(output.code).toBe(0);
    expect(JSON.parse(output.stdout)).toEqual([os.homedir(), os.tmpdir(), os.homedir(), os.tmpdir()]);
    expect(path.dirname(os.tmpdir())).toBe(path.dirname(os.homedir()));
    expect(os.tmpdir()).not.toBe(os.homedir());
  });

  it('accepts Windows synthetic mode bits when creating and reopening the mutex', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'frontx-win-lock-'));
    const dir = path.join(root, 'operations');
    const lock = path.join(dir, 'namespace-lock.sqlite');
    const platform = Object.getOwnPropertyDescriptor(process, 'platform')!;
    const uid = Object.getOwnPropertyDescriptor(process, 'getuid');
    try {
      fs.mkdirSync(dir);
      fs.chmodSync(dir, 0o777);
      if (process.platform !== 'win32') expect(() => acquireNamespaceLockIn(root)).toThrow(/Unsafe namespace lock directory/);
      Object.defineProperty(process, 'platform', { configurable: true, value: 'win32' });
      Object.defineProperty(process, 'getuid', { configurable: true, value: undefined });
      acquireNamespaceLockIn(root)();
      fs.chmodSync(lock, 0o666);
      acquireNamespaceLockIn(root)();
    } finally {
      Object.defineProperty(process, 'platform', platform);
      if (uid) Object.defineProperty(process, 'getuid', uid);
      else Reflect.deleteProperty(process, 'getuid');
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('serializes competing processes and releases after SIGKILL', async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'frontx-lock-'));
    const source = `import { acquireNamespaceLockIn, NamespaceLockBusyError } from ${JSON.stringify(modulePath)};`;
    const root = JSON.stringify(path.join(home, '.frontx'));
    const holder = child(`${source} acquireNamespaceLockIn(${root}, 10000); console.log('held'); setInterval(() => {}, 1000);`);
    const held = result(holder);
    let resolveHeld!: () => void;
    const holderReady = new Promise<void>(resolve => { resolveHeld = resolve; });
    holder.stdout.once('data', resolveHeld);
    try {
      const started = await Promise.race([held, holderReady.then(() => null)]);
      if (started !== null) throw new Error(`holder exited early (${started.code}): ${started.stderr}`);
      // A second process with a short SQLite busy timeout must fail while the first owns BEGIN IMMEDIATE.
      const busy = child(`${source} try { acquireNamespaceLockIn(${root}, 100); console.log('acquired'); } catch (error) { if (!(error instanceof NamespaceLockBusyError)) throw error; console.log('busy'); }`);
      const outcome = await result(busy);
      if (outcome.code !== 0) throw new Error(`contender exited ${outcome.code}: ${outcome.stderr}`);
      expect(outcome.stdout).toBe('busy');
      holder.kill('SIGKILL');
      await held;
      const next = child(`${source} const release = acquireNamespaceLockIn(${root}, 1000); console.log('acquired'); release();`);
      const recovered = await result(next);
      if (recovered.code !== 0) throw new Error(`reacquirer exited ${recovered.code}: ${recovered.stderr}`);
      expect(recovered.stdout).toBe('acquired');
    } finally {
      holder.kill('SIGKILL');
      if (holder.exitCode === null) await held;
      const lockDir = path.join(home, '.frontx', 'operations');
      for (const file of ['namespace-lock.sqlite-journal', 'namespace-lock.sqlite-wal', 'namespace-lock.sqlite-shm', 'namespace-lock.sqlite']) {
        fs.rmSync(path.join(lockDir, file), { force: true });
      }
      fs.rmdirSync(lockDir);
      fs.rmdirSync(path.join(home, '.frontx'));
      fs.rmdirSync(home);
    }
  }, 15_000);
});
