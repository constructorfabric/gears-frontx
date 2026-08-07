// @vitest-environment node

/**
 * Tests for the rule that keeps a template's own example and scaffold MFE
 * packages out of the running application (constructorfabric/gears-frontx#550).
 *
 * Both the manifest generator and the dev orchestrator decide from these two
 * functions, so what they answer is the whole contract: a package the template
 * ships to be read and copied contributes no extension to an applied project,
 * and the environment variable is the only way back in.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  TEMPLATE_EXAMPLES_ENV_VAR,
  isTemplateExamplePackage,
  templateExamplesIncluded,
} from '../scripts/lib/mfe-tools';

let workspace: string;

/**
 * Writes a package directory holding `body` as its `mfe.json` and returns the
 * package path. The body is a raw string rather than an object so a case can
 * write a manifest that is not valid JSON.
 */
function packageWithMfeJson(name: string, body: string): string {
  const packagePath = join(workspace, name);
  mkdirSync(packagePath);
  writeFileSync(join(packagePath, 'mfe.json'), body, 'utf-8');
  return packagePath;
}

beforeEach(() => {
  workspace = mkdtempSync(join(tmpdir(), 'frontx-mfe-packages-'));
});

afterEach(() => {
  rmSync(workspace, { recursive: true, force: true });
});

describe('isTemplateExamplePackage', () => {
  it('reports a package as example content when its mfe.json declares templateExample', () => {
    const packagePath = packageWithMfeJson('example-mfe', '{ "templateExample": true, "extensions": [] }');

    expect(isTemplateExamplePackage(packagePath)).toBe(true);
  });

  it('reports a package as product content when its mfe.json declares no flag', () => {
    const packagePath = packageWithMfeJson('product-mfe', '{ "extensions": [] }');

    expect(isTemplateExamplePackage(packagePath)).toBe(false);
  });

  // An unparseable manifest belongs to the generator, which names the package
  // and quotes the parse error. Answering "example" here would drop the package
  // before it ever reached that message.
  it('keeps a package with an unparseable mfe.json in discovery', () => {
    const packagePath = packageWithMfeJson('broken-mfe', '{ not json');

    expect(isTemplateExamplePackage(packagePath)).toBe(false);
  });
});

describe('templateExamplesIncluded', () => {
  it('includes example packages for either accepted spelling of the variable', () => {
    expect(templateExamplesIncluded({ [TEMPLATE_EXAMPLES_ENV_VAR]: '1' })).toBe(true);
    expect(templateExamplesIncluded({ [TEMPLATE_EXAMPLES_ENV_VAR]: 'TRUE' })).toBe(true);
  });

  it('excludes example packages when the variable is unset or carries any other value', () => {
    expect(templateExamplesIncluded({})).toBe(false);
    expect(templateExamplesIncluded({ [TEMPLATE_EXAMPLES_ENV_VAR]: '0' })).toBe(false);
  });
});
