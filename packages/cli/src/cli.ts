#!/usr/bin/env node
// @cpt-flow:cpt-frontx-flow-cli-invocation-run-command:p1
// @cpt-flow:cpt-frontx-flow-cli-invocation-help:p1
// @cpt-algo:cpt-frontx-algo-cli-invocation-parse-dispatch:p1
// @cpt-state:cpt-frontx-state-cli-invocation-run:p1
// @cpt-dod:cpt-frontx-dod-cli-invocation-executable-entrypoint:p1
// @cpt-dod:cpt-frontx-dod-cli-invocation-usage-help:p1
// @cpt-dod:cpt-frontx-dod-cli-invocation-exit-codes:p1
//
// The `frontx` executable entrypoint (F18, `cpt-frontx-feature-cli-invocation`).
// Parses the process invocation, dispatches `frontx <command> [args]` to the
// ONE internal component that owns that command's behavior — referenced by
// canonical flow ID, never redefined here — and maps every outcome to the
// success / user-error / internal-error exit-code state machine
// (`cpt-frontx-state-cli-invocation-run`). This is the ONLY dispatch path;
// it invokes the already-implemented command behaviors through the concrete
// I/O adapters delivered in Phases 9-10 (plus the generic fs project-io glue
// in `adapters/fs-project-io.ts`) rather than reimplementing any I/O.
import readline from 'node:readline/promises';
import process from 'node:process';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { installCommand } from './commands/install';
import type { InstallCommandResult } from './commands/install';
import { listCommand } from './commands/list';
import { updateLocalCommand } from './commands/update-local';
import { validateCommand } from './commands/validate';
import { seedRepository } from './commands/seed-repository';
import { addTemplate } from './commands/add-template';
import { upgradeCommand } from './commands/upgrade';

import { TemplateInventory } from './inventory/TemplateInventory';
import type { InventoryEntry } from './inventory/types';
import type { FetchFn } from './resolver/types';
import type { ReadContentItemsFn, WriteFileFn } from './scaffold/types';
import type { BoundaryConflictEntry } from './scaffold/state';
import type { ListContentOwnedFilesFn, ReadFileFn } from './manifest/types';
import type { ProvenanceWriteFn } from './provenance/types';
import type { ReadProvenanceRecordsFn } from './scaffold/materialize';
import type {
  ReadProjectFileFn,
  WriteProjectFileFn,
  RemoveProjectFileFn,
  PresentAndGetApprovalFn,
  ChangeSet,
  ReadProvenanceFn,
} from './upgrade/types';

import { FsInventoryIndex } from './adapters/fs-inventory-index';
import { FsContentStore } from './adapters/fs-content-store';
import { createFsReadContentItemsFn } from './adapters/fs-read-content-items';
import { createGithubFetchFn, resolveInventoryRoot } from './adapters/github-fetch';
import { createLocalFetchFn } from './adapters/local-fetch';
import {
  createFsProvenanceWriteFn,
  readProvenanceRecords,
  createFsReadSingleProvenanceFn,
} from './adapters/provenance-io';
import {
  createFsWriteFileFn,
  createFsReadFileFn,
  createFsListContentOwnedFilesFn,
  createFsReadProjectFileFn,
  createFsWriteProjectFileFn,
  createFsRemoveProjectFileFn,
} from './adapters/fs-project-io';

// --- exit-code state machine (cpt-frontx-state-cli-invocation-run) ---

export const EXIT_SUCCESS = 0;
export const EXIT_USER_ERROR = 1;
export const EXIT_INTERNAL_ERROR = 2;

export type ExitCode = typeof EXIT_SUCCESS | typeof EXIT_USER_ERROR | typeof EXIT_INTERNAL_ERROR;

export interface CommandOutcome {
  exitCode: ExitCode;
  stdout?: string;
  stderr?: string;
}

// --- argv parse (cpt-frontx-algo-cli-invocation-parse-dispatch) ---

const KNOWN_COMMANDS = ['install', 'list', 'update-local', 'validate', 'seed', 'add', 'upgrade'] as const;
export type KnownCommand = (typeof KNOWN_COMMANDS)[number];

const HELP_TOKENS = new Set(['help', '-h', '--help']);

export interface ParsedInvocation {
  command: string | undefined;
  args: string[];
  helpRequested: boolean;
  unrecognized: boolean;
}

/**
 * cpt-frontx-algo-cli-invocation-parse-dispatch — parses the process
 * invocation into a leading command token and its remaining arguments.
 */
export function parseInvocation(argv: string[]): ParsedInvocation {
  // @cpt-begin:cpt-frontx-algo-cli-invocation-parse-dispatch:p1:inst-pd-receive
  const [command, ...args] = argv;
  // @cpt-end:cpt-frontx-algo-cli-invocation-parse-dispatch:p1:inst-pd-receive

  // @cpt-begin:cpt-frontx-algo-cli-invocation-parse-dispatch:p1:inst-pd-parse
  // command + args are already split above; nothing further to parse.
  // @cpt-end:cpt-frontx-algo-cli-invocation-parse-dispatch:p1:inst-pd-parse

  // @cpt-begin:cpt-frontx-algo-cli-invocation-parse-dispatch:p1:inst-pd-if-help
  const helpRequested = command === undefined || HELP_TOKENS.has(command);
  // @cpt-end:cpt-frontx-algo-cli-invocation-parse-dispatch:p1:inst-pd-if-help

  // @cpt-begin:cpt-frontx-algo-cli-invocation-parse-dispatch:p1:inst-pd-if-unknown
  const unrecognized = !helpRequested && !KNOWN_COMMANDS.includes(command as KnownCommand);
  // @cpt-end:cpt-frontx-algo-cli-invocation-parse-dispatch:p1:inst-pd-if-unknown

  return { command, args, helpRequested, unrecognized };
}

// --- usage/help (cpt-frontx-flow-cli-invocation-help) ---

export function usageText(): string {
  return [
    'Usage: frontx <command> [args]',
    '',
    'Commands:',
    '  install <spec>                        Install a template from a source-spec',
    '  list                                   List installed templates',
    '  update-local <identity> <spec>          Update a locally installed template',
    '  validate <templateDir>                  Validate a template manifest for publication',
    '  seed <templateRef> <targetDir>          Seed a new repository from a template',
    '  add <templateRef> <targetDir>            Add a template into an existing repository',
    '  upgrade <projectRoot> <targetVersion> [--yes] [--json]  Upgrade an applied template',
    '  help                                    Show this usage summary',
    '',
    'A source-spec is host:owner/repo[//subtree]@ref — the optional //subtree',
    'addresses a template that occupies a subdirectory of a repository.',
    'A template is identified by the name its own manifest declares, which is what',
    'list reports and what seed, add and update-local expect.',
    '',
  ].join('\n');
}

// --- adapter wiring (Phases 9-10 concrete I/O adapters + fs-project-io glue) ---

export interface CliDeps {
  inventory: TemplateInventory;
  fetchFn: FetchFn;
  readContentFn: ReadContentItemsFn;
  writeFileFn: WriteFileFn;
  readFileFn: ReadFileFn;
  listContentOwnedFilesFn: ListContentOwnedFilesFn;
  provenanceWriteFn: ProvenanceWriteFn;
  readProvenanceRecordsFn: ReadProvenanceRecordsFn;
  readSingleProvenanceFn: ReadProvenanceFn;
  readProjectFile: ReadProjectFileFn;
  writeProjectFile: WriteProjectFileFn;
  removeProjectFile: RemoveProjectFileFn;
  presentAndGetApproval: PresentAndGetApprovalFn;
}

/** Assembles the real, fs/network-backed dependency set for the `frontx` executable. */
export function createRealDeps(): CliDeps {
  const inventoryRoot = resolveInventoryRoot();
  const inventory = new TemplateInventory(new FsInventoryIndex(inventoryRoot), new FsContentStore(inventoryRoot));
  return {
    inventory,
    // TEST-ONLY offline hook: when `FRONTX_TEST_LOCAL_SOURCE_DIR` is set,
    // `install`/`update-local`/`upgrade` resolve against that local directory
    // instead of the network, via the SAME `FetchFn` seam. Unset, this is
    // byte-for-byte the production GitHub-fetch path. Not product behavior.
    fetchFn: process.env.FRONTX_TEST_LOCAL_SOURCE_DIR
      ? createLocalFetchFn(process.env.FRONTX_TEST_LOCAL_SOURCE_DIR)
      : createGithubFetchFn({ token: process.env.GITHUB_TOKEN }),
    readContentFn: createFsReadContentItemsFn(inventoryRoot),
    writeFileFn: createFsWriteFileFn(),
    readFileFn: createFsReadFileFn(),
    listContentOwnedFilesFn: createFsListContentOwnedFilesFn(),
    provenanceWriteFn: createFsProvenanceWriteFn(),
    readProvenanceRecordsFn: readProvenanceRecords,
    readSingleProvenanceFn: createFsReadSingleProvenanceFn(),
    readProjectFile: createFsReadProjectFileFn(),
    writeProjectFile: createFsWriteProjectFileFn(),
    removeProjectFile: createFsRemoveProjectFileFn(),
    presentAndGetApproval: createInteractiveApproval(),
  };
}

/** Prints the reviewable change set and prompts on stdin for approval. */
function createInteractiveApproval(): PresentAndGetApprovalFn {
  return async function presentAndGetApproval(changeSet: ChangeSet): Promise<'approved' | 'declined'> {
    process.stdout.write(`${JSON.stringify(changeSet, null, 2)}\n`);
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    try {
      const answer = await rl.question('Apply this change set? [y/N] ');
      return answer.trim().toLowerCase() === 'y' ? 'approved' : 'declined';
    } finally {
      rl.close();
    }
  };
}

// --- `--json` command-surface handshake (cpt-frontx-dod-ai-upgrade-orchestration-single-engine) ---
//
// The AI Tooling Framework's kit (`@gears-frontx/cyber-pilot-kit-frontx`)
// coordinates with this CLI over the `frontx upgrade --json` COMMAND SURFACE
// only (DESIGN §3.4) — it never imports this package. This handshake is the
// minimal machine-readable protocol that command-surface coupling requires:
// one JSON line carrying the raw change set BEFORE approval, one decision
// line read back from stdin, and one final JSON line carrying the
// `{ ok, status, message? }` result.

/** Writes the raw change set as ONE JSON line to stdout and reads ONE decision line from stdin. */
function createJsonApproval(): PresentAndGetApprovalFn {
  return async function presentAndGetApprovalJson(changeSet: ChangeSet): Promise<'approved' | 'declined'> {
    process.stdout.write(`${JSON.stringify({ changeSet })}\n`);
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: false });
    try {
      const answer = await rl.question('');
      return answer.trim().toLowerCase() === 'approved' ? 'approved' : 'declined';
    } finally {
      rl.close();
    }
  };
}

// --- dispatch (cpt-frontx-flow-cli-invocation-run-command) ---

/**
 * ADR-0032 requires the pre-flight conflict report to name "each contested
 * ground and its contesting templates" (`scaffold/conflict.ts` — the SOLE
 * authority that produces `BoundaryConflictEntry[]`). `seed`/`add` already
 * carry that detail on their `conflict` outcome, but until now this CLI
 * layer dropped it on the floor and printed only the generic abort message
 * — the refusal never actually named ground or contestants. One line per
 * conflict, appended to stderr below the generic message.
 */
function formatConflictDetails(conflicts: BoundaryConflictEntry[]): string {
  return conflicts
    .map((c) => `  ground "${c.ground}" contested by: ${c.contestants.join(', ')}`)
    .join('\n');
}

// review #500 (fix 3/3): reads the SAME provenance SET
// `createFsReadSingleProvenanceFn` bridges down to one record, so this
// diagnostic can be produced HERE — where every other `upgrade` message is
// decided — without the single-record bridge itself deciding to print
// anything. `undefined` when there is nothing to report (zero or one
// record): callers append this into an existing message only when present.
async function formatMultiRecordUpgradeNotice(
  projectRoot: string,
  readProvenanceRecordsFn: ReadProvenanceRecordsFn,
): Promise<string | undefined> {
  const records = await readProvenanceRecordsFn(projectRoot);
  if (records.length <= 1) return undefined;
  const [selected, ...rest] = records;
  const others = rest.map((record) => record.templateIdentity).join(', ');
  return (
    `[frontx] Multiple provenance records found; this repository has more than one applied ` +
    `template. Upgrade targets the first-applied one ("${selected.templateIdentity}") — ` +
    `per-template target selection is not yet supported, so the other applied template(s) ` +
    `(${others}) cannot be selected for this upgrade.`
  );
}

function joinNoticeAndMessage(notice: string | undefined, message: string | undefined): string | undefined {
  return notice && message ? `${notice}\n${message}` : (notice ?? message);
}

function formatInstallResult(result: InstallCommandResult): CommandOutcome {
  if (!result.ok) return { exitCode: EXIT_USER_ERROR, stderr: result.message };
  const discoveryLine =
    result.discovery && result.discovery.triggered
      ? ` (AI-extension discovery: ${result.discovery.errorCount ?? 0} error(s))`
      : '';
  return { exitCode: EXIT_SUCCESS, stdout: `${result.message}${discoveryLine}` };
}

/**
 * cpt-frontx-flow-cli-invocation-run-command / cpt-frontx-algo-cli-invocation-parse-dispatch
 * — dispatches ONE recognized command to the internal component that owns
 * its behavior, by canonical flow ID, and maps the outcome to an exit code.
 * Adds no second dispatch path; redefines no command behavior.
 */
export async function runCommand(command: KnownCommand, args: string[], deps: CliDeps): Promise<CommandOutcome> {
  // Each case below both dispatches (inst-pd-dispatch) and, in the same
  // return statement, maps the dispatched behavior's outcome to an exit
  // code (inst-pd-map-outcome) and returns it (inst-pd-return-exit) — the
  // three instructions are fused at this code's granularity by design (one
  // dispatch call immediately followed by its outcome mapping and return).
  // @cpt-begin:cpt-frontx-algo-cli-invocation-parse-dispatch:p1:inst-pd-dispatch
  // @cpt-begin:cpt-frontx-algo-cli-invocation-parse-dispatch:p1:inst-pd-map-outcome
  // @cpt-begin:cpt-frontx-algo-cli-invocation-parse-dispatch:p1:inst-pd-return-exit
  switch (command) {
    // dispatch -> cpt-frontx-flow-template-resolution-install (installCommand)
    case 'install': {
      const [spec] = args;
      if (!spec) return { exitCode: EXIT_USER_ERROR, stderr: 'install requires a <spec> argument.' };
      const result = await installCommand(spec, deps.inventory, deps.fetchFn);
      return formatInstallResult(result);
    }

    // dispatch -> cpt-frontx-flow-template-resolution-list (listCommand)
    case 'list': {
      const entries = await listCommand(deps.inventory);
      const stdout =
        entries.length === 0
          ? 'No templates installed.'
          : entries.map((e) => `${e.name}@${e.ref} (${e.source})`).join('\n');
      return { exitCode: EXIT_SUCCESS, stdout };
    }

    // dispatch -> cpt-frontx-flow-template-resolution-update-local (updateLocalCommand)
    case 'update-local': {
      const [name, spec] = args;
      if (!name || !spec) {
        return { exitCode: EXIT_USER_ERROR, stderr: 'update-local requires <identity> and <spec> arguments.' };
      }
      const result = await updateLocalCommand(name, spec, deps.inventory, deps.fetchFn);
      if (!result.ok) return { exitCode: EXIT_USER_ERROR, stderr: result.message };
      return { exitCode: EXIT_SUCCESS, stdout: result.message };
    }

    // dispatch -> cpt-frontx-flow-template-manifest-validate-for-publication (validateCommand)
    case 'validate': {
      const [templateDir] = args;
      if (!templateDir) return { exitCode: EXIT_USER_ERROR, stderr: 'validate requires a <templateDir> argument.' };
      const result = await validateCommand(templateDir, deps.readFileFn, deps.listContentOwnedFilesFn);
      return {
        exitCode: result.exitCode === 0 ? EXIT_SUCCESS : EXIT_USER_ERROR,
        stdout: result.ok ? result.message : undefined,
        stderr: result.ok ? undefined : result.message,
      };
    }

    // dispatch -> cpt-frontx-flow-cli-scaffolding-seed-repository (seedRepository)
    case 'seed': {
      const [templateRef, targetDir] = args;
      if (!templateRef || !targetDir) {
        return { exitCode: EXIT_USER_ERROR, stderr: 'seed requires <templateRef> and <targetDir> arguments.' };
      }
      const lookupFn = (name: string): InventoryEntry | undefined => deps.inventory.lookup(name);
      const result = await seedRepository(
        templateRef,
        targetDir,
        lookupFn,
        deps.readContentFn,
        deps.writeFileFn,
        deps.provenanceWriteFn,
        deps.readProjectFile,
      );
      if (!result.ok) {
        const exitCode = result.reason === 'manifest-unreadable' || result.reason === 'provenance-failed'
          ? EXIT_INTERNAL_ERROR
          : EXIT_USER_ERROR;
        const stderr =
          result.reason === 'conflict'
            ? `${result.message}\n${formatConflictDetails(result.conflicts)}`
            : result.message;
        return { exitCode, stderr };
      }
      return { exitCode: EXIT_SUCCESS, stdout: result.message };
    }

    // dispatch -> cpt-frontx-flow-cli-scaffolding-add-template (addTemplate)
    case 'add': {
      const [templateRef, targetDir] = args;
      if (!templateRef || !targetDir) {
        return { exitCode: EXIT_USER_ERROR, stderr: 'add requires <templateRef> and <targetDir> arguments.' };
      }
      const lookupFn = (name: string): InventoryEntry | undefined => deps.inventory.lookup(name);
      const result = await addTemplate(
        templateRef,
        targetDir,
        lookupFn,
        () => deps.inventory.list(),
        deps.readContentFn,
        deps.writeFileFn,
        deps.readProvenanceRecordsFn,
        deps.provenanceWriteFn,
        deps.readProjectFile,
      );
      if (!result.ok) {
        const exitCode = result.reason === 'manifest-unreadable' || result.reason === 'provenance-failed'
          ? EXIT_INTERNAL_ERROR
          : EXIT_USER_ERROR;
        const stderr =
          result.reason === 'conflict'
            ? `${result.message}\n${formatConflictDetails(result.conflicts)}`
            : result.message;
        return { exitCode, stderr };
      }
      return { exitCode: EXIT_SUCCESS, stdout: result.message };
    }

    // dispatch -> cpt-frontx-flow-upgrade-changeset-review-approval (upgradeCommand)
    case 'upgrade': {
      const [projectRoot, targetVersion, ...rest] = args;
      if (!projectRoot || !targetVersion) {
        return { exitCode: EXIT_USER_ERROR, stderr: 'upgrade requires <projectRoot> and <targetVersion> arguments.' };
      }
      const autoApprove = rest.includes('--yes');
      // `--json` switches the change-set-review handshake to the
      // machine-readable protocol the AI Tooling Framework's
      // `invokeUpgradeCommand` adapter parses over the command surface
      // (DESIGN §3.4; cpt-frontx-dod-ai-upgrade-orchestration-single-engine)
      // instead of the human-facing interactive prompt.
      const jsonMode = rest.includes('--json');
      // review #500 (fix 3/3): computed HERE, from the same SET-shaped read
      // the upgrade engine's single-record bridge (`createFsReadSingleProvenanceFn`)
      // uses internally, rather than left to that adapter to print — this is
      // the one place, like every other message on this command surface,
      // that decides what reaches the terminal. Suppressed entirely in
      // `--json` mode: the AI Tooling Framework's handshake (DESIGN §3.4) is
      // a minimal, fixed machine-readable protocol, and an unstructured
      // human-facing line has no well-formed place in it.
      const multiRecordNotice = await formatMultiRecordUpgradeNotice(projectRoot, deps.readProvenanceRecordsFn);
      const result = await upgradeCommand(projectRoot, targetVersion, {
        readProvenance: deps.readSingleProvenanceFn,
        fetchFn: deps.fetchFn,
        readProjectFile: deps.readProjectFile,
        readContentItems: deps.readContentFn,
        writeProjectFile: deps.writeProjectFile,
        removeProjectFile: deps.removeProjectFile,
        writeProvenance: deps.provenanceWriteFn,
        presentAndGetApproval: autoApprove
          ? async () => 'approved'
          : jsonMode
            ? createJsonApproval()
            : deps.presentAndGetApproval,
      });
      switch (result.status) {
        case 'applied':
        case 'declined':
          return {
            exitCode: EXIT_SUCCESS,
            stdout: jsonMode ? JSON.stringify({ ok: true, status: result.status }) : result.changeSetJson,
            stderr: jsonMode ? undefined : multiRecordNotice,
          };
        case 'resolution-failed':
          return {
            exitCode: EXIT_USER_ERROR,
            stderr: jsonMode
              ? JSON.stringify({ ok: false, status: result.status, message: result.message })
              : joinNoticeAndMessage(multiRecordNotice, result.message),
          };
        case 'apply-failed':
          return {
            exitCode: EXIT_INTERNAL_ERROR,
            stderr: jsonMode
              ? JSON.stringify({ ok: false, status: result.status, message: result.message })
              : joinNoticeAndMessage(multiRecordNotice, result.message),
          };
      }
    }
  }
  // @cpt-end:cpt-frontx-algo-cli-invocation-parse-dispatch:p1:inst-pd-return-exit
  // @cpt-end:cpt-frontx-algo-cli-invocation-parse-dispatch:p1:inst-pd-map-outcome
  // @cpt-end:cpt-frontx-algo-cli-invocation-parse-dispatch:p1:inst-pd-dispatch

  /* c8 ignore next -- exhaustive KnownCommand switch above always returns */
  throw new Error(`Unreachable: no dispatch case for command "${command as string}".`);
}

/**
 * cpt-frontx-flow-cli-invocation-help / cpt-frontx-algo-cli-invocation-parse-dispatch
 * — produces the usage summary for no-command, explicit help, and
 * unrecognized-command invocations, mapping each to its exit code.
 */
export function helpOutcome(parsed: ParsedInvocation): CommandOutcome {
  // @cpt-begin:cpt-frontx-flow-cli-invocation-help:p1:inst-help-invoke
  // entry: run() deferred here for no command, an explicit help request, or
  // an unrecognized command token (parsed by parseInvocation above).
  // @cpt-end:cpt-frontx-flow-cli-invocation-help:p1:inst-help-invoke

  // @cpt-begin:cpt-frontx-flow-cli-invocation-help:p1:inst-help-usage
  // @cpt-begin:cpt-frontx-algo-cli-invocation-parse-dispatch:p1:inst-pd-return-help
  const usage = usageText();
  // @cpt-end:cpt-frontx-algo-cli-invocation-parse-dispatch:p1:inst-pd-return-help
  // @cpt-end:cpt-frontx-flow-cli-invocation-help:p1:inst-help-usage

  // @cpt-begin:cpt-frontx-flow-cli-invocation-help:p1:inst-help-return-success
  // @cpt-begin:cpt-frontx-state-cli-invocation-run:p1:inst-st-req-help-success
  if (parsed.helpRequested) {
    return { exitCode: EXIT_SUCCESS, stdout: usage };
  }
  // @cpt-end:cpt-frontx-state-cli-invocation-run:p1:inst-st-req-help-success
  // @cpt-end:cpt-frontx-flow-cli-invocation-help:p1:inst-help-return-success

  // @cpt-begin:cpt-frontx-flow-cli-invocation-help:p1:inst-help-if-unrecognized
  // @cpt-begin:cpt-frontx-flow-cli-invocation-help:p1:inst-help-return-user-error
  // @cpt-begin:cpt-frontx-algo-cli-invocation-parse-dispatch:p1:inst-pd-return-unknown
  // @cpt-begin:cpt-frontx-state-cli-invocation-run:p1:inst-st-req-unknown
  return {
    exitCode: EXIT_USER_ERROR,
    stderr: `Unrecognized command: "${parsed.command}"\n\n${usage}`,
  };
  // @cpt-end:cpt-frontx-state-cli-invocation-run:p1:inst-st-req-unknown
  // @cpt-end:cpt-frontx-algo-cli-invocation-parse-dispatch:p1:inst-pd-return-unknown
  // @cpt-end:cpt-frontx-flow-cli-invocation-help:p1:inst-help-return-user-error
  // @cpt-end:cpt-frontx-flow-cli-invocation-help:p1:inst-help-if-unrecognized
}

/**
 * cpt-frontx-flow-cli-invocation-run-command — top-level run: parses the
 * invocation, defers to help on no-command/help/unrecognized-command
 * (cpt-frontx-flow-cli-invocation-help), otherwise dispatches to the single
 * command surface, and always returns a mapped exit code
 * (cpt-frontx-state-cli-invocation-run).
 */
export async function run(argv: string[], deps: CliDeps): Promise<CommandOutcome> {
  // @cpt-begin:cpt-frontx-flow-cli-invocation-run-command:p1:inst-run-parse
  const parsed = parseInvocation(argv);
  // @cpt-end:cpt-frontx-flow-cli-invocation-run-command:p1:inst-run-parse

  // @cpt-begin:cpt-frontx-flow-cli-invocation-run-command:p1:inst-run-if-no-command
  // @cpt-begin:cpt-frontx-flow-cli-invocation-run-command:p1:inst-run-defer-help
  if (parsed.helpRequested || parsed.unrecognized) {
    return helpOutcome(parsed);
  }
  // @cpt-end:cpt-frontx-flow-cli-invocation-run-command:p1:inst-run-defer-help
  // @cpt-end:cpt-frontx-flow-cli-invocation-run-command:p1:inst-run-if-no-command

  // The invocation parsed to a recognized command token and its arguments
  // (neither help-requested nor unrecognized, having fallen through the
  // deferral above) -> REQUESTED to PARSED.
  // @cpt-begin:cpt-frontx-state-cli-invocation-run:p1:inst-st-req-parsed
  const recognizedCommand = parsed.command as KnownCommand;
  // @cpt-end:cpt-frontx-state-cli-invocation-run:p1:inst-st-req-parsed

  // @cpt-begin:cpt-frontx-flow-cli-invocation-run-command:p1:inst-run-dispatch
  // @cpt-begin:cpt-frontx-flow-cli-invocation-run-command:p1:inst-run-map-exit
  try {
    // @cpt-begin:cpt-frontx-state-cli-invocation-run:p1:inst-st-parsed-dispatched
    const outcome = await runCommand(recognizedCommand, parsed.args, deps);
    // @cpt-end:cpt-frontx-state-cli-invocation-run:p1:inst-st-parsed-dispatched

    // The dispatched behavior's outcome — whichever exit code it carries —
    // realizes exactly one of the three DISPATCHED transitions below.
    // @cpt-begin:cpt-frontx-state-cli-invocation-run:p1:inst-st-dispatched-success
    // @cpt-begin:cpt-frontx-state-cli-invocation-run:p1:inst-st-dispatched-user-error
    // @cpt-begin:cpt-frontx-state-cli-invocation-run:p1:inst-st-dispatched-internal-error
    return outcome ?? { exitCode: EXIT_INTERNAL_ERROR, stderr: 'Command produced no outcome.' };
    // @cpt-end:cpt-frontx-state-cli-invocation-run:p1:inst-st-dispatched-internal-error
    // @cpt-end:cpt-frontx-state-cli-invocation-run:p1:inst-st-dispatched-user-error
    // @cpt-end:cpt-frontx-state-cli-invocation-run:p1:inst-st-dispatched-success
  } catch (error) {
    // The dispatched behavior failed unexpectedly -> internal-error exit code.
    // @cpt-begin:cpt-frontx-state-cli-invocation-run:p1:inst-st-dispatched-internal-error
    const message = error instanceof Error ? error.message : String(error);
    return { exitCode: EXIT_INTERNAL_ERROR, stderr: message };
    // @cpt-end:cpt-frontx-state-cli-invocation-run:p1:inst-st-dispatched-internal-error
  }
  // @cpt-end:cpt-frontx-flow-cli-invocation-run-command:p1:inst-run-map-exit
  // @cpt-end:cpt-frontx-flow-cli-invocation-run-command:p1:inst-run-dispatch
}

// --- process entrypoint ---

/* c8 ignore start -- process wiring exercised by running the built binary, not unit tests */
async function main(): Promise<void> {
  // @cpt-begin:cpt-frontx-flow-cli-invocation-run-command:p1:inst-run-invoke
  const argv = process.argv.slice(2);
  // @cpt-end:cpt-frontx-flow-cli-invocation-run-command:p1:inst-run-invoke
  const deps = createRealDeps();
  const outcome = await run(argv, deps);
  if (outcome.stdout) process.stdout.write(`${outcome.stdout}\n`);
  if (outcome.stderr) process.stderr.write(`${outcome.stderr}\n`);
  // @cpt-begin:cpt-frontx-flow-cli-invocation-run-command:p1:inst-run-return
  process.exit(outcome.exitCode);
  // @cpt-end:cpt-frontx-flow-cli-invocation-run-command:p1:inst-run-return
}

// The global npm bin is a SYMLINK to this file, so `process.argv[1]` (the
// symlink path, e.g. .../bin/frontx) never equals `import.meta.url` (the real
// path, .../dist/cli.js) under a plain URL comparison — which made the globally
// installed CLI silently no-op. Resolve BOTH to real paths before comparing so
// the CLI actually runs when invoked through a symlinked global bin.
let isMainModule: boolean;
try {
  isMainModule =
    !!process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
} catch {
  isMainModule = false;
}
if (isMainModule || process.env.FRONTX_CLI_FORCE_MAIN === '1') {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exit(EXIT_INTERNAL_ERROR);
  });
}
/* c8 ignore stop */
