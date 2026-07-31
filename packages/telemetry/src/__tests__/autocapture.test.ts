import { afterEach, beforeEach, describe, expect, onTestFinished, test, vi } from 'vitest';
import { createTelemetry } from '../index';
import type { TelemetryApiPayload, TelemetryApiRecord } from '../utils/eventTypes';
import { getSessionKey } from '../utils/sessionUtils';
import { telemetryElementHookKey } from '../plugins/autocapture/elementHook';
import type { TelemetryElementHook, TelemetryElementHookResult } from '../plugins/autocapture/elementHook';
import * as autocaptureHelpers from '../plugins/autocapture/helpers';

// Wraps the real implementation so every test gets normal behavior by default; only the internal-
// error propagation test below swaps in a throwing implementation for a single call.
vi.mock('../plugins/autocapture/helpers', async (importOriginal) => {
  const actual = await importOriginal<typeof autocaptureHelpers>();
  return { ...actual, getTextContent: vi.fn(actual.getTextContent) };
});

const mockAppInfo = {
  appName: 'cloud',
  appVersion: '1.0.0',
};

const mockedUid = 'mock-uuid-asd-asd-asd';

function attachElementHook(el: Element, hook: TelemetryElementHook) {
  el[telemetryElementHookKey] = hook;
}

describe('autocapture element hook', () => {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({}),
  });

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('crypto', { randomUUID: vi.fn().mockReturnValue(mockedUid) });

    // Seed an existing session so `start()` doesn't emit a session_start event that would
    // clutter the flushed payload.
    const mockStorage: Record<string, string> = {
      [getSessionKey()]: JSON.stringify({
        id: 'test-session',
        lastActivity: Date.now(),
        startTime: Date.now(),
      }),
    };
    vi.stubGlobal('localStorage', {
      getItem: vi.fn((key: string) => mockStorage[key] ?? null),
      setItem: vi.fn((key: string, value: string) => {
        mockStorage[key] = value;
      }),
      removeItem: vi.fn((key: string) => {
        delete mockStorage[key];
      }),
      clear: vi.fn(() => {
        Object.keys(mockStorage).forEach((key) => delete mockStorage[key]);
      }),
      key: vi.fn((index: number) => Object.keys(mockStorage)[index] ?? null),
      get length() {
        return Object.keys(mockStorage).length;
      },
    });

    fetchMock.mockClear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  function startClient(config: Partial<{ verbose: boolean }> = {}) {
    const telemetry = createTelemetry({ ...mockAppInfo, ...config });
    telemetry.start();
    onTestFinished(() => telemetry.destroy());
    return telemetry;
  }

  function flushAutocaptureRecord(eventType: string): TelemetryApiRecord['value'] {
    vi.runAllTimers();
    const payload: TelemetryApiPayload = JSON.parse(fetchMock.mock.calls[0][1].body);
    const record = payload.records.find((item) => item.value.name === `autocapture_${eventType}`);
    expect(record).toBeDefined();
    return record!.value;
  }

  test('should attribute a click to a single ancestor with an element hook', () => {
    startClient();

    const hookRoot = document.createElement('div');
    attachElementHook(hookRoot, () => ({
      context: {
        context_service_name: 'service-a',
        context_call_chain: ['service-a'],
        context_service_version: '1.2.3',
      },
    }));

    const button = document.createElement('button');
    button.textContent = 'Click me';
    hookRoot.appendChild(button);
    document.body.appendChild(hookRoot);

    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    const value = flushAutocaptureRecord('click');
    expect(value.context_service_name).toBe('service-a');
    expect(value.context_service_version).toBe('1.2.3');
    // appInfo always prepends the shell app name onto whatever chain autocapture set.
    expect(value.context_call_chain).toEqual(['cloud', 'service-a']);
    expect(value.context_app_name).toBe('service-a');
  });

  test('should use the closest ancestor complete field-set atomically, without a farther-out override', () => {
    startClient();

    const outerElement = document.createElement('div');
    attachElementHook(outerElement, () => ({
      context: {
        context_service_name: 'outer-service',
        context_call_chain: ['outer-service'],
        context_service_version: 'outer-version',
      },
    }));

    const innerElement = document.createElement('div');
    attachElementHook(innerElement, () => ({
      context: {
        context_service_name: 'inner-service',
        context_call_chain: ['outer-service', 'inner-service'],
        context_service_version: 'inner-version',
      },
    }));

    const button = document.createElement('button');
    button.textContent = 'Click me';
    innerElement.appendChild(button);
    outerElement.appendChild(innerElement);
    document.body.appendChild(outerElement);

    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    const value = flushAutocaptureRecord('click');
    // Inner (closest) is a usable, complete field-set, so it wins wholesale — none of outer's
    // values leak into any of the three fields.
    expect(value.context_service_name).toBe('inner-service');
    // Inner's own complete chain is used as-is, not stitched with outer's separate return.
    expect(value.context_call_chain).toEqual(['cloud', 'outer-service', 'inner-service']);
    expect(value.context_service_version).toBe('inner-version');
  });

  test('should fall back to the shell as service_name when no ancestor has an element hook', () => {
    startClient();

    const button = document.createElement('button');
    button.textContent = 'Click me';
    document.body.appendChild(button);

    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    const value = flushAutocaptureRecord('click');
    expect(value.context_service_name).toBe(mockAppInfo.appName);
    expect(value.context_app_name).toBe(mockAppInfo.appName);
    expect(value.context_call_chain).toEqual([mockAppInfo.appName]);
  });

  test('should not let a farther-out hook fill a field the closest hook omitted', () => {
    startClient();

    const outerElement = document.createElement('div');
    attachElementHook(outerElement, () => ({
      context: {
        context_service_name: 'outer-service',
        context_call_chain: ['outer-service'],
        context_service_version: '9.9.9',
      },
    }));

    const innerElement = document.createElement('div');
    attachElementHook(innerElement, () => ({
      // Inner is closer to the click and returns a usable (non-empty) result, so it wins —
      // even though it left context_service_version unset. Outer's version must not be
      // pulled in to "complete" it: that would pair inner's identity with outer's version,
      // an incoherent cross-hook record.
      context: {
        context_service_name: 'inner-service',
        context_call_chain: ['outer-service', 'inner-service'],
      },
    }));

    const button = document.createElement('button');
    button.textContent = 'Click me';
    innerElement.appendChild(button);
    outerElement.appendChild(innerElement);
    document.body.appendChild(outerElement);

    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    const value = flushAutocaptureRecord('click');
    expect(value.context_service_name).toBe('inner-service');
    expect(value.context_call_chain).toEqual(['cloud', 'outer-service', 'inner-service']);
    // Outer's version is not used to fill the gap inner left.
    expect(value.context_service_version).toBeUndefined();
  });

  test('should not let an explicit undefined field from the closest hook blank its other fields or let a farther-out hook fill it', () => {
    startClient();

    const outerElement = document.createElement('div');
    attachElementHook(outerElement, () => ({
      context: {
        context_service_name: 'outer-service',
        context_call_chain: ['outer-service'],
        context_service_version: 'outer-version',
      },
    }));

    const innerElement = document.createElement('div');
    attachElementHook(innerElement, () => ({
      context: {
        context_service_name: 'inner-service',
        context_call_chain: ['outer-service', 'inner-service'],
        context_service_version: undefined,
      },
    }));

    const button = document.createElement('button');
    button.textContent = 'Click me';
    innerElement.appendChild(button);
    outerElement.appendChild(innerElement);
    document.body.appendChild(outerElement);

    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    const value = flushAutocaptureRecord('click');
    // The explicit `undefined` on inner's own return doesn't blank its own coherent fields.
    expect(value.context_service_name).toBe('inner-service');
    expect(value.context_call_chain).toEqual(['cloud', 'outer-service', 'inner-service']);
    // Nor does it let outer's version leak in — inner's (incomplete) field-set still wins whole.
    expect(value.context_service_version).toBeUndefined();
  });

  test('should not throw when the walk passes documentElement', () => {
    startClient();

    // Only reachable programmatically — the parser moves stray markup into body — but an extension
    // or an overlay library mounting on documentElement produces exactly this shape.
    const outside = document.createElement('button');
    outside.textContent = 'Outside body';
    document.documentElement.appendChild(outside);
    onTestFinished(() => outside.remove());

    // The walk stops only at body, so it climbs to documentElement, whose parentNode is the
    // document itself.
    expect(() =>
      outside.dispatchEvent(new MouseEvent('click', { bubbles: true })),
    ).not.toThrow();

    const record = flushAutocaptureRecord('click');
    expect(record.data?.$el_tag_name).toBe(JSON.stringify('button'));
    expect(record.data?.$el_text).toBe(JSON.stringify('Outside body'));
  });

  // Driven through the generator rather than a click: a detached tree never reaches the document
  // listener, so a dispatched event would exercise nothing.
  test.each([
    [
      'a fragment standing in for a shadow root',
      () => {
        const fragment = document.createDocumentFragment();
        const el = document.createElement('div');
        fragment.appendChild(el);
        return el;
      },
    ],
    [
      'the document above documentElement',
      () => {
        const el = document.createElement('div');
        document.documentElement.appendChild(el);
        onTestFinished(() => el.remove());
        return el;
      },
    ],
  ])('should yield only Elements when the walk reaches %s', (_label, build) => {
    const yielded = [...autocaptureHelpers.eachParentElement(build(), true)];

    expect(yielded.length).toBeGreaterThan(0);
    yielded.forEach((el) => expect(el.nodeType).toBe(1));
  });

  test('should propagate a genuine internal autocapture error (a bug in the walk, not a hook) to the caller instead of swallowing it', () => {
    startClient();

    const internalError = new Error('walk bug');
    vi.mocked(autocaptureHelpers.getTextContent).mockImplementationOnce(() => {
      throw internalError;
    });

    const button = document.createElement('button');
    button.textContent = 'Click me';
    document.body.appendChild(button);

    // No element hook is involved here — this is a bug in the walk itself, so unlike the hook-error
    // case below, nothing has been emitted yet when it throws.
    expect(() => button.dispatchEvent(new MouseEvent('click', { bubbles: true }))).toThrow(
      internalError,
    );

    vi.runAllTimers();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('should still emit the base autocapture event with shell fallback attribution, then re-throw the hook error, when a hook throws', () => {
    startClient();

    const hookRoot = document.createElement('div');
    const hookError = new Error('boom');
    attachElementHook(hookRoot, () => {
      throw hookError;
    });

    const button = document.createElement('button');
    button.textContent = 'Click me';
    hookRoot.appendChild(button);
    document.body.appendChild(hookRoot);

    // The base event is captured and queued for delivery before the error escapes the
    // click listener — dispatchEvent only throws once that has already happened.
    expect(() => button.dispatchEvent(new MouseEvent('click', { bubbles: true }))).toThrow(
      hookError,
    );

    const value = flushAutocaptureRecord('click');
    // Base capture (including $el_text) still went through — the throw didn't drop the event.
    // (`data` values are JSON-encoded per-field by `toJSONLikeValues` before being flushed.)
    expect(value.data?.$el_text).toBe(JSON.stringify('Click me'));
    // No context was recovered, so appInfo falls back to the shell as usual.
    expect(value.context_service_name).toBe(mockAppInfo.appName);
    expect(value.context_call_chain).toEqual([mockAppInfo.appName]);
  });

  test('should wrap a non-Error hook throw in an Error with cause set to the original value', () => {
    startClient();

    const hookRoot = document.createElement('div');
    const hookError = 'boom';
    attachElementHook(hookRoot, () => {
      // A hook is untrusted code and may throw a non-Error value; that's exactly the case
      // under test here.
      throw hookError;
    });

    const button = document.createElement('button');
    button.textContent = 'Click me';
    hookRoot.appendChild(button);
    document.body.appendChild(hookRoot);

    let thrown: unknown;
    try {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    } catch (error) {
      thrown = error;
    }

    // Wrapped so error monitoring gets a real Error/stack, but `cause` preserves the original
    // value a consumer's hook actually threw, for attribution back to that hook.
    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).cause).toBe(hookError);
  });

  test('should still emit the base event and surface a falsy thrown value, wrapped with cause set to the original', () => {
    startClient();

    const hookRoot = document.createElement('div');
    attachElementHook(hookRoot, () => {
      // A falsy thrown value (0, '', false, NaN) must still surface — a truthiness check on the
      // stashed value would otherwise silently drop it.
      throw 0;
    });

    const button = document.createElement('button');
    button.textContent = 'Click me';
    hookRoot.appendChild(button);
    document.body.appendChild(hookRoot);

    let thrown: unknown;
    try {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).cause).toBe(0);

    const value = flushAutocaptureRecord('click');
    // Base capture still went through — the falsy throw didn't drop the event either.
    expect(value.data?.$el_text).toBe(JSON.stringify('Click me'));
  });

  test("should keep the closest hook's null throw and not let a farther-out hook's later throw replace it", () => {
    startClient();

    const outerElement = document.createElement('div');
    const outerError = new Error('outer boom');
    attachElementHook(outerElement, () => {
      throw outerError;
    });

    const innerElement = document.createElement('div');
    attachElementHook(innerElement, () => {
      // `null` is falsy and not an Error — exercises the same presence-vs-truthiness guard as
      // the falsy-value case above, plus first-error-wins across two throwing hooks.
      throw null;
    });

    const button = document.createElement('button');
    button.textContent = 'Click me';
    innerElement.appendChild(button);
    outerElement.appendChild(innerElement);
    document.body.appendChild(outerElement);

    let thrown: unknown;
    try {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    } catch (error) {
      thrown = error;
    }

    // The closest (inner) hook's null throw is kept; the farther-out (outer) hook's later throw
    // must not overwrite it.
    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).cause).toBeNull();

    const value = flushAutocaptureRecord('click');
    expect(value.data?.$el_text).toBe(JSON.stringify('Click me'));
  });

  test('should suppress the event entirely when a hook returns capture: false', () => {
    startClient();

    const hookRoot = document.createElement('div');
    attachElementHook(hookRoot, () => ({ capture: false }));

    const button = document.createElement('button');
    button.textContent = 'Click me';
    hookRoot.appendChild(button);
    document.body.appendChild(hookRoot);

    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    vi.runAllTimers();
    // No autocapture event (and nothing else queued) means flush never calls fetch at all.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('should let a farther-out hook suppress capture even when a closer hook already contributed fields', () => {
    startClient();

    const outerElement = document.createElement('div');
    attachElementHook(outerElement, () => ({ capture: false }));

    const innerElement = document.createElement('div');
    attachElementHook(innerElement, () => ({
      context: { context_service_name: 'inner-service' },
    }));

    const button = document.createElement('button');
    button.textContent = 'Click me';
    innerElement.appendChild(button);
    outerElement.appendChild(innerElement);
    document.body.appendChild(outerElement);

    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    vi.runAllTimers();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('should land a custom data contribution namespaced under data, never clobbering an autocapture-collected key of the same name', () => {
    startClient();

    const hookRoot = document.createElement('div');
    attachElementHook(hookRoot, () => ({
      data: { checkout_flow_step: 'shipping-address', $el_tag_name: 'hacked' },
    }));

    const button = document.createElement('button');
    button.textContent = 'Click me';
    hookRoot.appendChild(button);
    document.body.appendChild(hookRoot);

    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    const value = flushAutocaptureRecord('click');
    // Custom data lands namespaced inside `data`, not flat on the record.
    expect(value).not.toHaveProperty('checkout_flow_step');
    expect(value.data?.checkout_flow_step).toBe(JSON.stringify('shipping-address'));
    // Autocapture's own collected key always wins over a hook's attempt to clobber it.
    expect(value.data?.$el_tag_name).toBe(JSON.stringify('button'));
  });

  test("should strip $-prefixed keys from a hook's data contribution, keeping other keys", () => {
    startClient();

    const hookRoot = document.createElement('div');
    attachElementHook(hookRoot, () => ({
      // `$el_reserved` is not a key autocapture itself ever collects, so its absence below can
      // only be explained by the reserved-prefix strip, not by autocapture's own spread-last
      // precedence (already covered by the $el_tag_name clobber test above).
      data: { $el_reserved: 'x', ok: 1 },
    }));

    const button = document.createElement('button');
    button.textContent = 'Click me';
    hookRoot.appendChild(button);
    document.body.appendChild(hookRoot);

    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    const value = flushAutocaptureRecord('click');
    // The `$` prefix is reserved for autocapture's own keys: a hook's attempt to set one is
    // dropped before it ever reaches the merged record.
    expect(value.data).not.toHaveProperty('$el_reserved');
    expect(value.data?.ok).toBe(JSON.stringify(1));
  });

  test('should ignore reserved keys a hook attempts to set on context, keeping their real values', () => {
    const telemetry = startClient();
    telemetry.identify('real-user-id');

    const hookRoot = document.createElement('div');
    attachElementHook(hookRoot, () => ({
      // A hook can only reach these via a type-unsafe caller (an untyped consumer, or one on an
      // older build of the type) — the compile-time block already limits `context` to the three
      // attribution fields for a typed one.
      context: {
        name: 'hacked-event-name',
        context_user_id: 'hacked-user-id',
      } as unknown as Exclude<TelemetryElementHookResult, void>['context'],
    }));

    const button = document.createElement('button');
    button.textContent = 'Click me';
    hookRoot.appendChild(button);
    document.body.appendChild(hookRoot);

    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    const value = flushAutocaptureRecord('click');
    // The event's real name (set by autocapture itself) survives the hook's attempt to override it.
    expect(value.name).toBe('autocapture_click');
    // The real identified user survives the hook's attempt to impersonate a different one.
    expect(value.context_user_id).toBe('real-user-id');
  });

  test('should treat a non-object context or data contribution as no contribution at all', () => {
    startClient();

    const hookRoot = document.createElement('div');
    attachElementHook(
      hookRoot,
      () =>
        // A type-unsafe caller could return non-object `context`/`data` at runtime even though the
        // type only allows objects.
        ({
          context: 'not-an-object',
          data: 'also-not-an-object',
        }) as unknown as Exclude<TelemetryElementHookResult, void>,
    );

    const button = document.createElement('button');
    button.textContent = 'Click me';
    hookRoot.appendChild(button);
    document.body.appendChild(hookRoot);

    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    const value = flushAutocaptureRecord('click');
    // Falls back to the shell, exactly as if no hook were registered at all.
    expect(value.context_service_name).toBe(mockAppInfo.appName);
    // Never destructured into numeric-index garbage keys.
    expect(value.data).not.toHaveProperty('0');
  });

  test.each([
    ['a bare attribute', ''],
    ['the value "true"', 'true'],
    ['the value "false"', 'false'],
    ['an unrecognized value', 'yes'],
  ])('should suppress capture when an ancestor carries %s', (_label, value) => {
    startClient();

    const noCaptureAncestor = document.createElement('div');
    noCaptureAncestor.setAttribute('data-telemetry-no-capture', value);

    const button = document.createElement('button');
    button.textContent = 'Click me';
    noCaptureAncestor.appendChild(button);
    document.body.appendChild(noCaptureAncestor);

    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    vi.runAllTimers();
    // No autocapture event (and nothing else queued) means flush never calls fetch at all.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('should remove its listeners with the capture flag they were added with on destroy', () => {
    // Asserted on the call arguments rather than by dispatching an event after destroy():
    // removeEventListener only unregisters a listener whose capture flag matches, and happy-dom
    // does not enforce that, so a behavioural assertion passes even when the flag is missing —
    // which is exactly how this shipped. A real browser keeps firing the handler forever.
    const removeSpy = vi.spyOn(document, 'removeEventListener');

    const telemetry = createTelemetry(mockAppInfo);
    telemetry.start();
    telemetry.destroy();

    for (const eventType of ['submit', 'change', 'click']) {
      const call = removeSpy.mock.calls.find(([type]) => type === eventType);
      expect(call, `no removeEventListener call for "${eventType}"`).toBeDefined();
      expect(call![2]).toMatchObject({ capture: true });
    }

    removeSpy.mockRestore();
  });
});
