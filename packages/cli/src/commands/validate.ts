// @cpt-flow:cpt-frontx-flow-template-manifest-validate-for-publication:p1
// @cpt-dod:cpt-frontx-dod-template-manifest-validate-command:p1
import type { ManifestViolation, ReadFileFn } from '../manifest/types.js';
import { MANIFEST_FILENAME } from '../manifest/types.js';
import { validateManifestContract } from '../manifest/validate-contract.js';

export interface ValidateCommandResult {
  ok: boolean;
  exitCode: 0 | 1;
  message: string;
  violations?: ManifestViolation[];
}

// @cpt-begin:cpt-frontx-flow-template-manifest-validate-for-publication:p1:inst-invoke-validate
export async function validateCommand(
  templateDir: string,
  readFileFn: ReadFileFn,
): Promise<ValidateCommandResult> {
  // @cpt-end:cpt-frontx-flow-template-manifest-validate-for-publication:p1:inst-invoke-validate

  // @cpt-begin:cpt-frontx-flow-template-manifest-validate-for-publication:p1:inst-locate-manifest
  const manifestPath = `${templateDir}/${MANIFEST_FILENAME}`;
  // @cpt-end:cpt-frontx-flow-template-manifest-validate-for-publication:p1:inst-locate-manifest

  let raw: string;
  try {
    raw = await readFileFn(manifestPath);
  } catch {
    // @cpt-begin:cpt-frontx-flow-template-manifest-validate-for-publication:p1:inst-if-manifest-absent
    // @cpt-begin:cpt-frontx-flow-template-manifest-validate-for-publication:p1:inst-return-manifest-absent
    return {
      ok: false,
      exitCode: 1,
      message: `manifest not found: ${manifestPath}`,
    };
    // @cpt-end:cpt-frontx-flow-template-manifest-validate-for-publication:p1:inst-return-manifest-absent
    // @cpt-end:cpt-frontx-flow-template-manifest-validate-for-publication:p1:inst-if-manifest-absent
  }

  // @cpt-begin:cpt-frontx-flow-template-manifest-validate-for-publication:p1:inst-delegate-to-algo
  const result = validateManifestContract(raw);
  // @cpt-end:cpt-frontx-flow-template-manifest-validate-for-publication:p1:inst-delegate-to-algo

  // @cpt-begin:cpt-frontx-flow-template-manifest-validate-for-publication:p1:inst-if-rejected
  if (result.status === 'REJECTED') {
    // @cpt-begin:cpt-frontx-flow-template-manifest-validate-for-publication:p1:inst-report-violations
    const summary = result.violations
      .map((v) => `  [${v.field}] ${v.message}`)
      .join('\n');
    // @cpt-end:cpt-frontx-flow-template-manifest-validate-for-publication:p1:inst-report-violations
    // @cpt-begin:cpt-frontx-flow-template-manifest-validate-for-publication:p1:inst-return-fail
    return {
      ok: false,
      exitCode: 1,
      message: `FAIL: manifest validation failed with ${result.violations.length} violation(s):\n${summary}`,
      violations: result.violations,
    };
    // @cpt-end:cpt-frontx-flow-template-manifest-validate-for-publication:p1:inst-return-fail
  }
  // @cpt-end:cpt-frontx-flow-template-manifest-validate-for-publication:p1:inst-if-rejected

  // @cpt-begin:cpt-frontx-flow-template-manifest-validate-for-publication:p1:inst-else-pass
  // @cpt-begin:cpt-frontx-flow-template-manifest-validate-for-publication:p1:inst-report-pass
  // @cpt-begin:cpt-frontx-flow-template-manifest-validate-for-publication:p1:inst-return-pass
  return {
    ok: true,
    exitCode: 0,
    message: 'PASS: manifest conforms to the template contract',
  };
  // @cpt-end:cpt-frontx-flow-template-manifest-validate-for-publication:p1:inst-return-pass
  // @cpt-end:cpt-frontx-flow-template-manifest-validate-for-publication:p1:inst-report-pass
  // @cpt-end:cpt-frontx-flow-template-manifest-validate-for-publication:p1:inst-else-pass
}
