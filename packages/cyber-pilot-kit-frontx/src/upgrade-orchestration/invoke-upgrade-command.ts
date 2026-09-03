// @cpt-dod:cpt-frontx-dod-ai-upgrade-orchestration-single-engine:p1
// @cpt-dod:cpt-frontx-dod-ai-upgrade-orchestration-gate-enforced:p1
//
// Concrete `InvokeUpgradeCommandFn` — drives the SINGLE F14 change-set engine
// STRICTLY through the built `frontx upgrade` command/invocation surface
// (`frontx upgrade <templateName> <new-origin> --json`, run with the target
// project as its working directory), never by importing
// `@gears-frontx/cli` (DESIGN §3.4; cpt-frontx-dod-ai-upgrade-orchestration-single-engine).
// The coupling is process/command boundary only: this module contains no
// `import` from the CLI package anywhere.
//
// `templateName` travels as the command's required first positional
// argument (issue #508, FEATURE §1.1 `inst-invoke-engine`): the shipped
// command surface reads its own baseline from that same name, so this
// adapter and the engine can never disagree about which template is being
// upgraded.
//
// Protocol (mirrors `packages/cli/src/cli.ts`'s `--json` handshake):
//   1. The spawned process writes ONE JSON line `{ "changeSet": ChangeSet }`
//      to stdout before the engine's apply step.
//   2. This adapter relays that raw change set to the injected `onChangeSet`
//      review callback and writes the developer's decision
//      ("approved"/"declined") back to the process's stdin, gating the
//      engine's apply step on that decision (cpt-frontx-dod-ai-upgrade-orchestration-gate-enforced).
//   3. The process writes a FINAL JSON line `{ ok, status, message? }` (to
//      stdout on success/decline, to stderr on failure) which this adapter
//      parses into the kit-local `UpgradeCommandJsonResult`.
import { spawn as nodeSpawn } from 'node:child_process';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import type { ChangeSet, InvokeUpgradeCommandFn, ReviewDecision, UpgradeCommandJsonResult } from './types.js';

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
  /** Injectable process spawn, defaulting to `node:child_process`'s `spawn`. */
  spawnFn?: SpawnFn;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseChangeSetLine(parsed: unknown): ChangeSet | undefined {
  if (isRecord(parsed) && isRecord(parsed.changeSet)) return parsed.changeSet as unknown as ChangeSet;
  return undefined;
}

function parseResultLine(parsed: unknown): UpgradeCommandJsonResult | undefined {
  if (isRecord(parsed) && typeof parsed.ok === 'boolean' && typeof parsed.status === 'string') {
    return parsed as unknown as UpgradeCommandJsonResult;
  }
  return undefined;
}

/**
 * Factory returning a concrete `InvokeUpgradeCommandFn` bound to the built
 * `frontx upgrade` command surface. Exported from `src/index.ts`
 * (cpt-frontx-dod-ai-upgrade-orchestration-single-engine).
 */
export function createInvokeUpgradeCommand(options: InvokeUpgradeCommandOptions = {}): InvokeUpgradeCommandFn {
  const frontxBin = options.frontxBin ?? 'frontx';
  const spawnFn: SpawnFn = options.spawnFn ?? ((command, args, spawnOptions) => nodeSpawn(command, args, spawnOptions));

  return function invokeUpgradeCommand(
    projectRoot: string,
    templateName: string,
    targetOrigin: string,
    onChangeSet: (changeSet: ChangeSet) => Promise<ReviewDecision>,
  ): Promise<UpgradeCommandJsonResult> {
    return new Promise<UpgradeCommandJsonResult>((resolve, reject) => {
      // @cpt-begin:cpt-frontx-dod-ai-upgrade-orchestration-single-engine:p1:inst-spawn-command-surface
      // `upgrade <templateName> <new-origin>` — the selected template's name
      // and the target version's resolved origin, passed directly (§1.1);
      // `projectRoot` selects the target project through the child
      // process's working directory, since the command surface itself takes
      // no project-root argument.
      const child = spawnFn(frontxBin, ['upgrade', templateName, targetOrigin, '--json'], { cwd: projectRoot });
      // @cpt-end:cpt-frontx-dod-ai-upgrade-orchestration-single-engine:p1:inst-spawn-command-surface

      let stdoutBuffer = '';
      let stderrBuffer = '';
      let changeSetHandled = false;
      let settled = false;

      const settle = (result: UpgradeCommandJsonResult): void => {
        if (settled) return;
        settled = true;
        resolve(result);
      };

      const fail = (error: Error): void => {
        if (settled) return;
        settled = true;
        reject(error);
      };

      const handleLine = (line: string): void => {
        const trimmed = line.trim();
        if (!trimmed) return;

        let parsed: unknown;
        try {
          parsed = JSON.parse(trimmed);
        } catch {
          // Non-JSON output on the command surface's streams (e.g. stray log
          // lines) is ignored; only recognized JSON lines drive the handshake.
          return;
        }

        // @cpt-begin:cpt-frontx-dod-ai-upgrade-orchestration-gate-enforced:p1:inst-relay-changeset
        if (!changeSetHandled) {
          const changeSet = parseChangeSetLine(parsed);
          if (changeSet) {
            changeSetHandled = true;
            void onChangeSet(changeSet).then((decision: ReviewDecision) => {
              // @cpt-end:cpt-frontx-dod-ai-upgrade-orchestration-gate-enforced:p1:inst-relay-changeset
              // @cpt-begin:cpt-frontx-dod-ai-upgrade-orchestration-gate-enforced:p1:inst-gate-decision
              // The engine's apply step is gated on this decision: it is
              // relayed to the command surface's process boundary and the
              // engine only applies when the process observes "approved".
              child.stdin.write(`${decision}\n`);
              // @cpt-end:cpt-frontx-dod-ai-upgrade-orchestration-gate-enforced:p1:inst-gate-decision
            });
            return;
          }
        }

        // @cpt-begin:cpt-frontx-dod-ai-upgrade-orchestration-single-engine:p1:inst-parse-json-result
        const result = parseResultLine(parsed);
        if (result) settle(result);
        // @cpt-end:cpt-frontx-dod-ai-upgrade-orchestration-single-engine:p1:inst-parse-json-result
      };

      const drainLines = (buffer: string, onLine: (line: string) => void): string => {
        let rest = buffer;
        let newlineIndex = rest.indexOf('\n');
        while (newlineIndex !== -1) {
          onLine(rest.slice(0, newlineIndex));
          rest = rest.slice(newlineIndex + 1);
          newlineIndex = rest.indexOf('\n');
        }
        return rest;
      };

      child.stdout.on('data', (chunk: Buffer) => {
        stdoutBuffer += chunk.toString('utf-8');
        stdoutBuffer = drainLines(stdoutBuffer, handleLine);
      });

      child.stderr.on('data', (chunk: Buffer) => {
        stderrBuffer += chunk.toString('utf-8');
        stderrBuffer = drainLines(stderrBuffer, handleLine);
      });

      child.on('error', (error: Error) => {
        fail(new Error(`Failed to spawn the "frontx upgrade" command surface (bin: "${frontxBin}"): ${error.message}`));
      });

      child.on('close', (code: number | null) => {
        if (settled) return;
        // The process exited without ever emitting a parseable
        // `{ ok, status }` result line — fail explicitly rather than
        // silently resolving with a guessed outcome.
        fail(
          new Error(
            `"${frontxBin} upgrade --json" exited (code ${code ?? 'null'}) without a parseable JSON result. ` +
              `stdout: ${JSON.stringify(stdoutBuffer)}; stderr: ${JSON.stringify(stderrBuffer)}`,
          ),
        );
      });
    });
  };
}
