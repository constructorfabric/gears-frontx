import { describe, expect, test, vi } from 'vitest';
import { createLogger } from '../utils/logger';
import { redactUrl } from '../utils/url';
import type { TelemetryConfig } from '../utils/types';
import { normalizeOptions } from '../utils/utils';

function contextFor(overrides: Partial<TelemetryConfig> = {}) {
  const config = normalizeOptions({ appName: 'cloud', appVersion: '1.0.0', ...overrides });

  return { config, logger: createLogger(config) };
}

describe('redactUrl', () => {
  test('returns the url untouched when redaction is off', () => {
    expect(redactUrl('/users/john@x.com', contextFor())).toBe('/users/john@x.com');
  });

  test('replaces an email segment', () => {
    expect(redactUrl('/invite/john@x.com/accept', contextFor({ redactUrls: true }))).toBe(
      '/invite/:email/accept',
    );
  });

  test('replaces a uuid segment', () => {
    expect(
      redactUrl('/orgs/9f8e7d6c-1a2b-4c3d-8e9f-0a1b2c3d4e5f', contextFor({ redactUrls: true })),
    ).toBe('/orgs/:uuid');
  });

  test('replaces a long hex segment', () => {
    expect(redactUrl('/files/9f8e7d6c1a2b4c3d8e9f', contextFor({ redactUrls: true }))).toBe(
      '/files/:hash',
    );
  });

  test('replaces a jwt segment', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NSJ9.dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1g';

    expect(redactUrl(`/confirm/${jwt}`, contextFor({ redactUrls: true }))).toBe('/confirm/:token');
  });

  test('replaces a digit segment of five or more', () => {
    expect(redactUrl('/users/12345/edit', contextFor({ redactUrls: true }))).toBe(
      '/users/:id/edit',
    );
  });

  test('leaves a four-digit year alone', () => {
    expect(redactUrl('/reports/2026/q3', contextFor({ redactUrls: true }))).toBe('/reports/2026/q3');
  });

  test('leaves a title-cased slug carrying a number alone', () => {
    expect(
      redactUrl('/docs/Chapter-2-Introduction-To-Telemetry', contextFor({ redactUrls: true })),
    ).toBe('/docs/Chapter-2-Introduction-To-Telemetry');
  });

  test('redacts query parameter values while keeping names and benign values', () => {
    expect(
      redactUrl('/search?q=john@x.com&page=2&user=98765', contextFor({ redactUrls: true })),
    ).toBe('/search?q=:email&page=2&user=:id');
  });

  test('redacts a percent-encoded email in a query value', () => {
    expect(redactUrl('/share?to=john%40x.com', contextFor({ redactUrls: true }))).toBe(
      '/share?to=:email',
    );
  });

  test('redacts hash-router segments', () => {
    expect(redactUrl('/app#/users/john@x.com', contextFor({ redactUrls: true }))).toBe(
      '/app#/users/:email',
    );
  });

  test('runs sanitizeUrl before the built-in patterns and sweeps its output', () => {
    const sanitizeUrl = vi.fn((url: string) => url.replace(/^\/o\/\d{1,4}/, '/o/:orgId'));

    expect(
      redactUrl('/o/42/users/john@x.com', contextFor({ redactUrls: true, sanitizeUrl })),
    ).toBe('/o/:orgId/users/:email');
    expect(sanitizeUrl).toHaveBeenCalledWith('/o/42/users/john@x.com');
  });

  test('returns the host output untouched when only sanitizeUrl is configured', () => {
    const sanitizeUrl = (url: string) => url.replace('/12345', '/:id');

    expect(redactUrl('/users/12345/john@x.com', contextFor({ sanitizeUrl }))).toBe(
      '/users/:id/john@x.com',
    );
  });

  test('falls back to the built-in patterns when sanitizeUrl throws', () => {
    const sanitizeUrl = () => {
      throw new Error('router lookup failed');
    };

    expect(redactUrl('/users/john@x.com', contextFor({ sanitizeUrl }))).toBe('/users/:email');
  });

  test('reports a throwing sanitizeUrl through the logger', () => {
    const sanitizeUrl = () => {
      throw new Error('router lookup failed');
    };
    const context = contextFor({ sanitizeUrl, verbose: true });
    const logError = vi.spyOn(context.logger, 'logError');

    redactUrl('/users/12345', context);

    expect(logError).toHaveBeenCalled();
  });
});
