import { describe, expect, it } from 'vitest';
import { ERROR_CODES, err, ok } from '../envelope';
import type { Envelope, ErrorCode } from '../envelope';

describe('ok', () => {
  it('produces {ok: true, data}', () => {
    expect(ok({ templates: ['auth'] })).toEqual({ ok: true, data: { templates: ['auth'] } });
  });
});

describe('err', () => {
  it('produces the failure shape with details omitted when not given', () => {
    const result = err('TEMPLATE_NOT_REGISTERED', 'no entry named "auth"');

    expect(result).toEqual({
      ok: false,
      error: { code: 'TEMPLATE_NOT_REGISTERED', message: 'no entry named "auth"' },
    });
    expect('details' in result.error).toBe(false);
  });

  it('produces the failure shape with details included when given', () => {
    const result = err('TARGET_CONFLICT', 'path already claimed', { path: 'apps/web', contestingTarget: 'auth' });

    expect(result).toEqual({
      ok: false,
      error: {
        code: 'TARGET_CONFLICT',
        message: 'path already claimed',
        details: { path: 'apps/web', contestingTarget: 'auth' },
      },
    });
  });

  it('every one of the eighteen ADR-fixed codes constructs a valid envelope, and the list is exactly the ADR list', () => {
    // The ADR's eighteen, spelled here independently of `ERROR_CODES` so a code
    // dropped from or added to the list without amending the ADR is caught.
    const adrCodes: Record<ErrorCode, true> = {
      INVALID_MANIFEST: true,
      VERSION_MISMATCH: true,
      TEMPLATE_NOT_REGISTERED: true,
      TARGET_CONFLICT: true,
      CONTENT_CONFLICT: true,
      EXISTING_PATHS_REQUIRE_DECISION: true,
      CONFIRMATION_REQUIRED: true,
      ORIGIN_UNAVAILABLE: true,
      PROJECT_INVALID: true,
      REGISTRATION_CONFLICT: true,
      TARGETS_EXIST: true,
      TARGET_NOT_APPLIED: true,
      INVALID_PATH: true,
      NOTHING_TO_RESTORE: true,
      INVALID_INPUT: true,
      RECOVERY_REQUIRED: true,
      RESOURCE_BUSY: true,
      INTERNAL: true,
    };
    expect([...ERROR_CODES].sort()).toEqual(Object.keys(adrCodes).sort());
    expect(ERROR_CODES).toHaveLength(18);
    expect(new Set(ERROR_CODES).size).toBe(18);

    for (const code of ERROR_CODES) {
      expect(err(code, 'message')).toEqual({ ok: false, error: { code, message: 'message' } });
    }
  });
});

// Compile-time-only check that `ErrorCode` is a closed literal union: if
// 'NOT_A_REAL_CODE' were assignable to it, `IsNotAssignable` below would
// resolve to `never` and the following assignment would fail to compile.
// Written this way rather than with `// @ts-expect-error` because this
// repository's eslint config (`@typescript-eslint/ban-ts-comment`) disallows
// that directive outside a couple of already-`TODO`-tracked exceptions
// unrelated to this package.
type IsNotAssignable<T, U> = T extends U ? never : true;
const errorCodeIsClosed: IsNotAssignable<'NOT_A_REAL_CODE', ErrorCode> = true;

describe('ErrorCode', () => {
  it('is a closed literal union — a code outside the fixed vocabulary is a compile-time error', () => {
    expect(errorCodeIsClosed).toBe(true);
  });

  it('ok/false is a two-way discriminant a caller can narrow on', () => {
    const envelope: Envelope<{ n: number }> = ok({ n: 1 });
    if (envelope.ok) {
      expect(envelope.data.n).toBe(1);
    } else {
      throw new Error('expected the ok branch');
    }
  });
});
