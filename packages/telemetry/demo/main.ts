import { createTelemetry, telemetryElementHookKey } from '@gears-frontx/telemetry';

const ENDPOINT = 'http://localhost:5273/api/events';

document.querySelector('#endpoint')!.textContent = ENDPOINT;

const list = document.querySelector<HTMLOListElement>('#requests')!;
const requestCount = document.querySelector<HTMLSpanElement>('#request-count')!;
const hookCount = document.querySelector<HTMLSpanElement>('#hook-count')!;
let requests = 0;
let hooks = 0;

/**
 * Renders the exact bytes leaving the page. The `event` hook fires far earlier than this — before
 * the built-in device/appInfo/session plugins enrich the record, before `time_sent`, before each
 * object-valued field is individually JSON.stringify'd, and before the envelope is built. So the
 * only honest way to show "what gets sent" is to read the request itself.
 */
const originalFetch = window.fetch.bind(window);

window.fetch = (input, init) => {
  const url = input instanceof Request ? input.url : String(input);

  if (init?.method === 'POST' && url === ENDPOINT && typeof init.body === 'string') {
    renderRequest(init.body, init.headers);
  }

  return originalFetch(input, init);
};

const telemetry = createTelemetry({
  appName: 'telemetry-demo-web',
  appVersion: '0.0.0',
  url: ENDPOINT,
  // Log SDK activity to the browser console alongside the on-page request list.
  verbose: true,
  autocapture: true,
  // Short, so a session boundary is observable without waiting 30 minutes.
  sessionDuration: 60_000,
});

// A plugin is just { name, setup }. Passed inline, `context` and `record` are typed
// contextually — nothing to import. This one only counts, to show where in the lifecycle the
// hook sits relative to the request above.
telemetry.plugin({
  name: 'demo-inspector',
  setup: (context) => {
    context.addHook('event', () => {
      hooks += 1;
      hookCount.textContent = String(hooks);
    });
  },
});

telemetry.identify('demo-user-1');
telemetry.start();

// Any element may register a hook governing how autocapture treats its subtree.
const hooked = document.querySelector('#hooked');
if (hooked) {
  hooked[telemetryElementHookKey] = () => ({
    context: {
      context_service_name: 'settings-panel',
      context_service_version: '1.0.0',
      // Required alongside context_service_name: appInfo warns if the chain does not contain the
      // service. It prepends the app name, so this is the chain below that.
      context_call_chain: ['settings-panel'],
    },
    data: { section: 'appearance' },
  });
}

// The theme select actually switches the theme, so the `change` event autocapture records
// corresponds to something the page really did.
const themeSelect = document.querySelector<HTMLSelectElement>('#theme');
if (themeSelect) {
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  applyTheme(prefersDark ? 'dark' : 'light');
  themeSelect.value = prefersDark ? 'dark' : 'light';
  themeSelect.addEventListener('change', () => applyTheme(themeSelect.value));
}

function applyTheme(theme: string) {
  document.documentElement.dataset.theme = theme;
}

document.querySelector('#log-event')?.addEventListener('click', () => {
  telemetry.logEvent('settings_saved', { theme: themeSelect?.value, notifications: true });
});

document.querySelector('#identify')?.addEventListener('click', () => {
  telemetry.identify('demo-user-2');
});

document.querySelector('#destroy')?.addEventListener('click', () => {
  telemetry.destroy();
  note('destroy() called — listeners removed, scheduler stopped. Reload to start again.');
});

document.querySelector('#demo-form')?.addEventListener('submit', (event) => {
  event.preventDefault();
});

function renderRequest(body: string, headers: HeadersInit | undefined) {
  requests += 1;
  requestCount.textContent = String(requests);

  const payload: unknown = JSON.parse(body);
  const records =
    payload && typeof payload === 'object' && 'records' in payload && Array.isArray(payload.records)
      ? payload.records.length
      : 0;

  const item = document.createElement('li');

  const title = document.createElement('strong');
  title.textContent = `POST /api/events — ${records} record${records === 1 ? '' : 's'}, ${body.length} bytes`;

  const meta = document.createElement('div');
  meta.className = 'meta';
  meta.textContent = `Content-Type: ${contentType(headers)}`;

  const pre = document.createElement('pre');
  pre.textContent = JSON.stringify(payload, null, 2);

  item.append(title, meta, pre);
  list.prepend(item);
}

function contentType(headers: HeadersInit | undefined) {
  if (!headers) return '(none)';
  const entries = headers instanceof Headers ? [...headers.entries()] : Object.entries(headers);
  const found = entries.find(([key]) => key.toLowerCase() === 'content-type');
  return found ? found[1] : '(none)';
}

function note(message: string) {
  const item = document.createElement('li');
  item.className = 'note';
  item.textContent = message;
  list.prepend(item);
}
