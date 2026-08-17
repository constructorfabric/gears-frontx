#!/usr/bin/env node
// One theme-walk pass over a scaffolded application, executed as a program
// rather than as a conversation of browser calls.
//
// The skill document beside this file states these same rules as prose. This
// program is the executable copy of them. Prose did not survive a change of
// agent host: three separate hosts driven from identical sources each broke the
// discipline in a different place, and each of them independently wrote a
// browser driver of its own on the way. So the driver ships, and the guards
// below are code rather than paragraphs a run may read late, read partly, or
// read and not apply.
//
// Zero dependencies beyond the node standard library. The browser is reached by
// shelling out to a browser CLI, `npx --yes agent-browser` unless --browser-cmd
// names another.
//
// The driver never retries a failure of its own accord. A failed step is
// recorded in the JSON result and the process exits non-zero, so a retry is a
// decision the run makes, in the open, and discloses. Every failure path in here
// ends in that record: an invocation this driver cannot perform, a file it cannot
// read and a child that never returns all leave a JSON result behind rather than
// a stack trace.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const HELP = `verify-walk - drive one theme-walk pass over a scaffolded application

Usage:
  node verify-walk.mjs --host <url> --themes <list|registry> --screens <list>
                       --capdir <path> --switcher <testid>
                       --theme-option <pattern> [options]

Required:
  --host <url>              origin of the running dev server, e.g. http://localhost:3000
  --themes <list|registry>  comma list of registered theme names, or the word
                            "registry" with --theme-registry naming the file the
                            set was read out of the host's theme registration into
  --screens <list>          comma list of name:route[:ready-testid[:extension-id]]
                            entries, e.g.
                            orders:/orders:screen-orders,stock:/stock:screen-stock
                            The fourth field is the screen's full extension id, for
                            a host that keys its menu items by id; see --menu.
  --capdir <path>           capture directory for this run; created when absent and
                            refused when it already holds files
  --switcher <testid>       data-testid of the theme switcher trigger
  --theme-option <pattern>  data-testid of a theme's option, with {theme} in it

Optional:
  --theme-registry <path>   file the theme set was read from; recorded as the set's provenance
  --theme-labels <map>      theme=label pairs, comma separated, when a switcher label
                            does not carry the theme name verbatim
  --menu <pattern>          data-testid of a screen's menu item, with {screen} or
                            {extensionId} in it; required when --nav is menu.
                            {screen} takes the short name from --screens.
                            {extensionId} takes that screen's fourth --screens field,
                            or, when none is declared, the id read off the page from
                            the menu item whose id carries the screen name as a
                            whole segment.
  --nav <menu|route>        how screens after the first are reached (default: menu)
  --panel-expand <testid>   data-testid of the host dev panel's expand control
  --panel-collapse <testid> data-testid of the host dev panel's collapse control
  --states <path>           JSON file of declared per-screen interactions (see below)
  --cdp-port <n>            debugging port probed before any browser is launched (default: 9222)
  --ready-timeout <ms>      budget for a screen readiness poll (default: 15000)
  --browser-cmd <cmd>       command line the browser CLI is driven through
                            (default: npx --yes agent-browser); a caller pins a
                            version or names an installed binary here
  --command-timeout <ms>    budget for one browser command; past it the child is
                            killed and the run records a timeout (default: 60000)
  --json-out <path>         machine-readable result (default: <capdir>/verify-walk.json)
  --coverage <path>         coverage markdown the theme rows are appended to
                            (default: <capdir>/verification-coverage.md)
  --help                    print this text and exit 0

--states file shape:
  { "<screen name>": [ { "state": "submitted",
                         "actions": [ { "kind": "fill", "testid": "email", "value": "a@b.c" },
                                      { "kind": "click", "testid": "submit" },
                                      { "kind": "read", "testid": "status" } ] } ] }

Exit code is 0 only when every theme opened, every read-back agreed, and every
declared capture landed. Any failure exits non-zero with the reason in the JSON.
`;

// ---------------------------------------------------------------------------
// Argument surface

const FLAGS_WITH_VALUE = new Set([
  '--host', '--themes', '--theme-registry', '--theme-labels', '--screens', '--capdir',
  '--switcher', '--theme-option', '--menu', '--nav', '--panel-expand', '--panel-collapse',
  '--states', '--cdp-port', '--ready-timeout', '--browser-cmd', '--command-timeout',
  '--json-out', '--coverage',
]);

// Substituted into the patterns their flags carry. Declared here rather than
// beside the code that substitutes them because the argument validation below
// runs first and reads them.
const MENU_SCREEN = '{screen}';
const MENU_EXTENSION_ID = '{extensionId}';
const THEME_TOKEN = '{theme}';

const NAVIGATIONS = new Set(['menu', 'route']);
const ACTION_KINDS = new Set(['fill', 'click', 'read']);
const MAX_TCP_PORT = 65535;
const DEFAULT_BROWSER_COMMAND = 'npx --yes agent-browser';

function parseArgs(argv) {
  const opts = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--help' || token === '-h') return { help: true };
    if (!FLAGS_WITH_VALUE.has(token)) throw new Error(`unknown argument "${token}"`);
    const value = argv[i + 1];
    if (value === undefined || value.startsWith('--')) throw new Error(`${token} needs a value`);
    opts[token.slice(2)] = value;
    i += 1;
  }
  return opts;
}

// `Number('nope')` is NaN, and a NaN deadline is never reached: the readiness
// poll below then asks every 400ms forever, printing nothing and ending never.
// So every numeric flag is a finite positive integer or the invocation is
// refused, and the refusal happens before a directory is made or a browser is
// reached.
function positiveInt(flag, raw, fallback, max) {
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!/^[0-9]+$/.test(raw.trim()) || !Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${flag} "${raw}" is not a positive whole number`);
  }
  if (max !== undefined && value > max) throw new Error(`${flag} "${raw}" is above the highest valid value ${max}`);
  return value;
}

// A screen is name:route[:ready-testid[:extension-id]]. The ready testid is what
// the driver waits for before capturing; a screen declared without one is
// captured after a bare settle and marked readyConfirmed:false, so the weakness
// is disclosed in the result rather than hidden behind a screenshot that looks
// fine. The extension id is the menu resolver's certain path; a colon separates
// the fields because an extension id is built from `.` and `~` and carries none.
function parseScreens(spec) {
  return spec.split(',').filter(Boolean).map((entry) => {
    const [name, route, ready, extensionId] = entry.split(':');
    if (!name || !route) throw new Error(`--screens entry "${entry}" is not name:route[:ready-testid[:extension-id]]`);
    return { name, route, readyTestid: ready || null, extensionId: extensionId || null };
  });
}

function parseLabelMap(spec) {
  const map = {};
  for (const pair of (spec ?? '').split(',').filter(Boolean)) {
    const [theme, label] = pair.split('=');
    if (!theme || !label) throw new Error(`--theme-labels entry "${pair}" is not theme=label`);
    map[theme] = label;
  }
  return map;
}

// A file read and a JSON parse at the top level used to throw straight out of
// the program: a missing registry, a truncated states file or a stray comma
// ended the run with a stack trace, no result record and no coverage row - the
// one shape a caller cannot act on, because it cannot tell a driver that refused
// from a driver that crashed. Both readers below raise instead, and the caller
// turns that into an `arguments` failure in the record.
function readJsonFile(flag, file) {
  const resolved = path.resolve(file);
  let raw;
  try {
    raw = fs.readFileSync(resolved, 'utf8');
  } catch (error) {
    throw new Error(`${flag} "${resolved}" could not be read: ${error.message}`, { cause: error });
  }
  try {
    return { resolved, parsed: JSON.parse(raw) };
  } catch (error) {
    throw new Error(`${flag} "${resolved}" is not JSON: ${error.message}`, { cause: error });
  }
}

// Accepts an array of names or `{ themes: [...] }`, and nothing else: a file
// holding `{ themes: null }` used to leave the theme set undefined and the walk
// iterating over nothing while the run still read as performed.
function readThemeRegistry(file) {
  const { resolved, parsed } = readJsonFile('--theme-registry', file);
  const themes = Array.isArray(parsed) ? parsed : parsed?.themes;
  if (!Array.isArray(themes) || themes.length === 0) {
    throw new Error(`--theme-registry "${resolved}" holds neither a non-empty array of theme names nor { "themes": [...] }`);
  }
  for (const theme of themes) {
    if (typeof theme !== 'string' || theme.trim() === '') {
      throw new Error(`--theme-registry "${resolved}" lists ${JSON.stringify(theme)} where a theme name belongs`);
    }
  }
  return { themes, source: `registry:${resolved}` };
}

// Validated whole before the first browser call, because a malformed entry
// reached mid-walk costs the captures already taken: the throw came out of the
// state loop, past `finish()`, and the run lost the record of everything that had
// worked. Screen names are checked against the walked set for the same reason a
// bad action kind is - a states file keyed by a screen nobody walks drives
// nothing, reports nothing, and reads as a state that passed.
function readStates(file, screens) {
  const { resolved, parsed } = readJsonFile('--states', file);
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`--states "${resolved}" is not an object keyed by screen name`);
  }
  const walked = new Set(screens.map((screen) => screen.name));
  for (const [screen, declared] of Object.entries(parsed)) {
    if (!walked.has(screen)) throw new Error(`--states "${resolved}" declares screen "${screen}", which --screens does not name`);
    if (!Array.isArray(declared)) throw new Error(`--states "${resolved}" holds ${JSON.stringify(declared)} under "${screen}" where an array of states belongs`);
    for (const entry of declared) {
      if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
        throw new Error(`--states "${resolved}": every entry under "${screen}" is an object with "state" and "actions"`);
      }
      if (typeof entry.state !== 'string' || entry.state.trim() === '') {
        throw new Error(`--states "${resolved}": an entry under "${screen}" carries no non-empty "state"`);
      }
      if (!Array.isArray(entry.actions)) {
        throw new Error(`--states "${resolved}": "${screen}"/"${entry.state}" carries no "actions" array`);
      }
      for (const action of entry.actions) {
        if (action === null || typeof action !== 'object' || Array.isArray(action)) {
          throw new Error(`--states "${resolved}": every action under "${screen}"/"${entry.state}" is an object`);
        }
        if (!ACTION_KINDS.has(action.kind)) {
          throw new Error(`--states "${resolved}": action kind ${JSON.stringify(action.kind)} under "${screen}"/"${entry.state}" is not one of fill, click, read`);
        }
        if (typeof action.testid !== 'string' || action.testid === '') {
          throw new Error(`--states "${resolved}": an action under "${screen}"/"${entry.state}" carries no "testid"`);
        }
        if (action.kind === 'fill' && typeof action.value !== 'string') {
          throw new Error(`--states "${resolved}": the fill of "${action.testid}" under "${screen}"/"${entry.state}" needs a string "value"`);
        }
        if (action.kind === 'read' && action.contains !== undefined && typeof action.contains !== 'string') {
          throw new Error(`--states "${resolved}": the read of "${action.testid}" under "${screen}"/"${entry.state}" declares a non-string "contains"`);
        }
      }
    }
  }
  return parsed;
}

// ---------------------------------------------------------------------------
// Process plumbing

// Assigned from --command-timeout before the first child is spawned. Read at
// call time rather than captured, so the bound is the one the invocation asked
// for and not the default it was declared with.
let commandTimeoutMs = 60000;

// NODE_NO_WARNINGS on every invocation, and stdout captured on its own pipe.
// Both guard the same failure from two sides: a deprecation warning printed by
// the runner's own toolchain lands in the output a run parses, and a value read
// off a polluted stream is a reading of the warning. Separate pipes make the
// pollution structurally impossible; the flag keeps the noise out of the log a
// human reads afterwards.
//
// `timeout` is what keeps the walk finite. Every browser interaction is a child
// process, and an unbounded one blocks the driver forever on a browser that
// stopped answering - the failure mode this file's own fetch probes are already
// bounded against, and the one AGENTS.md requires bounding with the issuing
// tool's own timeout parameter rather than a shell wrapper. SIGKILL because a
// runner that ignored the budget is exactly the runner that ignores SIGTERM.
function run(command, args, input) {
  return spawnSync(command, args, {
    input,
    encoding: 'utf8',
    env: { ...process.env, NODE_NO_WARNINGS: '1' },
    stdio: ['pipe', 'pipe', 'pipe'],
    timeout: commandTimeoutMs,
    killSignal: 'SIGKILL',
  });
}

// Assigned during argument validation; `browser` reads it at call time.
let browserCommand = DEFAULT_BROWSER_COMMAND.split(/\s+/);

const browser = (args, input) => run(browserCommand[0], [...browserCommand.slice(1), ...args], input);

// The runner prints human-facing lines before the value on some commands, so
// the value is the last non-empty line of stdout and nothing else. Surrounding
// quotes come off: a string result is printed quoted and a comparison against
// the quoted form silently never matches.
function lastLine(stdout) {
  const lines = (stdout ?? '').split('\n').map((line) => line.trim()).filter(Boolean);
  const value = lines.length > 0 ? lines[lines.length - 1] : '';
  return value.replace(/^["']|["']$/g, '');
}

// ---------------------------------------------------------------------------
// Page access, shadow-piercing throughout

// Screen content renders inside shadow roots and an outside selector does not
// see in: a plain CSS fill matches nothing, types into whatever held focus, and
// still reports success. Every read and every drive in this driver descends
// through shadowRoot instead.
//
// Every name here is installed on globalThis rather than declared. The runner
// evaluates each script in the page's one persistent global scope, so a
// top-level `const __find` from the first eval is still bound when the second
// arrives and the runtime refuses it with "Identifier '__find' has already been
// declared" - a page-side throw that reads, through the callers, as an element
// holding an empty string. `??=` installs the helper once per page lifetime and
// a reload reinstalls it, so no eval after the first has anything to redeclare.
const PRELUDE = `
globalThis.__find ??= (id) => {
  const sel = '[data-testid="' + id + '"]';
  const walk = (root) => {
    const hit = root.querySelector(sel);
    if (hit) return hit;
    for (const el of root.querySelectorAll('*')) {
      if (el.shadowRoot) { const deep = walk(el.shadowRoot); if (deep) return deep; }
    }
    return null;
  };
  return walk(document);
};
globalThis.__MISSING ??= '__verify_walk_missing__';
globalThis.__testids ??= () => {
  const seen = [];
  const walk = (root) => {
    for (const el of root.querySelectorAll('[data-testid]')) seen.push(el.getAttribute('data-testid'));
    for (const el of root.querySelectorAll('*')) { if (el.shadowRoot) walk(el.shadowRoot); }
  };
  walk(document);
  return JSON.stringify(seen);
};
`;

// Returned in place of a value the eval never produced. Distinct from
// __MISSING on purpose: "the page holds no such element" and "the script never
// ran" call for different repairs, and collapsing both into an empty string is
// what sent a run hunting a rendering race that did not exist.
const EVAL_ERROR = '__verify_walk_eval_error__';

// A runner invocation fails either as a non-zero exit or as a line on stderr,
// depending on the runner build, and in both cases stdout is empty -
// indistinguishable from a command that legitimately printed nothing. Both
// shapes are read here, at the one place that can still see the status; a
// caller reading only stdout has already lost the difference. The launcher's
// own `npm warn exec` chatter does not carry an Error name.
const ERROR_SHAPED = /\b\w*Error\b/;

// A child that never returned carries its reason on `proc.error` and leaves
// `status` null with empty pipes, which reads through every stdout-only path as
// a command that printed nothing. Both no-return shapes get a stage of their
// own, because "the runner hung" and "the runner rejected the script" are
// different repairs and neither is the other.
function invocationOutcome(proc) {
  if (proc.error) {
    const timedOut = proc.error.code === 'ETIMEDOUT';
    return {
      failed: true,
      stage: timedOut ? 'timeout' : 'spawn',
      detail: timedOut
        ? `was killed after ${commandTimeoutMs}ms without returning`
        : `could not be run: ${proc.error.message}`,
    };
  }
  const stderr = (proc.stderr ?? '').trim();
  if (proc.status !== 0 || ERROR_SHAPED.test(stderr)) {
    return { failed: true, stage: null, detail: `exited ${proc.status}: ${stderr || '(nothing on stderr)'}` };
  }
  return { failed: false, stage: null, detail: '' };
}

function evaluate(script) {
  const proc = browser(['eval', '--stdin'], `${PRELUDE}\n${script}`);
  const outcome = invocationOutcome(proc);
  if (outcome.failed) {
    fail(outcome.stage ?? 'eval-error', `browser eval ${outcome.detail}`, { script });
    return EVAL_ERROR;
  }
  return lastLine(proc.stdout);
}

// 'yes' | 'no' | EVAL_ERROR. The tri-state exists for waitFor: a poll that
// cannot tell a refused eval from an absent element keeps asking until the
// timeout and files the same failure on every turn.
const probeExists = (testid) => evaluate(`(() => (__find(${JSON.stringify(testid)}) ? 'yes' : 'no'))()`);

// true | false | null, where null is "the page was never asked". Collapsing a
// refused eval into "absent" is exactly the misdiagnosis EVAL_ERROR exists to
// prevent, and a caller that treats it as absence reports a missing control
// where the eval is what failed.
const confirmExists = (testid) => {
  const probe = probeExists(testid);
  return probe === EVAL_ERROR ? null : probe === 'yes';
};

const readText = (testid) =>
  evaluate(`(() => { const el = __find(${JSON.stringify(testid)}); return el ? (el.textContent || '').trim() : __MISSING; })()`);

// Every data-testid the page carries, shadow roots included. Read as JSON
// rather than as a delimited line because the ids this exists to find are
// extension ids, built from exactly the punctuation any delimiter would have to
// avoid. Null means the list could not be read at all, which is a different
// answer from a page carrying none.
function readTestids() {
  const raw = evaluate('__testids()');
  if (raw === EVAL_ERROR) return null;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
  } catch {
    // falls through to the one failure below, so both shapes of unreadable
    // answer are reported the same way
  }
  fail('menu-resolve', `the page's data-testid list did not read back as JSON: "${raw}"`);
  return null;
}

// Why a driven step did not take. A missing control and a refused eval are
// different repairs, and one shared "not found" message is what made a broken
// eval look like a screen that had not rendered yet.
const outcomeReason = (outcome) =>
  (outcome === EVAL_ERROR ? 'the eval did not run' : 'no control carries that data-testid');

// A synthetic .click() carries none of the pointer sequence around it, so a
// control listening for pointerdown sees nothing and the screen stays as it
// was. Every click here is the full native sequence.
const click = (testid) => evaluate(`(() => {
  const el = __find(${JSON.stringify(testid)});
  if (!el) return __MISSING;
  const box = el.getBoundingClientRect();
  const init = { bubbles: true, cancelable: true, composed: true,
    clientX: box.left + box.width / 2, clientY: box.top + box.height / 2,
    pointerId: 1, pointerType: 'mouse', isPrimary: true, button: 0, buttons: 1 };
  const up = { ...init, buttons: 0 };
  el.dispatchEvent(new PointerEvent('pointerdown', init));
  el.dispatchEvent(new MouseEvent('mousedown', init));
  el.dispatchEvent(new PointerEvent('pointerup', up));
  el.dispatchEvent(new MouseEvent('mouseup', up));
  el.dispatchEvent(new MouseEvent('click', up));
  return 'dispatched';
})()`);

// The fill returns the field's own value afterwards, so the caller reads back
// what landed instead of believing an exit report. The native value setter is
// used because a controlled field ignores a direct assignment.
const fill = (testid, value) => evaluate(`(() => {
  const el = __find(${JSON.stringify(testid)});
  if (!el) return __MISSING;
  const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
  setter.call(el, ${JSON.stringify(value)});
  el.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
  el.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
  return el.value;
})()`);

// Synchronous by design: the whole driver is a straight line of blocking calls,
// and a timer would need the loop to be free, which it is not between polls.
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

// The poll lives here rather than inside the page: an async helper handed to the
// runner can come back as the promise instead of its value, and a run that reads
// that as a result waits on nothing. A driver-side loop of synchronous existence
// checks cannot land in that state.
function waitFor(testid, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const probe = probeExists(testid);
    if (probe === 'yes') return true;
    // A refused eval refuses again on the next turn, so polling on would spend
    // the whole budget filing the same failure over and over. The first one is
    // already recorded and carries the reason.
    if (probe === EVAL_ERROR) return false;
    if (Date.now() >= deadline) return false;
    sleep(400);
  }
}

// ---------------------------------------------------------------------------
// Result record

const result = {
  driver: 'verify-walk',
  resultVersion: 1,
  startedAt: new Date().toISOString(),
  finishedAt: null,
  ok: false,
  host: null,
  capdir: null,
  browser: { probe: null, mode: null, cdpPort: null, command: null },
  themeSet: { source: null, themes: [] },
  screens: [],
  navigation: null,
  menuResolution: [],
  themes: [],
  failures: [],
  coverageFile: null,
};

function fail(stage, detail, extra = {}) {
  result.failures.push({ stage, detail, at: new Date().toISOString(), ...extra });
}

// fs.writeSync to fd 1 rather than process.stdout.write: the stream queues on a
// pipe and process.exit() does not drain the queue, so the JSON a caller parses
// arrives truncated exactly when it is being piped into something. A pipe also
// accepts partial writes, hence the loop, and a closed reader is not this
// program's failure to report - the record has already been written to disk.
function writeStdout(payload) {
  const bytes = Buffer.from(payload, 'utf8');
  let written = 0;
  while (written < bytes.length) {
    try {
      written += fs.writeSync(1, bytes, written, bytes.length - written);
    } catch (error) {
      if (error.code === 'EAGAIN') continue;
      return;
    }
  }
}

function finish(options) {
  result.finishedAt = new Date().toISOString();
  result.ok = result.failures.length === 0;
  if (options?.jsonOut) {
    try {
      fs.mkdirSync(path.dirname(options.jsonOut), { recursive: true });
      fs.writeFileSync(options.jsonOut, `${JSON.stringify(result, null, 2)}\n`);
    } catch (error) {
      // The run's own account of itself could not be filed where it was asked
      // for. It still has to reach the caller, so the write failure joins the
      // record and stdout carries the whole thing: a result that went nowhere is
      // indistinguishable from a run that never happened.
      fail('output', `the result could not be written to "${options.jsonOut}": ${error.message}`);
      result.ok = false;
    }
  }
  writeStdout(`${JSON.stringify(result, null, 2)}\n`);
  process.exit(result.ok ? 0 : 1);
}

// ---------------------------------------------------------------------------
// Coverage rows

// A `|` in a page reading or in a control's name closes the cell it is written
// into and shifts every column after it, so a table filled from what the page
// said is a table the page can corrupt. Newlines fold for the same reason.
const cell = (text) => String(text ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');

function appendCoverage(coveragePath, screens) {
  const header = `| Theme | Opened | Visually distinct from previous | ${screens.map((s) => `${cell(s.name)} states captured`).join(' | ')} |\n`
    + `|${'---|'.repeat(3 + screens.length)}\n`;
  const firstOpened = result.themes.findIndex((t) => t.labelConfirmed);
  const rows = result.themes.map((theme) => {
    let opened;
    if (theme.labelConfirmed) {
      opened = 'verified';
    } else if (theme.controlFailure !== null) {
      opened = `not-opened (${cell(theme.controlFailure)})`;
    } else {
      opened = `not-opened (label read "${cell(theme.labelRead)}")`;
    }
    let distinct;
    if (theme.comparisons.length > 0) {
      distinct = theme.comparisons.map((c) => `${cell(c.screen)}/${cell(c.state)}: ${c.verdict} (cmp exit ${c.exit})`).join('; ');
    } else if (!theme.labelConfirmed) {
      distinct = 'not-compared (theme did not open)';
    } else if (result.themes.findIndex((t) => t.theme === theme.theme) === firstOpened) {
      distinct = 'first theme';
    } else {
      distinct = 'not-compared (no capture pair)';
    }
    const cells = screens.map((screen) => {
      const captured = theme.captures.filter((c) => c.screen === screen.name);
      const driven = theme.drivenOnly.filter((c) => c.screen === screen.name);
      // readyConfirmed rides into the cell because a report filled from this
      // file has no other way to tell a capture taken after its screen's ready
      // handle appeared from one taken after a bare settle.
      const parts = captured.map((c) => `${cell(c.state)} (${cell(path.basename(c.file))}, ready ${c.readyConfirmed ? 'confirmed' : 'unconfirmed'})`)
        .concat(driven.map((c) => `${cell(c.state)} driven, not captured`));
      return parts.length > 0 ? parts.join(', ') : 'none';
    });
    return `| ${cell(theme.theme)} | ${opened} | ${distinct} | ${cells.join(' | ')} |\n`;
  }).join('');

  // The coverage file is this step's stated deliverable, so a filesystem refusal
  // is a failure of the run rather than an exception out of its last line: the
  // JSON result still lands and names the path that could not be written.
  try {
    fs.mkdirSync(path.dirname(coveragePath), { recursive: true });
    const fresh = !fs.existsSync(coveragePath) || fs.readFileSync(coveragePath, 'utf8').trim() === '';
    fs.appendFileSync(coveragePath, (fresh ? header : '') + rows);
    result.coverageFile = coveragePath;
  } catch (error) {
    fail('coverage', `the coverage rows could not be written to "${coveragePath}": ${error.message}`);
  }
}

// ---------------------------------------------------------------------------
// Walk

let opts;
try {
  opts = parseArgs(process.argv.slice(2));
} catch (error) {
  process.stderr.write(`${error.message}\n\n${HELP}`);
  process.exit(2);
}
if (opts.help) {
  process.stdout.write(HELP);
  process.exit(0);
}

for (const required of ['host', 'themes', 'screens', 'capdir', 'switcher', 'theme-option']) {
  if (!opts[required]) {
    process.stderr.write(`missing required argument --${required}\n\n${HELP}`);
    process.exit(2);
  }
}

// Everything the invocation itself has to get right is settled here, in one
// place, before a directory is created or a browser is reached: an invocation
// this driver cannot perform costs nothing on disk and says why in its own
// result record rather than in a stack trace.
//
// capdir is resolved before anything reads it, and every capture path is built
// from it, because the runner takes a relative screenshot path as relative to
// its own temporary working directory and reports the write as a success. The
// files land somewhere the byte-compare and the coverage cells never look, and
// the run reads as a walk that captured nothing it can point at.
let capdir;
let jsonOut;
let coveragePath;
let readyTimeout;
let cdpPort;
let navigation;
let labels;
let screens;
let states;
try {
  capdir = path.resolve(opts.capdir);
  jsonOut = path.resolve(opts['json-out'] ?? path.join(capdir, 'verify-walk.json'));
  coveragePath = path.resolve(opts.coverage ?? path.join(capdir, 'verification-coverage.md'));

  readyTimeout = positiveInt('--ready-timeout', opts['ready-timeout'], 15000);
  cdpPort = positiveInt('--cdp-port', opts['cdp-port'], 9222, MAX_TCP_PORT);
  commandTimeoutMs = positiveInt('--command-timeout', opts['command-timeout'], 60000);

  browserCommand = (opts['browser-cmd'] ?? DEFAULT_BROWSER_COMMAND).trim().split(/\s+/).filter(Boolean);
  if (browserCommand.length === 0) throw new Error('--browser-cmd names no command to run');

  navigation = opts.nav ?? 'menu';
  if (!NAVIGATIONS.has(navigation)) {
    // Unvalidated, any string reached the walk and everything that was not
    // "route" took the menu branch, so `--nav manu` ran `opts.menu.split` on
    // undefined and ended the process on an uncaught TypeError.
    throw new Error(`--nav "${navigation}" is not one of ${[...NAVIGATIONS].join(', ')}`);
  }

  labels = parseLabelMap(opts['theme-labels']);
  screens = parseScreens(opts.screens);
  if (screens.length === 0) throw new Error('--screens names no screen to walk');

  if (navigation === 'menu' && !opts.menu) {
    throw new Error(`--nav menu needs --menu <pattern with ${MENU_SCREEN} or ${MENU_EXTENSION_ID}>`);
  }
  if (navigation === 'menu' && screens.length > 1
    && !opts.menu.includes(MENU_SCREEN) && !opts.menu.includes(MENU_EXTENSION_ID)) {
    throw new Error(`--menu "${opts.menu}" carries neither ${MENU_SCREEN} nor ${MENU_EXTENSION_ID}, so every screen after the first would click one same menu item`);
  }

  // The theme set is recorded with its provenance, so a report cannot claim it
  // came from the host's theme registration when it was typed in by hand.
  if (opts.themes === 'registry') {
    if (!opts['theme-registry']) throw new Error('--themes registry needs --theme-registry <file the set was read into>');
    result.themeSet = readThemeRegistry(opts['theme-registry']);
  } else {
    result.themeSet = { source: 'literal', themes: opts.themes.split(',').filter(Boolean) };
  }
  if (result.themeSet.themes.length === 0) throw new Error('the theme set is empty');
  if (result.themeSet.themes.length > 1 && !opts['theme-option'].includes(THEME_TOKEN)) {
    throw new Error(`--theme-option "${opts['theme-option']}" carries no ${THEME_TOKEN}, so every theme would click one same option`);
  }

  states = opts.states ? readStates(opts.states, screens) : {};
} catch (error) {
  fail('arguments', error.message);
  finish({ jsonOut: null });
}

result.host = opts.host;
result.capdir = capdir;
result.navigation = navigation;
result.screens = screens;
result.browser.cdpPort = cdpPort;
result.browser.command = browserCommand.join(' ');

// A capture directory shared with an earlier run leaves that run's files exactly
// where this one goes looking, and neither the byte-compare nor the coverage
// cells can tell which run wrote a file they address by name.
try {
  if (fs.existsSync(capdir)) {
    if (fs.readdirSync(capdir).length > 0) {
      fail('capdir', `capture directory "${capdir}" already holds files; give this run a directory of its own`);
      finish({ jsonOut: null });
    }
  } else {
    fs.mkdirSync(capdir, { recursive: true });
  }
} catch (error) {
  fail('capdir', `capture directory "${capdir}" could not be prepared: ${error.message}`);
  finish({ jsonOut: null });
}

// Fail fast on a dead application before a browser is involved: a runner error
// against an origin nothing serves reads as a browser problem and sends the run
// looking in the wrong place.
try {
  await fetch(opts.host, { signal: AbortSignal.timeout(5000) });
} catch (error) {
  fail('host-probe', `nothing answered at ${opts.host}: ${error.message}`);
  finish({ jsonOut });
}

// Probe before launching. A self-launched browser has hung mid-run where an
// attached one returned every capture asked of it, and the probe is one request.
try {
  const probe = await fetch(`http://127.0.0.1:${cdpPort}/json/version`, { signal: AbortSignal.timeout(2000) });
  result.browser.probe = probe.ok ? 'answered' : `status ${probe.status}`;
} catch {
  result.browser.probe = 'refused';
}
if (result.browser.probe === 'answered') {
  const connected = browser(['connect', String(cdpPort)]);
  const outcome = invocationOutcome(connected);
  result.browser.mode = outcome.failed ? 'connect-failed' : 'connected';
  if (outcome.failed) fail(outcome.stage ?? 'browser', `connect ${cdpPort} ${outcome.detail}`);
} else {
  result.browser.mode = 'launched';
}
if (result.failures.length > 0) finish({ jsonOut });

function capture(theme, screen, state) {
  const file = path.join(capdir, `${theme}-${screen}-${state}.png`);
  const shot = browser(['screenshot', file]);
  const outcome = invocationOutcome(shot);
  if (outcome.failed || !fs.existsSync(file)) {
    fail(outcome.stage ?? 'capture', `screenshot for ${theme}/${screen}/${state} did not land: ${outcome.detail || 'the runner reported success and wrote no file'}`, { file, exit: shot.status });
    return null;
  }
  return file;
}

// ---------------------------------------------------------------------------
// Menu resolution

// An extension id is identifier segments joined by punctuation - a menu item
// reads `menu-item-gts.frontx.mfes.ext.extension.v1~...~best.login.screens.login.v1`
// - and the screen is named by one of those segments. Matching on a bare
// substring would let a screen called "task" claim "tasks", so the name has to
// stand as a whole segment or not at all.
const idSegments = (id) => id.split(/[^A-Za-z0-9]+/).filter(Boolean);

const menuTestids = new Map();

// The host keys each menu item by the screen's full extension id, which the
// short name in --screens cannot spell. Reading the ids back off the page is
// what run 30 had to do by hand: the pattern was inexpressible, the run fell
// back to route navigation, and the menu clicks it still owed were driven one
// at a time outside the driver. One candidate is the answer; anything else is a
// refusal, never a pick, because a wrong menu item navigates somewhere real and
// every reading after it is a reading of the wrong screen.
function discoverExtensionId(pattern, screen) {
  const [prefix, suffix] = pattern.split(MENU_EXTENSION_ID);
  const onPage = readTestids();
  if (onPage === null) return null;

  const candidates = [...new Set(onPage
    .filter((id) => id.length > prefix.length + suffix.length && id.startsWith(prefix) && id.endsWith(suffix))
    .map((id) => id.slice(prefix.length, id.length - suffix.length))
    .filter((id) => idSegments(id).includes(screen.name)))];

  if (candidates.length === 1) return candidates[0];
  fail('menu-resolve', candidates.length === 0
    ? `no data-testid on the page matches "${pattern}" with "${screen.name}" as a segment of its id; the page carries ${JSON.stringify(onPage)}`
    : `${JSON.stringify(candidates)} all carry "${screen.name}" as a segment; declare the screen's extension id as the fourth field of its --screens entry`);
  return null;
}

// Resolved once per screen and remembered: the menu is re-rendered at every
// theme boundary but its ids are not re-issued, so a second discovery would
// spend an eval to learn what the first one already knows.
function menuTestid(screen) {
  if (menuTestids.has(screen.name)) return menuTestids.get(screen.name);

  // {screen} is substituted first and unconditionally, so a host whose menu
  // items are keyed by the short name resolves exactly as it always did - and
  // without an eval, since a pattern that spells the whole id needs nothing
  // read off the page.
  const pattern = opts.menu.split(MENU_SCREEN).join(screen.name);
  let testid = pattern;
  let extensionId = null;
  let source = 'pattern';

  if (pattern.includes(MENU_EXTENSION_ID)) {
    extensionId = screen.extensionId ?? discoverExtensionId(pattern, screen);
    source = extensionId === null ? 'unresolved' : screen.extensionId === null ? 'discovered' : 'declared';
    testid = extensionId === null ? null : pattern.split(MENU_EXTENSION_ID).join(extensionId);
  }

  // Recorded for every screen, resolved or not: which handle the walk clicked
  // is part of what the run has to be able to show, and "the pattern as given"
  // is an answer a report may need as much as a discovered id.
  result.menuResolution.push({ screen: screen.name, testid, extensionId, source });
  menuTestids.set(screen.name, testid);
  return testid;
}

// ---------------------------------------------------------------------------
// Navigation

// What reaching a screen established, which is not the same question as whether
// a command succeeded: a screen may be arrived at and still carry no handle to
// confirm the arrival with.
const NAV_FAILED = 'failed';
const NAV_UNCONFIRMED = 'unconfirmed';
const NAV_READY = 'ready';

// open and reload used to be fired and forgotten. A navigation that never
// happened then surfaced only as a readiness timeout a full budget later, and
// on a screen declared without a ready testid it never surfaced at all - the
// walk carried on capturing the previous screen under this one's name. Same
// class as the discarded eval status: the runner said so, and nobody read it.
function navigate(args, screen) {
  const proc = browser(args);
  const outcome = invocationOutcome(proc);
  if (!outcome.failed) return true;
  fail(outcome.stage ?? 'navigation-error', `"${args.join(' ')}" for screen "${screen.name}" ${outcome.detail}`);
  return false;
}

function reachScreen(screen, hard) {
  if (hard) {
    if (!navigate(['open', `${opts.host}${screen.route}`], screen)) return NAV_FAILED;
    if (!navigate(['reload'], screen)) return NAV_FAILED;
  } else {
    const testid = menuTestid(screen);
    if (testid === null) return NAV_FAILED;
    const outcome = click(testid);
    if (outcome !== 'dispatched') {
      fail('navigation-error', `menu item "${testid}" for screen "${screen.name}" was not clicked: ${outcomeReason(outcome)}`);
      return NAV_FAILED;
    }
  }
  if (!screen.readyTestid) return NAV_UNCONFIRMED;
  if (waitFor(screen.readyTestid, readyTimeout)) return NAV_READY;
  fail('ready', `screen "${screen.name}" never showed ${screen.readyTestid} within ${readyTimeout}ms`);
  return NAV_UNCONFIRMED;
}

// Every declared control operation has to report as dispatched. Discarded, the
// outcome let a run pass with no switcher on the page at all: a single-theme run
// already showing the requested theme reads a label that matches, so the label
// check agrees and the walk captures a theme nothing switched. The failure names
// the test id that was not found, because the symptom the run saw otherwise -
// a switcher label reading `__verify_walk_missing__` - reads as a theme that did
// not open rather than as a handle that does not exist.
function operate(record, testid, what) {
  const outcome = click(testid);
  if (outcome === 'dispatched') return true;
  record.controlFailure = `${what} "${testid}" was not clicked: ${outcomeReason(outcome)}`;
  fail('control', `${what} "${testid}" was not clicked under theme "${record.theme}": ${outcomeReason(outcome)}`);
  return false;
}

for (const theme of result.themeSet.themes) {
  const record = {
    theme, labelConfirmed: false, labelRead: null, labelReadBack: null,
    controlFailure: null,
    panelCollapsed: null, captures: [], drivenOnly: [], readBacks: [], comparisons: [],
  };
  result.themes.push(record);

  // The reload is the theme boundary reset: it discards every field filled and
  // dialog opened under the previous theme, so a capture named fresh is fresh.
  const first = screens[0];
  const firstNav = reachScreen(first, true);

  // A control operation that did not dispatch stops this theme where it stands:
  // captures taken past a missing switcher belong to whatever theme was already
  // on screen, and the label check cannot tell the difference.
  if (opts['panel-expand'] && !operate(record, opts['panel-expand'], 'dev panel expand control')) continue;
  if (!operate(record, opts.switcher, 'theme switcher')) continue;
  if (!operate(record, opts['theme-option'].split(THEME_TOKEN).join(theme), `theme option for "${theme}"`)) continue;

  // The switcher's own label is the only source of truth for which theme is
  // active. It is read twice: the second reading is a confirmation, not a
  // retry, and both readings are recorded so a disagreement is visible.
  const wanted = (labels[theme] ?? theme).toLowerCase();
  const normalize = (text) => (text ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
  record.labelRead = readText(opts.switcher);
  record.labelReadBack = readText(opts.switcher);
  record.labelConfirmed = normalize(record.labelRead).includes(normalize(wanted))
    && normalize(record.labelReadBack).includes(normalize(wanted));

  if (!record.labelConfirmed) {
    // Not-opened: capture nothing under it rather than file this theme's row
    // from a page still showing the previous one. The walk carries on so every
    // registered theme gets a row, and the run still exits non-zero.
    fail('theme-switch', `theme "${theme}" did not open; switcher label read "${record.labelRead}" then "${record.labelReadBack}"`);
    continue;
  }

  // An expanded dev panel is host chrome drawn over the screens under
  // verification. The collapse is confirmed by the expand control being present
  // afterwards, which it is only while the panel is collapsed.
  if (opts['panel-collapse']) {
    if (!operate(record, opts['panel-collapse'], 'dev panel collapse control')) continue;
    record.panelCollapsed = opts['panel-expand'] ? confirmExists(opts['panel-expand']) : null;
    if (opts['panel-expand'] && record.panelCollapsed !== true) {
      fail('panel', record.panelCollapsed === null
        ? `the dev panel's collapse under theme "${theme}" could not be confirmed: the eval did not run`
        : `dev panel did not collapse under theme "${theme}"; captures would carry host chrome`);
      continue;
    }
  }

  for (const [index, screen] of screens.entries()) {
    const nav = index === 0 ? firstNav : reachScreen(screen, navigation === 'route');
    // A screen the page never reached files nothing under its name. A capture
    // taken here would show whichever screen the failed navigation left on
    // screen, and its coverage cell would claim a state no run ever saw.
    if (nav === NAV_FAILED) continue;

    const ready = nav === NAV_READY;
    const freshFile = capture(theme, screen.name, 'fresh');
    if (freshFile) record.captures.push({ screen: screen.name, state: 'fresh', file: freshFile, readyConfirmed: ready });

    for (const declared of states[screen.name] ?? []) {
      for (const action of declared.actions ?? []) {
        if (action.kind === 'fill') {
          const readBack = fill(action.testid, action.value);
          const ok = readBack === action.value;
          record.readBacks.push({ screen: screen.name, state: declared.state, action: 'fill', testid: action.testid, expected: action.value, actual: readBack, ok });
          if (!ok) fail('read-back', `fill of "${action.testid}" under theme "${theme}" read back "${readBack}"`);
        } else if (action.kind === 'click') {
          const outcome = click(action.testid);
          const ok = outcome === 'dispatched';
          record.readBacks.push({ screen: screen.name, state: declared.state, action: 'click', testid: action.testid, actual: outcome, ok });
          if (!ok) fail('click', `control "${action.testid}" was not clicked under theme "${theme}": ${outcomeReason(outcome)}`);
        } else if (action.kind === 'read') {
          const text = readText(action.testid);
          const ok = text !== EVAL_ERROR
            && (action.contains ? text.includes(action.contains) : text !== '__verify_walk_missing__');
          record.readBacks.push({ screen: screen.name, state: declared.state, action: 'read', testid: action.testid, expected: action.contains ?? null, actual: text, ok });
          if (!ok) fail('read', `reading "${action.testid}" under theme "${theme}" gave "${text}"`);
        } else {
          // Unreachable while the parse-time states validation holds. Kept so
          // that loosening the validator cannot turn an unknown kind into a
          // silent no-op the coverage table then reports as a captured state.
          fail('states', `action kind "${action.kind}" is not one of fill, click, read`);
        }
      }
      const stateFile = capture(theme, screen.name, declared.state);
      if (stateFile) record.captures.push({ screen: screen.name, state: declared.state, file: stateFile, readyConfirmed: ready });
      else record.drivenOnly.push({ screen: screen.name, state: declared.state });
    }
  }

  // Byte-compare against the previous theme that actually opened. The verdict is
  // the command's own exit code and nothing else: identical files are a recorded
  // fact, not a failure, and a pair no command ran over gets no verdict at all.
  const previous = [...result.themes].reverse().find((t) => t.theme !== theme && t.labelConfirmed);
  if (previous) {
    for (const shot of record.captures) {
      const before = previous.captures.find((c) => c.screen === shot.screen && c.state === shot.state);
      if (!before) continue;
      const cmp = spawnSync('cmp', ['-s', before.file, shot.file], {
        encoding: 'utf8',
        timeout: commandTimeoutMs,
        killSignal: 'SIGKILL',
      });
      record.comparisons.push({
        against: previous.theme, screen: shot.screen, state: shot.state,
        command: `cmp -s ${path.basename(before.file)} ${path.basename(shot.file)}`,
        exit: cmp.status, verdict: cmp.status === 0 ? 'identical' : cmp.status === 1 ? 'differs' : 'not-compared',
      });
      if (cmp.status !== 0 && cmp.status !== 1) fail('compare', `cmp over ${shot.file} exited ${cmp.status}`);
    }
  }
}

appendCoverage(coveragePath, screens);
finish({ jsonOut });
