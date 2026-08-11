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
// shelling out to `npx --yes agent-browser`.
//
// The driver never retries a failure of its own accord. A failed step is
// recorded in the JSON result and the process exits non-zero, so a retry is a
// decision the run makes, in the open, and discloses.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const HELP = `verify-walk - drive one theme-walk pass over a scaffolded application

Usage:
  node verify-walk.mjs --host <url> --themes <list|registry> --screens <list> --capdir <path> [options]

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
  '--states', '--cdp-port', '--ready-timeout', '--json-out', '--coverage',
]);

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

// ---------------------------------------------------------------------------
// Process plumbing

// NODE_NO_WARNINGS on every invocation, and stdout captured on its own pipe.
// Both guard the same failure from two sides: a deprecation warning printed by
// the runner's own toolchain lands in the output a run parses, and a value read
// off a polluted stream is a reading of the warning. Separate pipes make the
// pollution structurally impossible; the flag keeps the noise out of the log a
// human reads afterwards.
function run(command, args, input) {
  return spawnSync(command, args, {
    input,
    encoding: 'utf8',
    env: { ...process.env, NODE_NO_WARNINGS: '1' },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

const browser = (args, input) => run('npx', ['--yes', 'agent-browser', ...args], input);

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

// A page-side throw reaches the driver either as a non-zero exit or as a line
// on stderr, depending on the runner build, and in both cases stdout is empty -
// indistinguishable from a script that legitimately returned nothing. Both
// shapes are treated as a failed eval here, at the one place that can still see
// the status; a caller reading only stdout has already lost the difference.
// The launcher's own `npm warn exec` chatter does not carry an Error name.
const ERROR_SHAPED = /\b\w*Error\b/;

function evaluate(script) {
  const proc = browser(['eval', '--stdin'], `${PRELUDE}\n${script}`);
  const stderr = (proc.stderr ?? '').trim();
  if (proc.status !== 0 || ERROR_SHAPED.test(stderr)) {
    fail('eval-error', `browser eval exited ${proc.status}: ${stderr || '(nothing on stderr)'}`, { script });
    return EVAL_ERROR;
  }
  return lastLine(proc.stdout);
}

// 'yes' | 'no' | EVAL_ERROR. The tri-state exists for waitFor: a poll that
// cannot tell a refused eval from an absent element keeps asking until the
// timeout and files the same failure on every turn.
const probeExists = (testid) => evaluate(`(() => (__find(${JSON.stringify(testid)}) ? 'yes' : 'no'))()`);

const exists = (testid) => probeExists(testid) === 'yes';

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
  browser: { probe: null, mode: null, cdpPort: null },
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

function finish(options) {
  result.finishedAt = new Date().toISOString();
  result.ok = result.failures.length === 0;
  const payload = `${JSON.stringify(result, null, 2)}\n`;
  if (options?.jsonOut) {
    fs.mkdirSync(path.dirname(options.jsonOut), { recursive: true });
    fs.writeFileSync(options.jsonOut, payload);
  }
  process.stdout.write(payload);
  process.exit(result.ok ? 0 : 1);
}

// ---------------------------------------------------------------------------
// Coverage rows

function appendCoverage(coveragePath, screens) {
  const header = `| Theme | Opened | Visually distinct from previous | ${screens.map((s) => `${s.name} states captured`).join(' | ')} |\n`
    + `|${'---|'.repeat(3 + screens.length)}\n`;
  const firstOpened = result.themes.findIndex((t) => t.labelConfirmed);
  const rows = result.themes.map((theme) => {
    const opened = theme.labelConfirmed ? 'verified' : `not-opened (label read "${theme.labelRead}")`;
    let distinct;
    if (theme.comparisons.length > 0) {
      distinct = theme.comparisons.map((c) => `${c.screen}/${c.state}: ${c.verdict} (cmp exit ${c.exit})`).join('; ');
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
      const parts = captured.map((c) => `${c.state} (${path.basename(c.file)})`)
        .concat(driven.map((c) => `${c.state} driven, not captured`));
      return parts.length > 0 ? parts.join(', ') : 'none';
    });
    return `| ${theme.theme} | ${opened} | ${distinct} | ${cells.join(' | ')} |\n`;
  }).join('');

  fs.mkdirSync(path.dirname(coveragePath), { recursive: true });
  const fresh = !fs.existsSync(coveragePath) || fs.readFileSync(coveragePath, 'utf8').trim() === '';
  fs.appendFileSync(coveragePath, (fresh ? header : '') + rows);
  result.coverageFile = coveragePath;
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

// Resolved before anything reads it, and every capture path is built from it,
// because the runner takes a relative screenshot path as relative to its own
// temporary working directory and reports the write as a success. The files
// land somewhere the byte-compare and the coverage cells never look, and the
// run reads as a walk that captured nothing it can point at.
const capdir = path.resolve(opts.capdir);
const jsonOut = path.resolve(opts['json-out'] ?? path.join(capdir, 'verify-walk.json'));
const coveragePath = path.resolve(opts.coverage ?? path.join(capdir, 'verification-coverage.md'));
const readyTimeout = Number(opts['ready-timeout'] ?? 15000);
const cdpPort = Number(opts['cdp-port'] ?? 9222);
const navigation = opts.nav ?? 'menu';
const labels = parseLabelMap(opts['theme-labels']);

result.host = opts.host;
result.capdir = capdir;
result.navigation = navigation;
result.browser.cdpPort = cdpPort;

let screens;
try {
  screens = parseScreens(opts.screens);
  result.screens = screens;
} catch (error) {
  fail('arguments', error.message);
  finish({ jsonOut: null });
}

if (navigation === 'menu' && !opts.menu) {
  fail('arguments', '--nav menu needs --menu <pattern with {screen}>');
  finish({ jsonOut: null });
}

// A capture directory shared with an earlier run leaves that run's files exactly
// where this one goes looking, and neither the byte-compare nor the coverage
// cells can tell which run wrote a file they address by name.
if (fs.existsSync(capdir)) {
  if (fs.readdirSync(capdir).length > 0) {
    fail('capdir', `capture directory "${capdir}" already holds files; give this run a directory of its own`);
    finish({ jsonOut: null });
  }
} else {
  fs.mkdirSync(capdir, { recursive: true });
}

// The theme set is recorded with its provenance, so a report cannot claim it
// came from the host's theme registration when it was typed in by hand.
if (opts.themes === 'registry') {
  if (!opts['theme-registry']) {
    fail('arguments', '--themes registry needs --theme-registry <file the set was read into>');
    finish({ jsonOut });
  }
  const raw = JSON.parse(fs.readFileSync(path.resolve(opts['theme-registry']), 'utf8'));
  result.themeSet.themes = Array.isArray(raw) ? raw : raw.themes;
  result.themeSet.source = `registry:${path.resolve(opts['theme-registry'])}`;
} else {
  result.themeSet.themes = opts.themes.split(',').filter(Boolean);
  result.themeSet.source = 'literal';
}
if (!Array.isArray(result.themeSet.themes) || result.themeSet.themes.length === 0) {
  fail('arguments', 'the theme set is empty');
  finish({ jsonOut });
}

const states = opts.states ? JSON.parse(fs.readFileSync(path.resolve(opts.states), 'utf8')) : {};

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
  result.browser.mode = connected.status === 0 ? 'connected' : 'connect-failed';
  if (connected.status !== 0) fail('browser', `connect ${cdpPort} exited ${connected.status}: ${lastLine(connected.stderr)}`);
} else {
  result.browser.mode = 'launched';
}
if (result.failures.length > 0) finish({ jsonOut });

function capture(theme, screen, state) {
  const file = path.join(capdir, `${theme}-${screen}-${state}.png`);
  const shot = browser(['screenshot', file]);
  if (shot.status !== 0 || !fs.existsSync(file)) {
    fail('capture', `screenshot for ${theme}/${screen}/${state} did not land`, { file, exit: shot.status });
    return null;
  }
  return file;
}

// ---------------------------------------------------------------------------
// Menu resolution

const MENU_SCREEN = '{screen}';
const MENU_EXTENSION_ID = '{extensionId}';

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

function reachScreen(screen, hard) {
  if (hard) {
    browser(['open', `${opts.host}${screen.route}`]);
    browser(['reload']);
  } else {
    const testid = menuTestid(screen);
    // An unresolved menu item is already recorded as a failure; clicking the
    // unsubstituted pattern would only add a second, less informative one.
    if (testid === null) return false;
    click(testid);
  }
  if (!screen.readyTestid) return false;
  if (waitFor(screen.readyTestid, readyTimeout)) return true;
  fail('ready', `screen "${screen.name}" never showed ${screen.readyTestid} within ${readyTimeout}ms`);
  return false;
}

for (const theme of result.themeSet.themes) {
  const record = {
    theme, labelConfirmed: false, labelRead: null, labelReadBack: null,
    panelCollapsed: null, captures: [], drivenOnly: [], readBacks: [], comparisons: [],
  };
  result.themes.push(record);

  // The reload is the theme boundary reset: it discards every field filled and
  // dialog opened under the previous theme, so a capture named fresh is fresh.
  const first = screens[0];
  const firstReady = reachScreen(first, true);

  if (opts['panel-expand']) click(opts['panel-expand']);
  click(opts.switcher);
  click(opts['theme-option'].replace('{theme}', theme));

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
    click(opts['panel-collapse']);
    record.panelCollapsed = opts['panel-expand'] ? exists(opts['panel-expand']) : null;
    if (record.panelCollapsed === false) {
      fail('panel', `dev panel did not collapse under theme "${theme}"; captures would carry host chrome`);
      continue;
    }
  }

  for (const [index, screen] of screens.entries()) {
    const ready = index === 0 ? firstReady : reachScreen(screen, navigation === 'route');
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
      const cmp = spawnSync('cmp', ['-s', before.file, shot.file], { encoding: 'utf8' });
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
