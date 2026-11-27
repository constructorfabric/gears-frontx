import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

type DatabaseSyncCtor = typeof import('node:sqlite').DatabaseSync;
let databaseSync: DatabaseSyncCtor | undefined;

// node:sqlite prints an ExperimentalWarning on first load; that line would pollute
// every mutating command's stderr, so only that one warning is dropped.
// @cpt-begin:cpt-frontx-algo-upgrade-changeset-mutation-boundary:p1:inst-mb-acquire
function loadDatabaseSync(): DatabaseSyncCtor {
  if (databaseSync) return databaseSync;
  const emitWarning = process.emitWarning;
  process.emitWarning = ((warning: string | Error, ...rest: unknown[]) => {
    const type = typeof rest[0] === 'string' ? rest[0] : (rest[0] as { type?: string } | undefined)?.type;
    if (type === 'ExperimentalWarning' && String(warning).startsWith('SQLite')) return;
    return (emitWarning as (...args: unknown[]) => void).call(process, warning, ...rest);
  }) as typeof process.emitWarning;
  try {
    databaseSync = (process.getBuiltinModule('node:sqlite') as typeof import('node:sqlite')).DatabaseSync;
  } finally {
    process.emitWarning = emitWarning;
  }
  return databaseSync;
}
// @cpt-end:cpt-frontx-algo-upgrade-changeset-mutation-boundary:p1:inst-mb-acquire

/** Another cooperating writer holds the namespace mutex past the busy timeout. */
// @cpt-begin:cpt-frontx-algo-upgrade-changeset-mutation-boundary:p1:inst-mb-if-busy
export class NamespaceLockBusyError extends Error {}
// @cpt-end:cpt-frontx-algo-upgrade-changeset-mutation-boundary:p1:inst-mb-if-busy

// @cpt-begin:cpt-frontx-algo-upgrade-changeset-mutation-boundary:p1:inst-mb-acquire
function unsafePermissions(stat: fs.Stats, privateMode: boolean): boolean {
  // Windows exposes synthetic POSIX mode bits. Access follows the user's profile ACL.
  return (typeof process.getuid === 'function' && stat.uid !== process.getuid()) ||
    (privateMode && process.platform !== 'win32' && (stat.mode & 0o077) !== 0);
}

export const NAMESPACE_LOCK_FILENAME = 'namespace-lock.sqlite';

function assertDirectory(directory: string, privateMode: boolean): void {
  const stat = fs.lstatSync(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink() || unsafePermissions(stat, privateMode)) {
    throw new Error(`Unsafe namespace lock directory: ${directory}`);
  }
}
// @cpt-end:cpt-frontx-algo-upgrade-changeset-mutation-boundary:p1:inst-mb-acquire

/** Acquires the per-user SQLite namespace mutex. Caller must release it. */
// @cpt-begin:cpt-frontx-algo-upgrade-changeset-mutation-boundary:p1:inst-mb-acquire
export function acquireNamespaceLock(timeoutMs = 5_000): () => void {
  return acquireNamespaceLockIn(path.join(os.homedir(), '.frontx'), timeoutMs);
}
// @cpt-end:cpt-frontx-algo-upgrade-changeset-mutation-boundary:p1:inst-mb-acquire

// Internal test seam; the package does not expose this module as a public API.
// @cpt-begin:cpt-frontx-algo-upgrade-changeset-mutation-boundary:p1:inst-mb-acquire
export function acquireNamespaceLockIn(frontxDirectory: string, timeoutMs = 5_000): () => void {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 0) {
    throw new RangeError('timeoutMs must be a non-negative safe integer');
  }
  const lockDirectory = path.join(frontxDirectory, 'operations');
  const lockPath = path.join(lockDirectory, NAMESPACE_LOCK_FILENAME);
  try { fs.mkdirSync(frontxDirectory, { mode: 0o700 }); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
  assertDirectory(frontxDirectory, false);
  try { fs.mkdirSync(lockDirectory, { mode: 0o700 }); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
  assertDirectory(lockDirectory, true);
  // Publish a private file atomically, including when two writers first use this HOME.
  try {
    fs.closeSync(fs.openSync(lockPath, 'wx', 0o600));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
  }
  const stat = fs.lstatSync(lockPath);
  if (!stat.isFile() || unsafePermissions(stat, true)) throw new Error(`Unsafe namespace lock file: ${lockPath}`);

  const DatabaseSync = loadDatabaseSync();
  const db = new DatabaseSync(lockPath, { timeout: timeoutMs });
  try {
    db.exec('PRAGMA journal_mode = DELETE');
    db.exec('BEGIN IMMEDIATE');
  } catch (error) {
    db.close();
    // SQLITE_BUSY (5): a live competing lease, not a broken lock.
    // @cpt-begin:cpt-frontx-algo-upgrade-changeset-mutation-boundary:p1:inst-mb-if-busy
    if ((error as { errcode?: number }).errcode === 5) throw new NamespaceLockBusyError(`Another frontx operation holds ${lockPath}`);
    // @cpt-end:cpt-frontx-algo-upgrade-changeset-mutation-boundary:p1:inst-mb-if-busy
    throw error;
  }
  // @cpt-end:cpt-frontx-algo-upgrade-changeset-mutation-boundary:p1:inst-mb-acquire
  // @cpt-begin:cpt-frontx-algo-upgrade-changeset-mutation-boundary:p1:inst-mb-release-mutex
  let released = false;
  return () => {
    if (released) return;
    released = true;
    try { db.exec('COMMIT'); } finally { db.close(); }
  };
  // @cpt-end:cpt-frontx-algo-upgrade-changeset-mutation-boundary:p1:inst-mb-release-mutex
}
