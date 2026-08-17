import { afterEach, beforeEach, describe, expect, onTestFinished, test, vi } from 'vitest';
import { createTelemetry } from '../index';
import type { LocaleSource } from '../plugins/locale';
import { telemetryLocalePlugin, normalizeLocale } from '../plugins/locale';
import type {
  TelemetryApiPayload,
  TelemetryApiPayloadV2,
  TelemetryApiRecord,
  TelemetryEventRecord,
} from '../utils/eventTypes';
import { getSessionKey } from '../utils/sessionUtils';
import type { TelemetrySession } from '../utils/types';

const mockLocaleSource: LocaleSource = {
  language: 'en-US',
};

const windowSize = {
  width: 800,
  height: 400,
};

const mockSession: TelemetrySession = {
  id: 'test-id',
  lastActivity: Date.now(),
  startTime: Date.now(),
};

const mockUserInfo = {
  id: 'user-123',
};

const mockAppInfo = {
  appName: 'test-app',
  appVersion: '1.0.0',
};

const mockedUid = 'mock-uuid-asd-asd-asd';

describe('Telemetry Client', () => {
  // Mock fetch API
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({}),
  });

  beforeEach(() => {
    // Setup fetch mock
    vi.stubGlobal('fetch', fetchMock);

    // Mock crypto
    const mockCrypto = {
      randomUUID: vi.fn().mockReturnValue(mockedUid),
    };
    vi.stubGlobal('crypto', mockCrypto);

    // Mock window.innerWidth
    vi.spyOn(window, 'innerWidth', 'get').mockImplementation(() => windowSize.width);
    vi.spyOn(window, 'innerHeight', 'get').mockImplementation(() => windowSize.height);
    vi.spyOn(navigator, 'userAgent', 'get').mockImplementation(
      () =>
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    );

    // Mock localStorage
    const mockStorage: Record<string, string> = {};
    const mockLocalStorage = {
      getItem: vi.fn((key: string) => {
        return mockStorage[key] || null;
      }),
      setItem: vi.fn((key: string, value: string) => {
        mockStorage[key] = value;
      }),
      clear: vi.fn(() => {
        Object.keys(mockStorage).forEach((key) => delete mockStorage[key]);
      }),
      removeItem: vi.fn((key: string) => {
        delete mockStorage[key];
      }),
      key: vi.fn((index: number) => Object.keys(mockStorage)[index] || null),
      get length() {
        return Object.keys(mockStorage).length;
      },
    };
    vi.stubGlobal('localStorage', mockLocalStorage);

    // Reset mocks before each test
    fetchMock.mockClear();
    vi.clearAllMocks();

    // Setup fake timers
    vi.useFakeTimers();

    // Mock requestIdleCallback and cancelIdleCallback
    const mockRequestIdleCallback = vi
      .fn()
      .mockImplementation((cb: () => void) => setTimeout(cb, 0));
    const mockCancelIdleCallback = vi.fn().mockImplementation((id) => clearTimeout(id));
    vi.stubGlobal('requestIdleCallback', mockRequestIdleCallback);
    vi.stubGlobal('cancelIdleCallback', mockCancelIdleCallback);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  test('Should initialize with default plugins', () => {
    localStorage.setItem(getSessionKey(), JSON.stringify(mockSession));

    const telemetry = createTelemetry({ ...mockAppInfo });
    const chain = ['a', 'b', 'service_test'];
    telemetry.start();
    onTestFinished(() => telemetry.destroy());

    // Run all timers to trigger the flush
    vi.runAllTimers();

    // Verify fetch was called
    expect(fetchMock).toHaveBeenCalledTimes(0); // we had session so no session_start event

    telemetry.logEvent({
      name: 'test_event',
      data: { test: 'data' },
      context_service_name: 'service_test',
      context_service_version: 'service_test_version',
      context_call_chain: chain,
    });

    expect(fetchMock).toHaveBeenCalledTimes(0);

    vi.runAllTimers();

    expect(fetchMock).toHaveBeenCalledTimes(1);

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/events',
      expect.objectContaining({
        method: 'POST',
        keepalive: true,
        headers: expect.objectContaining({
          'Content-Type': 'application/vnd.kafka.json.v2+json',
        }),
      }),
    );

    const payload: TelemetryApiPayload = JSON.parse(fetchMock.mock.calls[0][1].body);

    // Verify the event has the expected data
    expect(payload.records[0]).toMatchObject({
      key: mockedUid,
      value: {
        data: { test: '"data"' },
        context_service_name: 'service_test',
        context_service_version: 'service_test_version',
        context_call_chain: [mockAppInfo.appName, ...chain],
      },
    } satisfies TelemetryApiRecord);

    // Find the test_event record
    const testEvent = payload.records.find((record) => record.value.name === 'test_event');
    expect(testEvent).toBeDefined();
    // Verify session context is added
    expect(testEvent!.value).toHaveProperty('context_session_id', mockSession.id);
  });

  test("should not let a caller-supplied id or time_triggered override the event's real identity", () => {
    localStorage.setItem(getSessionKey(), JSON.stringify(mockSession));

    const telemetry = createTelemetry({ ...mockAppInfo });
    telemetry.start();
    onTestFinished(() => telemetry.destroy());

    telemetry.logEvent({
      name: 'test_event',
      // A type-unsafe caller could still pass these at runtime even though `TelemetryEventRecord`
      // doesn't type them.
      id: 'attacker-supplied-id',
      time_triggered: 1,
    } as unknown as TelemetryEventRecord);

    vi.runAllTimers();

    const payload: TelemetryApiPayload = JSON.parse(fetchMock.mock.calls[0][1].body);
    const testEvent = payload.records.find((record) => record.value.name === 'test_event');
    expect(testEvent).toBeDefined();
    expect(testEvent!.value.id).toBe(mockedUid);
    expect(testEvent!.value.time_triggered).not.toBe(1);
  });

  test('Should register and use all available plugins', () => {
    const telemetry = createTelemetry({
      ...mockAppInfo,
      url: '/api/test',
      sessionDuration: 12345678,
    });

    // Register all plugins
    telemetry.plugin(telemetryLocalePlugin(mockLocaleSource));

    telemetry.identify(mockUserInfo.id);
    telemetry.start();
    onTestFinished(() => telemetry.destroy());

    // Run all timers to trigger the flush
    vi.runAllTimers();

    // Verify fetch was called
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('/api/test', expect.any(Object));

    // Parse the payload
    const payload: TelemetryApiPayload = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(payload).toHaveProperty('records');

    // Check that records exist
    expect(payload.records.length).toEqual(1);

    expect(payload.records[0]).toStrictEqual({
      key: mockedUid,
      value: {
        context_app_name: mockAppInfo.appName,
        context_app_version: mockAppInfo.appVersion,
        context_source_app_name: mockAppInfo.appName,
        context_source_app_version: mockAppInfo.appVersion,
        context_service_name: mockAppInfo.appName,
        context_service_version: mockAppInfo.appVersion,
        context_call_chain: [mockAppInfo.appName],
        context_client_name: 'Chrome',
        context_client_version: '120.0.0.0',
        context_client_viewport_height: windowSize.height,
        context_client_viewport_width: windowSize.width,
        context_device_id: mockedUid,
        context_language: mockLocaleSource.language,
        context_os_name: 'macOS',
        context_os_platform: 'desktop',
        context_os_version: '10.15.7',
        context_session_id: mockedUid,
        context_session_started_time: expect.any(Number),
        context_timezone_name: 'UTC',
        context_timezone_utc_offset: 0,
        context_user_data: {
          app_platform: '"Web"',
          locale: '"en-US"',
          mobile_web: 'false',
          session_duration: '12345678',
        },
        context_user_id: mockUserInfo.id,
        id: mockedUid,
        name: 'session_start',
        time_sent: expect.any(Number),
        time_triggered: expect.any(Number),
      },
    } satisfies TelemetryApiRecord);
  });

  test('Should not send events when disabled', () => {
    const telemetry = createTelemetry({ ...mockAppInfo, enabled: false });
    telemetry.start();
    onTestFinished(() => telemetry.destroy());

    // Log an event
    telemetry.logEvent('test_event');

    // Run all timers to trigger the flush
    vi.runAllTimers();

    // Verify fetch was not called
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('Should test v2', () => {
    const chain = ['a', 'b', 'service_test'];
    const telemetry = createTelemetry({
      ...mockAppInfo,
      apiVersion: 2,
      sessionDuration: 12345678,
    });

    // Register all plugins
    telemetry.plugin(telemetryLocalePlugin(mockLocaleSource));

    telemetry.identify(mockUserInfo.id);
    telemetry.start();
    onTestFinished(() => telemetry.destroy());

    telemetry.logEvent({
      name: 'test_event',
      data: { test: 'data' },
      context_service_name: 'service_test',
      context_call_chain: chain,
      context_service_version: 'service_test_version',
      context_tenant_id: '1',
    });

    // Run all timers to trigger the flush
    vi.runAllTimers();

    // Verify fetch was called
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('/api/telemetry/v2/events', expect.any(Object));

    // Parse the payload
    const payload: TelemetryApiPayloadV2 = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(payload).toHaveProperty('records');
    expect(payload.records).length(2);
    expect(payload).toHaveProperty('meta');
  });

  test('should remove context fields', () => {
    const chain = ['a', 'b', 'service_test'];
    const telemetry = createTelemetry({
      ...mockAppInfo,
      apiVersion: 2,
      sessionDuration: 12345678,
    });
    // Register all plugins
    telemetry.plugin(telemetryLocalePlugin(mockLocaleSource));

    telemetry.identify(mockUserInfo.id);
    telemetry.start();
    onTestFinished(() => telemetry.destroy());

    telemetry.logEvent({
      name: 'test_event',
      data: { test: 'data' },
      context_service_name: 'service_test',
      context_call_chain: chain,
      context_service_version: 'service_test_version',
      context_user_id: 'user123',
      context_tenant_id: 'tenant456',
    });

    // Run all timers to trigger the flush
    vi.runAllTimers();
    const payload: TelemetryApiPayloadV2 = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(payload).toHaveProperty('records');
    expect(payload.records[0]).not.toHaveProperty('context_user_id');
    expect(payload.records[0]).not.toHaveProperty('context_tenant_id');
  });

  test('should handle single event', () => {
    const telemetry = createTelemetry({
      ...mockAppInfo,
      apiVersion: 2,
      sessionDuration: 12345678,
    });
    // Register all plugins
    telemetry.plugin(telemetryLocalePlugin(mockLocaleSource));

    telemetry.identify(mockUserInfo.id);
    telemetry.start();
    onTestFinished(() => telemetry.destroy());

    // Run all timers to trigger the flush
    vi.runAllTimers();
    const payload: TelemetryApiPayloadV2 = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(payload).toHaveProperty('records');
    expect(payload).toHaveProperty('meta');
    expect(payload.meta).toEqual({});
  });

  test('should extract common values to meta', () => {
    const chain = ['a', 'b', 'service_test'];
    const telemetry = createTelemetry({
      ...mockAppInfo,
      apiVersion: 2,
      sessionDuration: 12345678,
    });

    telemetry.logEvent({
      name: 'session_start',
      data: { test: 'data' },
      context_service_name: 'service_test',
      context_call_chain: chain,
      context_service_version: 'service_test_version',
    });

    telemetry.logEvent({
      name: 'session_start',
      data: { test: 'data' },
      context_service_name: 'service_test_1',
      context_call_chain: chain,
      context_service_version: 'service_test_version_1',
    });

    // Register all plugins
    telemetry.plugin(telemetryLocalePlugin(mockLocaleSource));

    telemetry.identify(mockUserInfo.id);
    telemetry.start();
    onTestFinished(() => telemetry.destroy());

    // Run all timers to trigger the flush
    vi.runAllTimers();
    const payload: TelemetryApiPayloadV2 = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(payload.meta.name).toEqual('session_start');
    expect(payload.records).toHaveLength(3);
    expect(payload.records[0]).not.toHaveProperty('name');
    expect(payload.records[1]).not.toHaveProperty('name');
  });

  test('should use the locale source language for context_language when locale plugin is registered', () => {
    vi.spyOn(navigator, 'language', 'get').mockImplementation(() => 'es-ES');

    const telemetry = createTelemetry({
      ...mockAppInfo,
      apiVersion: 2,
      sessionDuration: 12345678,
    });

    telemetry.plugin(telemetryLocalePlugin(mockLocaleSource));
    telemetry.identify(mockUserInfo.id);
    telemetry.start();
    onTestFinished(() => telemetry.destroy());

    vi.runAllTimers();

    const payload: TelemetryApiPayloadV2 = JSON.parse(fetchMock.mock.calls[0][1].body);

    const record = payload.records[0];
    expect(record.context_language).toBe('en-US');
    expect(record.context_language).not.toBe('es-ES');

    expect(record.context_user_data).toBeDefined();
    expect(record.context_user_data?.locale).toBe('"es-ES"');
  });

  test('should flush queued events on destroy() without waiting for the timer', () => {
    const telemetry = createTelemetry(mockAppInfo);
    telemetry.start();

    telemetry.logEvent('logged_before_destroy');
    expect(fetchMock).not.toHaveBeenCalled();

    telemetry.destroy();

    // No timer was advanced — destroy() itself sent the batch.
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const payload: TelemetryApiPayload = JSON.parse(fetchMock.mock.calls[0][1].body);
    const names = payload.records.map((r: TelemetryApiRecord) => r.value.name);

    expect(names).toContain('logged_before_destroy');
  });

  test('should send an event logged from a plugin destroy hook', () => {
    const telemetry = createTelemetry(mockAppInfo);

    telemetry.plugin({
      name: 'parting',
      setup: (context) => {
        context.addHook('destroy', () => {
          context.logEvent('parting_event');
        });
      },
    });

    telemetry.start();
    telemetry.destroy();

    const payload: TelemetryApiPayload = JSON.parse(fetchMock.mock.calls[0][1].body);
    const names = payload.records.map((r: TelemetryApiRecord) => r.value.name);

    expect(names).toContain('parting_event');
  });

  test('should ignore a repeated start()', () => {
    let hookCalls = 0;
    const telemetry = createTelemetry(mockAppInfo);

    telemetry.plugin({
      name: 'counter',
      setup: (context) => {
        context.addHook('event', (record) => {
          if (record.name === 'counted_event') {
            hookCalls += 1;
          }
        });
      },
    });

    telemetry.start();
    telemetry.start();
    onTestFinished(() => telemetry.destroy());

    telemetry.logEvent('counted_event');
    vi.runAllTimers();

    expect(hookCalls).toBe(1);

    const payload: TelemetryApiPayload = JSON.parse(fetchMock.mock.calls[0][1].body);
    const counted = payload.records.filter(
      (r: TelemetryApiRecord) => r.value.name === 'counted_event',
    );

    expect(counted).toHaveLength(1);
  });

  test('should still start when localStorage reads are blocked', () => {
    vi.spyOn(localStorage, 'getItem').mockImplementation(() => {
      throw new DOMException('The operation is insecure.', 'SecurityError');
    });
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new DOMException('The operation is insecure.', 'SecurityError');
    });

    const telemetry = createTelemetry(mockAppInfo);

    expect(() => telemetry.start()).not.toThrow();
    onTestFinished(() => telemetry.destroy());

    telemetry.logEvent('after_blocked_storage');
    vi.runAllTimers();

    const payload: TelemetryApiPayload = JSON.parse(fetchMock.mock.calls[0][1].body);
    const names = payload.records.map((r: TelemetryApiRecord) => r.value.name);

    // The later built-ins still set up, so start() emitted its session event.
    expect(names).toContain('session_start');
    expect(names).toContain('after_blocked_storage');

    const record = payload.records.find(
      (r: TelemetryApiRecord) => r.value.name === 'after_blocked_storage',
    );
    expect(record?.value.context_device_id).toBe(mockedUid);
    expect(record?.value.context_os_name).toBe('macOS');
  });

  test('should keep a generated device id when it cannot be persisted', () => {
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
    });

    const telemetry = createTelemetry(mockAppInfo);

    expect(() => telemetry.start()).not.toThrow();
    onTestFinished(() => telemetry.destroy());

    telemetry.logEvent('after_quota_exceeded');
    vi.runAllTimers();

    const payload: TelemetryApiPayload = JSON.parse(fetchMock.mock.calls[0][1].body);
    const record = payload.records.find(
      (r: TelemetryApiRecord) => r.value.name === 'after_quota_exceeded',
    );

    expect(record?.value.context_device_id).toBe(mockedUid);
  });

  test('should attach a user id of 0', () => {
    const telemetry = createTelemetry(mockAppInfo);

    telemetry.identify(0);
    telemetry.start();
    onTestFinished(() => telemetry.destroy());

    telemetry.logEvent('zero_user_event');
    vi.runAllTimers();

    const payload: TelemetryApiPayload = JSON.parse(fetchMock.mock.calls[0][1].body);
    const record = payload.records.find(
      (r: TelemetryApiRecord) => r.value.name === 'zero_user_event',
    );

    expect(record?.value.context_user_id).toBe(0);
  });

  test('should normalize short locale codes to full BCP 47 format', () => {
    vi.spyOn(navigator, 'language', 'get').mockImplementation(() => 'es-ES');

    const shortLocaleSource: LocaleSource = {
      language: 'en',
    };

    const telemetry = createTelemetry({
      ...mockAppInfo,
      apiVersion: 2,
      sessionDuration: 12345678,
    });

    telemetry.plugin(telemetryLocalePlugin(shortLocaleSource));
    telemetry.identify(mockUserInfo.id);
    telemetry.start();
    onTestFinished(() => telemetry.destroy());

    vi.runAllTimers();

    const payload: TelemetryApiPayloadV2 = JSON.parse(fetchMock.mock.calls[0][1].body);

    const record = payload.records[0];
    expect(record.context_language).toBe('en-US');
  });

  test('should redact identifying values from the page view path', () => {
    const telemetry = createTelemetry({ ...mockAppInfo, redactUrls: true });

    telemetry.start();
    onTestFinished(() => telemetry.destroy());

    window.history.pushState({}, '', '/users/98765/profile');
    vi.runAllTimers();

    const payload: TelemetryApiPayload = JSON.parse(fetchMock.mock.calls[0][1].body);
    const pageView = payload.records.find((r: TelemetryApiRecord) => r.value.name === 'page_view');

    expect(pageView?.value.data).toMatchObject({ url: '"/users/:id/profile"' });
  });
});

describe('normalizeLocale', () => {
  test('should normalize short language codes', () => {
    expect(normalizeLocale('en')).toBe('en-US');
    expect(normalizeLocale('es')).toBe('es-ES');
    expect(normalizeLocale('de')).toBe('de-DE');
    expect(normalizeLocale('fr')).toBe('fr-FR');
    expect(normalizeLocale('ja')).toBe('ja-JP');
    expect(normalizeLocale('zh')).toBe('zh-CN');
  });

  test('should preserve already-full locale codes', () => {
    expect(normalizeLocale('en-US')).toBe('en-US');
    expect(normalizeLocale('en-GB')).toBe('en-GB');
    expect(normalizeLocale('zh-TW')).toBe('zh-TW');
    expect(normalizeLocale('pt-BR')).toBe('pt-BR');
  });

  test('should return input for invalid locales', () => {
    expect(normalizeLocale('invalid')).toBe('invalid');
  });
});
