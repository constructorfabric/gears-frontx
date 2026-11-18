// @cpt-flow:cpt-frontx-flow-ai-upgrade-orchestration-upgrade:p1
// @cpt-dod:cpt-frontx-dod-ai-upgrade-orchestration-single-engine:p1
// @cpt-dod:cpt-frontx-dod-ai-upgrade-orchestration-gate-enforced:p1
// Review the complete CLI plan, then bind explicit approval to its digest on the confirming call.
import { spawn as nodeSpawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import type { ChangeSet, CleanEntry, InvokeUpgradeCommandFn, ReviewDecision, ReviewablePlan, UpgradeCommandJsonResult } from './types.js';

/** Options this adapter passes to a spawned child process. */
export interface SpawnOptions {
  /** The command runs with this directory as its working directory — the
   * shipped `frontx upgrade` surface takes no `<projectRoot>` argument of
   * its own (it operates on its process's cwd), so this is how the target
   * project is selected. */
  cwd?: string;
}

/** Minimal shape this adapter needs from a spawned child process (DI seam for tests). */
export type SpawnFn = (command: string, args: string[], options?: SpawnOptions) => ChildProcessWithoutNullStreams;

export interface InvokeUpgradeCommandOptions {
  /**
   * Resolves the `frontx` executable to invoke; defaults to `'frontx'`,
   * resolved via the invoking process's `PATH` — never a hardcoded absolute
   * path, per the command-surface-only boundary.
   */
  frontxBin?: string;
  /** Maximum elapsed time per invocation. Defaults to two minutes. */
  timeoutMs?: number;
  /** Injectable process spawn, defaulting to `node:child_process`'s `spawn`. */
  spawnFn?: SpawnFn;
}

// The shared `{ok:true, data}` / `{ok:false, error:{code, message,
// details}}` discriminated envelope every `--json` invocation emits
// (`cpt-frontx-adr-cli-machine-readable-output`), parsed locally rather than
// imported — this module names no CLI package type, exactly like every
// other shape in `./types.ts`.
interface CliEnvelopeError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}
type CliEnvelope = { ok: true; data: unknown } | { ok: false; error: CliEnvelopeError };

function parseCliEnvelope(raw: string): CliEnvelope | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (!isRecord(parsed) || typeof parsed.ok !== 'boolean') return undefined;
  if (parsed.ok) {
    return { ok: true, data: parsed.data };
  }
  const error = parsed.error;
  if (!isRecord(error) || typeof error.code !== 'string' || typeof error.message !== 'string') return undefined;
  return {
    ok: false,
    error: {
      code: error.code,
      message: error.message,
      details: isRecord(error.details) ? error.details : undefined,
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringFields(value: unknown, ...fields: string[]): boolean {
  return isRecord(value) && fields.every(key => typeof value[key] === 'string');
}

function strings(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(entry => typeof entry === 'string');
}

function isSha256(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
}

function reviewableFiles(value: unknown): boolean {
  return Array.isArray(value) && value.every(file => isRecord(file) && typeof file.path === 'string' && isSha256(file.sha256) &&
    typeof file.length === 'number' && Number.isSafeInteger(file.length) && file.length >= 0 && (file.linkTarget === undefined || typeof file.linkTarget === 'string'));
}

function isReviewablePlan(plan: unknown): plan is ReviewablePlan {
  if (!isRecord(plan) || typeof plan.name !== 'string' || !stringFields(plan.from, 'origin', 'version') ||
      !stringFields(plan.to, 'origin', 'version') || !strings(plan.targets)) return false;
  const { operations, skipped, retainedGround, ai } = plan;
  return Array.isArray(operations) && operations.every(op => stringFields(op, 'target', 'path') &&
      ['ADD', 'REPLACE', 'REMOVE', 'UNCHANGED', 'KEEP_LOCAL'].includes(op.op)) &&
    Array.isArray(skipped) && skipped.every(entry => stringFields(entry, 'target', 'path', 'reason')) &&
    (retainedGround === undefined || (Array.isArray(retainedGround) && retainedGround.every(entry => stringFields(entry, 'template', 'ground')))) &&
    (ai === undefined || (isRecord(ai) && typeof ai.destination === 'string' && Array.isArray(ai.changes) &&
      ai.changes.every(entry => stringFields(entry, 'path', 'kind')) && reviewableFiles(ai.files) && reviewableFiles(ai.existing)));
}

function mapConfirmationDetailsToChangeSet(details: Record<string, unknown> | undefined, name: string): ChangeSet | undefined {
  if (!details || details.name !== name || !isReviewablePlan(details.plan) || details.plan.name !== name ||
      (details.notes !== undefined && !strings(details.notes))) return undefined;
  const plan = details.plan;
  const clean: CleanEntry[] = [];
  for (const { op, path } of plan.operations) {
    if (op === 'ADD') clean.push({ kind: 'add', path });
    if (op === 'REPLACE') clean.push({ kind: 'modify', path });
    if (op === 'REMOVE') clean.push({ kind: 'remove', path });
  }
  return {
    templateIdentity: name,
    baselineVersion: plan.from.version,
    targetVersion: plan.to.version,
    clean,
    conflicts: [],
    plan,
    notes: details.notes ?? [],
  };
}

/**
 * Factory returning a concrete `InvokeUpgradeCommandFn` bound to the built
 * `frontx upgrade` command surface. Exported from `src/index.ts`
 * (cpt-frontx-dod-ai-upgrade-orchestration-single-engine).
 */
export function createInvokeUpgradeCommand(options: InvokeUpgradeCommandOptions = {}): InvokeUpgradeCommandFn {
  const frontxBin = options.frontxBin ?? 'frontx';
  const spawnFn: SpawnFn = options.spawnFn ?? ((command, args, spawnOptions) => {
    if (process.platform === 'win32' && !options.frontxBin) {
      // npm puts local shims in node_modules/.bin and global shims next to node_modules.
      const binDir = process.env.PATH?.split(';').find(dir => dir && existsSync(join(dir, 'frontx.cmd')));
      if (!binDir) throw new Error('Cannot locate the npm frontx.cmd shim on PATH');
      const modules = basename(binDir) === '.bin' ? dirname(binDir) : join(binDir, 'node_modules');
      const pkg = join(modules, '@gears-frontx', 'cli');
      const manifest = JSON.parse(readFileSync(join(pkg, 'package.json'), 'utf8'));
      return nodeSpawn(process.execPath, [join(pkg, manifest.bin.frontx), ...args], spawnOptions);
    }
    return nodeSpawn(command, args, spawnOptions);
  });

  // Runs ONE `frontx upgrade ... --json[, --yes]` invocation to completion
  // and parses its single stdout JSON envelope
  // (cpt-frontx-adr-cli-machine-readable-output: "exactly one JSON value on
  // stdout"). Never writes to `child.stdin` — the real command surface
  // never reads it in `--json` mode.
  function runUpgradeInvocation(projectRoot: string, args: string[]): Promise<CliEnvelope> {
    return new Promise<CliEnvelope>((resolve, reject) => {
      // @cpt-begin:cpt-frontx-dod-ai-upgrade-orchestration-single-engine:p1:inst-spawn-command-surface
      // `upgrade <templateName> <new-origin> --json[, --yes]` — the selected
      // template's name and the target version's resolved origin, passed
      // directly (§1.1); `projectRoot` selects the target project through
      // the child process's working directory, since the command surface
      // itself takes no project-root argument.
      const child = spawnFn(frontxBin, args, { cwd: projectRoot });
      // @cpt-end:cpt-frontx-dod-ai-upgrade-orchestration-single-engine:p1:inst-spawn-command-surface

      let stdout = '';
      let stderr = '';
      let captured = 0;
      let settled = false;
      const stop = (message: string) => {
        settled = true;
        clearTimeout(timer);
        child.kill('SIGKILL');
        reject(new Error(message));
      };
      const timer = setTimeout(() => stop('frontx upgrade timed out'), options.timeoutMs ?? 120_000);
      timer.unref();
      for (const stream of [child.stdout, child.stderr]) {
        stream.setEncoding('utf8');
        stream.on('data', (chunk: string) => {
          if (settled) return;
          captured += Buffer.byteLength(chunk);
          if (captured > 16 * 1024 * 1024) return stop('frontx upgrade exceeded the 16 MiB output limit');
          if (stream === child.stdout) stdout += chunk;
          else stderr += chunk;
        });
      }

      child.on('error', (error: Error) => {
        if (settled) return;
        clearTimeout(timer);
        settled = true;
        reject(new Error(`Failed to spawn the "frontx upgrade" command surface (bin: "${frontxBin}"): ${error.message}`));
      });

      child.on('close', (code, signal) => {
        if (settled) return;
        clearTimeout(timer);
        settled = true;

        // @cpt-begin:cpt-frontx-dod-ai-upgrade-orchestration-single-engine:p1:inst-parse-json-result
        const trimmed = stdout.trim();
        const envelope = trimmed ? parseCliEnvelope(trimmed) : undefined;
        if (!envelope) {
          reject(
            new Error(
              `"${frontxBin} ${args.join(' ')}" did not emit a parseable JSON envelope on stdout. ` +
                `exit ${code}, signal ${signal}, stdout: ${JSON.stringify(stdout.slice(0, 1024))}; stderr: ${JSON.stringify(stderr.slice(0, 4096))}`,
            ),
          );
          return;
        }
        if (signal || typeof code !== 'number' || envelope.ok !== (code === 0)) {
          reject(new Error(`frontx upgrade envelope disagrees with exit ${code}, signal ${signal}`));
          return;
        }
        resolve(envelope);
        // @cpt-end:cpt-frontx-dod-ai-upgrade-orchestration-single-engine:p1:inst-parse-json-result
      });
    });
  }

  return async function invokeUpgradeCommand(
    projectRoot: string,
    templateName: string,
    targetOrigin: string,
    onChangeSet: (changeSet: ChangeSet) => Promise<ReviewDecision>,
  ): Promise<UpgradeCommandJsonResult> {
    if (templateName.startsWith('-') || targetOrigin.startsWith('-')) throw new Error('Invalid flag-like upgrade positional argument');
    const baseArgs = ['upgrade', templateName, targetOrigin, '--json'];

    const first = await runUpgradeInvocation(projectRoot, baseArgs);

    if (first.ok) {
      if (isRecord(first.data) && first.data.outcome === 'noop') {
        const at = first.data.at;
        if (!isRecord(at) || typeof at.origin !== 'string' || typeof at.version !== 'string' || !at.version) {
          throw new Error('Invalid noop result: expected at.origin and at.version');
        }
        return { ok: true, status: 'noop', targetVersion: at.version };
      }
      throw new Error('Unexpected success outcome from unconfirmed frontx upgrade');
    }

    if (first.error.code !== 'CONFIRMATION_REQUIRED') {
      // A real refusal unrelated to confirmation (e.g. `CONTENT_CONFLICT`,
      // `TARGET_CONFLICT`, `PROJECT_INVALID`) — surfaced with its own code
      // and message, never reported as unparseable.
      return { ok: false, status: 'resolution-failed', code: first.error.code, message: first.error.message };
    }

    // @cpt-begin:cpt-frontx-dod-ai-upgrade-orchestration-gate-enforced:p1:inst-relay-changeset
    const changeSet = mapConfirmationDetailsToChangeSet(first.error.details, templateName);
    if (!changeSet) {
      throw new Error(
        `"CONFIRMATION_REQUIRED"'s details did not carry the expected {name, plan:{name, from, to, operations}} shape: ${JSON.stringify(first.error.details)}`,
      );
    }
    // The review is bound to the plan the engine computed for it: the engine
    // names that plan's identity (`details.planDigest`, a hash of every
    // operation's bytes, not the displayed list), and the confirming call
    // below must state it. Without it nothing proves the second call applies
    // what was reviewed, so its absence is a protocol violation, never a
    // reason to confirm unbound.
    const planDigest = isRecord(first.error.details) ? first.error.details.planDigest : undefined;
    if (!isSha256(planDigest)) {
      throw new Error(
        `"CONFIRMATION_REQUIRED"'s details carried an invalid planDigest, so an approval cannot be bound to the reviewed plan: ${JSON.stringify(first.error.details)}`,
      );
    }
    let decision: ReviewDecision;
    // @cpt-begin:cpt-frontx-flow-ai-upgrade-orchestration-upgrade:p1:inst-check-review-failure
    try {
      decision = await onChangeSet(changeSet);
    } catch (error: unknown) {
      // @cpt-begin:cpt-frontx-flow-ai-upgrade-orchestration-upgrade:p1:inst-decline-on-review-failure
      // A failed review (a rejection or a synchronous throw) is a decline
      // with an error attached: no confirming call is issued, and the first
      // call already guaranteed nothing was written.
      // @cpt-end:cpt-frontx-flow-ai-upgrade-orchestration-upgrade:p1:inst-decline-on-review-failure
      // @cpt-begin:cpt-frontx-flow-ai-upgrade-orchestration-upgrade:p1:inst-return-review-failure
      throw error instanceof Error ? error : new Error(`The change-set review failed: ${String(error)}`);
      // @cpt-end:cpt-frontx-flow-ai-upgrade-orchestration-upgrade:p1:inst-return-review-failure
    }
    // @cpt-end:cpt-frontx-flow-ai-upgrade-orchestration-upgrade:p1:inst-check-review-failure
    // @cpt-end:cpt-frontx-dod-ai-upgrade-orchestration-gate-enforced:p1:inst-relay-changeset

    // @cpt-begin:cpt-frontx-dod-ai-upgrade-orchestration-gate-enforced:p1:inst-gate-decision
    if (decision === 'declined') {
      // Nothing is invoked again — the first call already guaranteed
      // nothing was written.
      return { ok: true, status: 'declined' };
    }

    if (decision !== 'approved') throw new Error('Review did not return an explicit approval or decline');
    let second: CliEnvelope;
    try {
      second = await runUpgradeInvocation(projectRoot, [...baseArgs, '--yes', `--plan-digest=${planDigest}`]);
    } catch (error) {
      return unknownConfirmation(templateName, error);
    }
    // @cpt-end:cpt-frontx-dod-ai-upgrade-orchestration-gate-enforced:p1:inst-gate-decision

    if (second.ok) {
      const data = second.data;
      if (isRecord(data) && data.outcome === 'success' && isReviewablePlan(data.plan) && data.plan.name === templateName) {
        return { ok: true, status: 'applied', targetVersion: data.plan.to.version };
      }
      if (isRecord(data) && data.outcome === 'noop') {
        return {
          ok: false,
          status: 'apply-failed',
          code: 'CONFIRMATION_REQUIRED',
          message: 'The plan changed after it was reviewed (the project is already at the candidate); the approved upgrade was not applied.',
        };
      }
      return unknownConfirmation(templateName, 'Unexpected confirmation outcome');
    }
    if (second.error.code === 'CONFIRMATION_REQUIRED') {
      // The confirming call computed a different plan than the one reviewed
      // (the project or the candidate changed in between): nothing was
      // written, and the approval is NOT carried over to the new plan.
      return {
        ok: false,
        status: 'apply-failed',
        code: second.error.code,
        message: `The plan changed after it was reviewed; nothing was applied. ${second.error.message}`,
      };
    }
    return {
      ok: false,
      status: 'apply-failed',
      code: second.error.code,
      message: second.error.message,
      ...(typeof second.error.details?.transitionCommitted === 'boolean' && { transitionCommitted: second.error.details.transitionCommitted }),
    };
  };
}

export function unknownConfirmation(name: string, error: unknown): UpgradeCommandJsonResult {
  return { ok: false, status: 'apply-failed', code: 'OUTCOME_UNKNOWN',
    message: `Upgrade outcome unknown: ${String(error)}. Check project state and run frontx upgrade ${JSON.stringify(name)} --recover.` };
}
