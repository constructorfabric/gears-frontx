import type { TelemetryLoggerService } from './logger';
import type { TelemetryConfigNormalized } from './types';

type UrlRedactionContext = {
  config: Pick<TelemetryConfigNormalized, 'redactUrls' | 'sanitizeUrl'>;
  logger: TelemetryLoggerService;
};

// A JWT's first segment is base64 of `{"`, which always encodes to a leading `eyJ`. Anchoring on it
// keeps a dotted hostname (`www.example.com`) from reading as a three-part token.
const valueRules: [RegExp, string][] = [
  [/^[^/@\s]+@[^/@\s]+\.[a-z]{2,}$/i, ':email'],
  [/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, ':uuid'],
  [/^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/, ':token'],
  [/^\d{5,}$/, ':id'],
  [/^[0-9a-f]{16,}$/i, ':hash'],
];

// @cpt-algo:cpt-frontx-telemetry-algo-event-collection-url-redaction:p2
// @cpt-dod:cpt-frontx-telemetry-dod-event-collection-url-redaction:p2
export function redactUrl(url: string, { config, logger }: UrlRedactionContext): string {
  const { redactUrls, sanitizeUrl } = config;

  // @cpt-begin:cpt-frontx-telemetry-algo-event-collection-url-redaction:p2:inst-check-host-hook
  if (!sanitizeUrl) {
    // @cpt-begin:cpt-frontx-telemetry-algo-event-collection-url-redaction:p2:inst-check-patterns-enabled
    return redactUrls ? applyRules(url) : url;
    // @cpt-end:cpt-frontx-telemetry-algo-event-collection-url-redaction:p2:inst-check-patterns-enabled
  }

  let sanitized: string;

  try {
    // @cpt-begin:cpt-frontx-telemetry-algo-event-collection-url-redaction:p2:inst-apply-host-hook
    sanitized = sanitizeUrl(url);
    // @cpt-end:cpt-frontx-telemetry-algo-event-collection-url-redaction:p2:inst-apply-host-hook
  } catch (error: unknown) {
    // @cpt-begin:cpt-frontx-telemetry-algo-event-collection-url-redaction:p2:inst-recover-host-hook
    // Returning the raw url here would publish the values the host asked to have removed, so the
    // built-in patterns run even where configuration leaves them off.
    logger.logError('Telemetry sanitizeUrl threw; falling back to the built-in patterns.', error);
    return applyRules(url);
    // @cpt-end:cpt-frontx-telemetry-algo-event-collection-url-redaction:p2:inst-recover-host-hook
  }
  // @cpt-end:cpt-frontx-telemetry-algo-event-collection-url-redaction:p2:inst-check-host-hook

  return redactUrls ? applyRules(sanitized) : sanitized;
}

function applyRules(url: string): string {
  // @cpt-begin:cpt-frontx-telemetry-algo-event-collection-url-redaction:p2:inst-split-url
  const hashAt = url.indexOf('#');
  const beforeHash = hashAt === -1 ? url : url.slice(0, hashAt);
  const hash = hashAt === -1 ? '' : `#${redactPath(url.slice(hashAt + 1))}`;

  const queryAt = beforeHash.indexOf('?');
  const path = queryAt === -1 ? beforeHash : beforeHash.slice(0, queryAt);
  const query = queryAt === -1 ? '' : `?${redactQuery(beforeHash.slice(queryAt + 1))}`;

  // @cpt-end:cpt-frontx-telemetry-algo-event-collection-url-redaction:p2:inst-split-url

  // @cpt-begin:cpt-frontx-telemetry-algo-event-collection-url-redaction:p2:inst-return-redacted
  return `${redactPath(path)}${query}${hash}`;
  // @cpt-end:cpt-frontx-telemetry-algo-event-collection-url-redaction:p2:inst-return-redacted
}

function redactPath(path: string): string {
  return path
    .split('/')
    .map((segment) => (segment ? redactValue(segment) : segment))
    .join('/');
}

function redactQuery(query: string): string {
  return query
    .split('&')
    .map((pair) => {
      const separatorAt = pair.indexOf('=');

      if (separatorAt === -1) {
        return pair;
      }

      const name = pair.slice(0, separatorAt);
      const value = pair.slice(separatorAt + 1);

      return `${name}=${redactValue(value)}`;
    })
    .join('&');
}

function redactValue(value: string): string {
  // @cpt-begin:cpt-frontx-telemetry-algo-event-collection-url-redaction:p2:inst-replace-values
  const decoded = decode(value);

  for (const [pattern, placeholder] of valueRules) {
    if (pattern.test(decoded)) {
      return placeholder;
    }
  }

  return value;
  // @cpt-end:cpt-frontx-telemetry-algo-event-collection-url-redaction:p2:inst-replace-values
}

function decode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
