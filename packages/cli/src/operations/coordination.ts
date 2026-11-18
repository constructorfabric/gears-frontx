// @cpt-algo:cpt-frontx-algo-upgrade-changeset-mutation-boundary:p1
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { probeVolumeCaseInsensitive } from '../paths/volume-case';
import { canonicalJson } from '../canonical-json';
import { acquireNamespaceLockIn, NAMESPACE_LOCK_FILENAME, NamespaceLockBusyError } from './namespace-lock';

/**
 * Shared mutation boundary for every writing CLI command (plan-ai-recovery r9 §2–§7):
 *
 * - one per-user namespace mutex (r9 §3.1) serializes cooperating same-user writers
 *   for the whole command, so discovery, checks and effects never interleave;
 * - an upgrade/restore transition writes its project receipt (`preparing`) BEFORE
 *   the shared reservation, the reservation under the ACTUAL inventory root
 *   (`<root>/.frontx-operations/reservations/<id>.json`), then advances the receipt
 *   to `prepared`; only then may any effect run;
 * - post-commit task status lives in the project entry. Its receipt is advanced to
 *   `finalizing` with the verified terminal entry before the reservation and
 *   then the receipt are unlinked — never otherwise;
 * - every writer refuses with RECOVERY_REQUIRED while a receipt for its project,
 *   or any reservation of its physical inventory root, exists. Unknown, malformed
 *   or orphaned records are never deleted automatically.
 *
 * shortcut: a reservation blocks every writer of its inventory root, not only the
 * reserved slot's footprint; narrow it when concurrent crash recovery across
 * projects becomes a real workflow.
 * shortcut: the mutex is held through interactive prompts, so a competing writer
 * gets RESOURCE_BUSY instead of waiting; release around prompts if that hurts.
 */
export class CoordinationError extends Error {
  constructor(
    readonly code: 'RECOVERY_REQUIRED' | 'RESOURCE_BUSY' | 'INTERNAL',
    message: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

/** Reserved directory directly under an inventory root; never a template slot. */
export const COORDINATION_DIRECTORY = '.frontx-operations';

export type TaskStatus = 'pending' | 'done' | 'not-required';

/** Immutable intent: everything the approval covered, fixed before the first effect. */
export interface TransitionIntent {
  kind: 'upgrade' | 'restore';
  name: string;
  from: { origin: string; version: string };
  to: { origin: string; version: string };
  /** canonicalJson of the entry before the transition (absent entry = "null"). */
  fromEntry: string;
  /** Digest of the approved plan, AI review included. */
  planDigest: string;
  /** sha256 of the full candidate (payload + AI bytes) the approval was bound to. */
  candidateHash: string;
  /** Project payload footprint with the pre-commit content hash (null = absent)
   * and the hash the approved plan lands there (`after`; absent only in receipts
   * written before it was recorded, which then cannot prove a partial result). */
  footprint: { path: string; before: string | null; after?: string | null }[];
  /** Initial post-commit task status. After the state commit the AUTHORITATIVE
   * status lives only in the entry's `pendingPostCommit` (project state, r9 §2.3). */
  tasks: { inventory: TaskStatus; ai: TaskStatus };
}

export interface TransitionReceipt {
  schemaVersion: 1;
  id: string;
  projectRoot: string;
  inventoryRoot: string;
  intent: TransitionIntent;
  phase: 'preparing' | 'prepared' | 'finalizing';
  /** Set with phase `finalizing`: the verified outcome and terminal entry. */
  completion?: { result: 'committed' | 'cancelled'; entry: string };
}

export interface Transition {
  readonly receipt: TransitionReceipt;
  readonly receiptPath: string;
  /**
   * Validated release (r9 §6.6–§6.7): checks the reservation against the immutable
   * record, persists `finalizing` with the verified terminal entry, runs
   * `beforeRelease` (clearing the entry's `pendingPostCommit`), then unlinks the
   * reservation and last the receipt. `committed` is only for a transition whose
   * every post-commit task the caller verified in project state; `cancelled` only
   * while the entry is still the pre-transition one.
   */
  finalize(result: 'committed' | 'cancelled', entry: string, beforeRelease?: () => Promise<void>): Promise<void>;
}

export interface MutationScope {
  readonly projectRoot: string;
  readonly inventoryRoot: string;
  /** Receipts found for this project; non-empty only in recover mode. */
  readonly pending: readonly Transition[];
  beginTransition(intent: TransitionIntent): Transition;
}

export type MutationMode = 'normal' | 'recover';

export type WithMutationScopeFn = <T>(
  projectRoot: string,
  mode: MutationMode,
  body: (scope: MutationScope) => Promise<T>,
) => Promise<T>;

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const RECORD = new RegExp(`^${UUID}\\.json$`);
// `writeRecord`'s temp name: never authoritative, it precedes its rename.
const TEMP = new RegExp(`^${UUID}\\.${UUID}\\.tmp$`);
const STATUS = new Set<unknown>(['pending', 'done', 'not-required']);

/** Physical spelling: realpath of the nearest existing ancestor plus the missing remainder. */
// @cpt-begin:cpt-frontx-algo-upgrade-changeset-mutation-boundary:p1:inst-mb-collect-records
function physicalPath(target: string): string {
  const absolute = path.resolve(target);
  const missing: string[] = [];
  let current = absolute;
  for (;;) {
    try {
      return path.join(fs.realpathSync.native(current), ...missing.reverse());
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      const parent = path.dirname(current);
      if (parent === current) throw error;
      missing.push(path.basename(current));
      current = parent;
    }
  }
}
// @cpt-end:cpt-frontx-algo-upgrade-changeset-mutation-boundary:p1:inst-mb-collect-records

/** Every existing component from `directory` up to (excluding) `root` must be a plain directory. */
// @cpt-begin:cpt-frontx-algo-upgrade-changeset-mutation-boundary:p1:inst-mb-collect-records
function assertPlainChain(directory: string, root: string): void {
  for (let current = directory; current !== root && current !== path.dirname(current); current = path.dirname(current)) {
    let stat: fs.Stats;
    try {
      stat = fs.lstatSync(current);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
      throw error;
    }
    if (!stat.isDirectory()) {
      throw new CoordinationError('RECOVERY_REQUIRED', `Coordination path is not a plain directory: ${current}`, { path: current });
    }
  }
}
// @cpt-end:cpt-frontx-algo-upgrade-changeset-mutation-boundary:p1:inst-mb-collect-records

/** Lists a coordination directory whose chain below `root` was proven plain; absent = empty. */
// @cpt-begin:cpt-frontx-algo-upgrade-changeset-mutation-boundary:p1:inst-mb-collect-records
function listRecords(directory: string, root: string): string[] {
  assertPlainChain(directory, root);
  try {
    return fs.readdirSync(directory).sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}
// @cpt-end:cpt-frontx-algo-upgrade-changeset-mutation-boundary:p1:inst-mb-collect-records

// @cpt-begin:cpt-frontx-algo-upgrade-changeset-mutation-boundary:p1:inst-mb-collect-records
function isPair(value: unknown): value is { origin: string; version: string } {
  const v = value as { origin?: unknown; version?: unknown } | null;
  return v !== null && typeof v === 'object' && typeof v.origin === 'string' && typeof v.version === 'string';
}
// @cpt-end:cpt-frontx-algo-upgrade-changeset-mutation-boundary:p1:inst-mb-collect-records

// @cpt-begin:cpt-frontx-algo-upgrade-changeset-mutation-boundary:p1:inst-mb-collect-records
function isTasks(value: unknown): value is { inventory: TaskStatus; ai: TaskStatus } {
  const v = value as { inventory?: unknown; ai?: unknown } | null;
  return v !== null && typeof v === 'object' && STATUS.has(v.inventory) && STATUS.has(v.ai);
}
// @cpt-end:cpt-frontx-algo-upgrade-changeset-mutation-boundary:p1:inst-mb-collect-records

// @cpt-begin:cpt-frontx-algo-upgrade-changeset-mutation-boundary:p1:inst-mb-collect-records
function isIntent(value: unknown): value is TransitionIntent {
  const v = value as Partial<TransitionIntent> | null;
  return (
    v !== null && typeof v === 'object' && (v.kind === 'upgrade' || v.kind === 'restore') &&
    typeof v.name === 'string' && isPair(v.from) && isPair(v.to) && typeof v.fromEntry === 'string' &&
    typeof v.planDigest === 'string' && typeof v.candidateHash === 'string' && isTasks(v.tasks) &&
    Array.isArray(v.footprint) &&
    v.footprint.every(
      (f) =>
        f !== null && typeof f === 'object' && typeof f.path === 'string' && (f.before === null || typeof f.before === 'string') &&
        (f.after === undefined || f.after === null || typeof f.after === 'string'),
    )
  );
}
// @cpt-end:cpt-frontx-algo-upgrade-changeset-mutation-boundary:p1:inst-mb-collect-records

// @cpt-begin:cpt-frontx-algo-upgrade-changeset-mutation-boundary:p1:inst-mb-collect-records
function parseReceipt(file: string): TransitionReceipt {
  const stat = fs.lstatSync(file);
  if (!stat.isFile()) throw new CoordinationError('RECOVERY_REQUIRED', `Unverifiable recovery record: ${file}. ${manualHint}`, { path: file });
  let value: unknown;
  try {
    value = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    throw new CoordinationError('RECOVERY_REQUIRED', `Malformed recovery record: ${file}. ${manualHint}`, { path: file });
  }
  const r = value as Partial<TransitionReceipt> | null;
  const completionOk =
    r?.completion === undefined ||
    (typeof r.completion === 'object' && r.completion !== null &&
      (r.completion.result === 'committed' || r.completion.result === 'cancelled') && typeof r.completion.entry === 'string');
  if (
    r === null || typeof r !== 'object' || r.schemaVersion !== 1 || typeof r.id !== 'string' ||
    `${r.id}.json` !== path.basename(file) || typeof r.projectRoot !== 'string' || typeof r.inventoryRoot !== 'string' ||
    !isIntent(r.intent) || (r.phase !== 'preparing' && r.phase !== 'prepared' && r.phase !== 'finalizing') ||
    !completionOk || (r.phase === 'finalizing') !== (r.completion !== undefined)
  ) {
    throw new CoordinationError('RECOVERY_REQUIRED', `Unknown or malformed recovery record: ${file}. ${manualHint}`, { path: file });
  }
  return r as TransitionReceipt;
}
// @cpt-end:cpt-frontx-algo-upgrade-changeset-mutation-boundary:p1:inst-mb-collect-records

/** temp + rename of a fresh regular file; never opens or follows an existing name. */
// @cpt-begin:cpt-frontx-algo-upgrade-changeset-mutation-boundary:p1:inst-mb-begin-transition
function writeRecord(directory: string, root: string, receipt: TransitionReceipt): string {
  assertPlainChain(directory, root);
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  assertPlainChain(directory, root);
  const target = path.join(directory, `${receipt.id}.json`);
  const temp = path.join(directory, `${receipt.id}.${randomUUID()}.tmp`);
  const fd = fs.openSync(temp, 'wx', 0o600);
  try {
    fs.writeFileSync(fd, JSON.stringify(receipt));
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(temp, target);
  return target;
}
// @cpt-end:cpt-frontx-algo-upgrade-changeset-mutation-boundary:p1:inst-mb-begin-transition

/** Unlinks one named regular record; refuses anything else. */
// @cpt-begin:cpt-frontx-algo-upgrade-changeset-mutation-boundary:p1:inst-mb-finalize
function unlinkRecord(file: string): void {
  let stat: fs.Stats;
  try {
    stat = fs.lstatSync(file);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw error;
  }
  if (!stat.isFile()) throw new CoordinationError('RECOVERY_REQUIRED', `Unverifiable recovery record: ${file}. ${manualHint}`, { path: file });
  fs.unlinkSync(file);
}
// @cpt-end:cpt-frontx-algo-upgrade-changeset-mutation-boundary:p1:inst-mb-finalize

// @cpt-begin:cpt-frontx-algo-upgrade-changeset-mutation-boundary:p1:inst-mb-return-blocked
const manualHint = 'Inspect the named record and reconcile the project and inventory before moving a stale record aside.';

export function recoverCommandHint(name: string): string {
  return /^[a-zA-Z0-9@_][a-zA-Z0-9@_./-]*$/.test(name)
    ? `Run "frontx upgrade ${name} --recover"`
    : `Run frontx upgrade with the recorded template name ${JSON.stringify(name)} as one argument and --recover`;
}

function missingReceiptHint(project: string, inventory: string, id: string): string {
  const receipt = path.join(project, '.frontx', 'operations', id + '.json');
  return `If receipt ${receipt} is missing, preserve the reservation. Restore the project ${project} and inventory ${inventory} together from a verified consistent backup at their original paths.`;
}

function recoverHint(receipt: TransitionReceipt): string {
  return `${recoverCommandHint(receipt.intent.name)} in ${receipt.projectRoot} using inventory ${receipt.inventoryRoot}.`;
}
// @cpt-end:cpt-frontx-algo-upgrade-changeset-mutation-boundary:p1:inst-mb-return-blocked

/**
 * Production boundary. `frontxDirectory` (default `~/.frontx`) holds the per-user
 * mutex; `inventoryRoot` is the root the real store/index were built with, and its
 * reservations live under it.
 */
export function createFsWithMutationScope(
  inventoryRoot: string,
  frontxDirectory: string = path.join(os.homedir(), '.frontx'),
  timeoutMs = 5_000,
): WithMutationScopeFn {
  return async (projectRootInput, mode, body) => {
    // @cpt-begin:cpt-frontx-algo-upgrade-changeset-mutation-boundary:p1:inst-mb-acquire
    let release: () => void;
    try {
      release = acquireNamespaceLockIn(frontxDirectory, timeoutMs);
    } catch (error) {
      // @cpt-begin:cpt-frontx-algo-upgrade-changeset-mutation-boundary:p1:inst-mb-if-busy
      // @cpt-begin:cpt-frontx-algo-upgrade-changeset-mutation-boundary:p1:inst-mb-return-busy
      if (error instanceof NamespaceLockBusyError) {
        throw new CoordinationError('RESOURCE_BUSY', `${error.message}; retry when it finishes.`);
      }
      // @cpt-end:cpt-frontx-algo-upgrade-changeset-mutation-boundary:p1:inst-mb-return-busy
      // @cpt-end:cpt-frontx-algo-upgrade-changeset-mutation-boundary:p1:inst-mb-if-busy
      const reason = error instanceof Error ? error.message : String(error);
      throw new CoordinationError('INTERNAL',
        `Could not acquire the namespace lock under ${frontxDirectory}: ${reason}. Check that the home exists and its lock directory is private and writable.`,
        { path: frontxDirectory });
    }
    // @cpt-end:cpt-frontx-algo-upgrade-changeset-mutation-boundary:p1:inst-mb-acquire
    try {
      const projectRoot = physicalPath(projectRootInput);
      const physicalInventory = physicalPath(inventoryRoot);
      const receiptsDir = path.join(projectRoot, '.frontx', 'operations');
      const reservationsDir = (root: string) => path.join(root, COORDINATION_DIRECTORY, 'reservations');
      const ownReservations = reservationsDir(physicalInventory);

      // @cpt-begin:cpt-frontx-algo-upgrade-changeset-mutation-boundary:p1:inst-mb-collect-records
      const blocking = new Map<string, string>();
      const pending: Transition[] = [];

      // The coordination directory under the inventory root holds nothing but `reservations`.
      for (const entry of listRecords(path.join(physicalInventory, COORDINATION_DIRECTORY), physicalInventory)) {
        if (entry !== 'reservations') blocking.set(path.join(physicalInventory, COORDINATION_DIRECTORY, entry), manualHint);
      }
      const reservationIds = new Set<string>();
      for (const entry of listRecords(ownReservations, physicalInventory)) {
        const file = path.join(ownReservations, entry);
        if (mode === 'recover' && TEMP.test(entry)) {
          unlinkRecord(file);
          continue;
        }
        if (!RECORD.test(entry)) {
          blocking.set(file, manualHint);
          continue;
        }
        const reservation = parseReceipt(file);
        // Only the project's own recovery may proceed past its own reservation.
        if (reservation.projectRoot !== projectRoot) {
          blocking.set(file, `Reservation belongs to ${reservation.projectRoot}. For a surviving receipt: ${recoverHint(reservation)} ${missingReceiptHint(reservation.projectRoot, reservation.inventoryRoot, reservation.id)}`);
        } else {
          reservationIds.add(reservation.id);
          if (mode === 'normal') blocking.set(file, recoverHint(reservation));
        }
      }
      // @cpt-end:cpt-frontx-algo-upgrade-changeset-mutation-boundary:p1:inst-mb-collect-records

      const handle =(receipt: TransitionReceipt, receiptPath: string): Transition => {
        let current = receipt;
        const reservationRoot = reservationsDir(receipt.inventoryRoot);
        const reservationPath = path.join(reservationRoot, `${receipt.id}.json`);
        const persist = (next: TransitionReceipt) => {
          writeRecord(receiptsDir, projectRoot, next);
          current = next;
        };
        return {
          get receipt() {
            return current;
          },
          receiptPath,
          // @cpt-begin:cpt-frontx-algo-upgrade-changeset-mutation-boundary:p1:inst-mb-finalize
          async finalize(result, entry, beforeRelease) {
            if (current.phase === 'finalizing') {
              if (current.completion?.result !== result || current.completion.entry !== entry) {
                throw new Error('Finalizing record disagrees with the observed terminal state.');
              }
            } else {
              if (result === 'committed' && current.phase !== 'prepared') {
                throw new Error('Only a prepared transition finalizes as committed.');
              }
              if (result === 'cancelled' && entry !== current.intent.fromEntry) {
                throw new Error('A transition is cancelled only while the entry is still the pre-transition one.');
              }
            }
            // Checked BEFORE anything is persisted or unlinked: the reservation must be
            // exactly the immutable record written at `preparing` (same id, roots,
            // intent and initial tasks). It may be absent only where the protocol
            // explains it: a `preparing` receipt whose reservation was never written,
            // or a release interrupted after the reservation's unlink (`finalizing`).
            const expected = canonicalJson({ ...current, phase: 'preparing', completion: undefined });
            let reservation: TransitionReceipt | undefined;
            try {
              reservation = parseReceipt(reservationPath);
            } catch (error) {
              if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
            }
            if (reservation === undefined ? current.phase === 'prepared' : canonicalJson(reservation) !== expected) {
              throw new CoordinationError(
                'RECOVERY_REQUIRED',
                reservation === undefined
                  ? `Reservation ${reservationPath} of a prepared transition is missing. Inspect receipt ${receiptPath} and restore the matching reservation from a verified backup before retrying finalization.`
                  : `Reservation ${reservationPath} does not match its receipt; inspect it by hand.`,
                { path: reservationPath },
              );
            }
            if (current.phase !== 'finalizing') persist({ ...current, phase: 'finalizing', completion: { result, entry } });
            if (beforeRelease !== undefined) await beforeRelease();
            unlinkRecord(reservationPath);
            unlinkRecord(receiptPath);
          },
          // @cpt-end:cpt-frontx-algo-upgrade-changeset-mutation-boundary:p1:inst-mb-finalize
        };
      };

      // @cpt-begin:cpt-frontx-algo-upgrade-changeset-mutation-boundary:p1:inst-mb-collect-records
      for (const entry of listRecords(receiptsDir, projectRoot)) {
        // In HOME the live SQLite mutex and its DELETE-mode journal share the receipt directory.
        if ((entry === NAMESPACE_LOCK_FILENAME || entry === `${NAMESPACE_LOCK_FILENAME}-journal`) &&
            path.relative(physicalPath(frontxDirectory), path.dirname(receiptsDir)) === '') continue;
        const file = path.join(receiptsDir, entry);
        if (mode === 'recover' && TEMP.test(entry)) {
          unlinkRecord(file);
          continue;
        }
        if (!RECORD.test(entry)) {
          blocking.set(file, manualHint);
          continue;
        }
        const receipt = parseReceipt(file);
        if (receipt.projectRoot !== projectRoot) {
          throw new CoordinationError('RECOVERY_REQUIRED', `Recovery record ${file} belongs to another project root (${receipt.projectRoot}).`, { path: file });
        }
        reservationIds.delete(receipt.id);
        if (mode === 'normal') blocking.set(file, recoverHint(receipt));
        else pending.push(handle(receipt, file));
      }
      // A reservation always has its receipt (receipt first, reservation unlinked first):
      // one without it is unexplained and stays until a person looks at it.
      for (const id of reservationIds) {
        blocking.set(path.join(ownReservations, `${id}.json`), missingReceiptHint(projectRoot, physicalInventory, id));
      }
      // @cpt-end:cpt-frontx-algo-upgrade-changeset-mutation-boundary:p1:inst-mb-collect-records

      // @cpt-begin:cpt-frontx-algo-upgrade-changeset-mutation-boundary:p1:inst-mb-if-blocked
      // @cpt-begin:cpt-frontx-algo-upgrade-changeset-mutation-boundary:p1:inst-mb-return-blocked
      if (blocking.size > 0) {
        throw new CoordinationError(
          'RECOVERY_REQUIRED',
          Array.from(blocking, ([file, hint]) => `${file}: ${hint}`).join('\n'),
          { records: [...blocking.keys()] },
        );
      }
      // @cpt-end:cpt-frontx-algo-upgrade-changeset-mutation-boundary:p1:inst-mb-return-blocked
      // @cpt-end:cpt-frontx-algo-upgrade-changeset-mutation-boundary:p1:inst-mb-if-blocked

      let begun = false;
      const scope: MutationScope = {
        projectRoot,
        inventoryRoot: physicalInventory,
        pending,
        // @cpt-begin:cpt-frontx-algo-upgrade-changeset-mutation-boundary:p1:inst-mb-begin-transition
        beginTransition(intent) {
          if (begun || pending.length > 0) throw new Error('Only one transition per mutation scope, and never over a pending one.');
          begun = true;
          const preparing: TransitionReceipt = {
            schemaVersion: 1,
            id: randomUUID(),
            projectRoot,
            inventoryRoot: physicalInventory,
            intent,
            phase: 'preparing',
          };
          // H2 ordering: project-discoverable `preparing` first, then the shared
          // reservation, then `prepared`; no effect may run before the last write.
          const receiptPath = writeRecord(receiptsDir, projectRoot, preparing);
          writeRecord(ownReservations, physicalInventory, preparing);
          const prepared: TransitionReceipt = { ...preparing, phase: 'prepared' };
          writeRecord(receiptsDir, projectRoot, prepared);
          return handle(prepared, receiptPath);
        },
        // @cpt-end:cpt-frontx-algo-upgrade-changeset-mutation-boundary:p1:inst-mb-begin-transition
      };
      return await body(scope);
    } finally {
      // @cpt-begin:cpt-frontx-algo-upgrade-changeset-mutation-boundary:p1:inst-mb-release-mutex
      release();
      // @cpt-end:cpt-frontx-algo-upgrade-changeset-mutation-boundary:p1:inst-mb-release-mutex
    }
  };
}

/** A slot name that would land in the inventory root's coordination directory. */
export function isReservedSlotName(name: string, inventoryRoot: string): boolean {
  const segment = name.split('/')[0]!;
  if (segment === COORDINATION_DIRECTORY) return true;
  if (segment.toLowerCase() !== COORDINATION_DIRECTORY) return false;
  // The inventory may be on a different volume than the cwd, and may not exist yet.
  let directory = path.resolve(inventoryRoot);
  while (!fs.existsSync(directory) && directory !== path.dirname(directory)) directory = path.dirname(directory);
  return probeVolumeCaseInsensitive(directory);
}
