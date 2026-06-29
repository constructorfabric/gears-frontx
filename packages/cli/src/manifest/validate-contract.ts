// @cpt-algo:cpt-frontx-algo-template-manifest-validate-contract:p1
import type { ManifestViolation, ManifestValidationResult, TemplateManifest } from './types.js';
import { RECOGNIZED_KINDS } from './types.js';

// Result type for manifest parsing + validation in one step.
export type ReadManifestResult =
  | { ok: true; manifest: TemplateManifest }
  | { ok: false; message: string };

// Parse and validate manifest content in one step, returning the typed manifest.
export function readManifestFromContent(content: string): ReadManifestResult {
  const validation = validateManifestContract(content);
  if (validation.status === 'REJECTED') {
    return {
      ok: false,
      message: validation.violations.map((v) => v.message).join('; '),
    };
  }
  return { ok: true, manifest: JSON.parse(content) as TemplateManifest };
}

// @cpt-begin:cpt-frontx-algo-template-manifest-validate-contract:p1:inst-read-manifest
// The raw manifest string is passed in by the caller (command layer reads the file).
// This function is pure: no filesystem access, fully testable.
export function validateManifestContract(raw: string): ManifestValidationResult {
// @cpt-end:cpt-frontx-algo-template-manifest-validate-contract:p1:inst-read-manifest
  const violations: ManifestViolation[] = [];

  // @cpt-begin:cpt-frontx-algo-template-manifest-validate-contract:p1:inst-parse-manifest
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // @cpt-begin:cpt-frontx-algo-template-manifest-validate-contract:p1:inst-if-parse-error
    // @cpt-begin:cpt-frontx-algo-template-manifest-validate-contract:p1:inst-add-parse-violation
    violations.push({ field: 'manifest', message: 'manifest is unparseable: invalid JSON' });
    // @cpt-end:cpt-frontx-algo-template-manifest-validate-contract:p1:inst-add-parse-violation
    // @cpt-begin:cpt-frontx-algo-template-manifest-validate-contract:p1:inst-return-parse-rejected
    return { status: 'REJECTED', violations };
    // @cpt-end:cpt-frontx-algo-template-manifest-validate-contract:p1:inst-return-parse-rejected
    // @cpt-end:cpt-frontx-algo-template-manifest-validate-contract:p1:inst-if-parse-error
  }
  // @cpt-end:cpt-frontx-algo-template-manifest-validate-contract:p1:inst-parse-manifest

  // Guard: must be a plain object after parsing
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    violations.push({ field: 'manifest', message: 'manifest must be a JSON object' });
    return { status: 'REJECTED', violations };
  }

  const obj = parsed as Record<string, unknown>;

  // @cpt-begin:cpt-frontx-algo-template-manifest-validate-contract:p1:inst-check-identity
  const name = obj['name'];
  // @cpt-begin:cpt-frontx-algo-template-manifest-validate-contract:p1:inst-if-identity-missing
  if (typeof name !== 'string' || name.trim() === '') {
    // @cpt-begin:cpt-frontx-algo-template-manifest-validate-contract:p1:inst-add-identity-violation
    violations.push({ field: 'name', message: 'identity field "name" is required and must be a non-empty string' });
    // @cpt-end:cpt-frontx-algo-template-manifest-validate-contract:p1:inst-add-identity-violation
  }
  // @cpt-end:cpt-frontx-algo-template-manifest-validate-contract:p1:inst-if-identity-missing
  // @cpt-end:cpt-frontx-algo-template-manifest-validate-contract:p1:inst-check-identity

  // @cpt-begin:cpt-frontx-algo-template-manifest-validate-contract:p1:inst-check-version
  const version = obj['version'];
  // @cpt-begin:cpt-frontx-algo-template-manifest-validate-contract:p1:inst-if-version-missing
  if (typeof version !== 'string' || version.trim() === '') {
    // @cpt-begin:cpt-frontx-algo-template-manifest-validate-contract:p1:inst-add-version-violation
    violations.push({ field: 'version', message: 'version field is required and must be a non-empty string' });
    // @cpt-end:cpt-frontx-algo-template-manifest-validate-contract:p1:inst-add-version-violation
  }
  // @cpt-end:cpt-frontx-algo-template-manifest-validate-contract:p1:inst-if-version-missing
  // @cpt-end:cpt-frontx-algo-template-manifest-validate-contract:p1:inst-check-version

  // @cpt-begin:cpt-frontx-algo-template-manifest-validate-contract:p1:inst-check-kind
  const kind = obj['kind'];
  // @cpt-begin:cpt-frontx-algo-template-manifest-validate-contract:p1:inst-if-kind-invalid
  const isValidKind = RECOGNIZED_KINDS.includes(kind as (typeof RECOGNIZED_KINDS)[number]);
  if (!isValidKind) {
    // @cpt-begin:cpt-frontx-algo-template-manifest-validate-contract:p1:inst-add-kind-violation
    violations.push({
      field: 'kind',
      message: `kind field is required and must be one of: ${RECOGNIZED_KINDS.join(', ')}`,
    });
    // @cpt-end:cpt-frontx-algo-template-manifest-validate-contract:p1:inst-add-kind-violation
  }
  // @cpt-end:cpt-frontx-algo-template-manifest-validate-contract:p1:inst-if-kind-invalid
  // @cpt-end:cpt-frontx-algo-template-manifest-validate-contract:p1:inst-check-kind

  // @cpt-begin:cpt-frontx-algo-template-manifest-validate-contract:p1:inst-if-project-template
  if (kind === 'project-template') {
    // @cpt-begin:cpt-frontx-algo-template-manifest-validate-contract:p1:inst-check-compositions
    const compositions = obj['compositions'];
    if (compositions !== undefined) {
      if (!Array.isArray(compositions)) {
        violations.push({ field: 'compositions', message: 'compositions must be an array when present' });
      } else {
        // @cpt-begin:cpt-frontx-algo-template-manifest-validate-contract:p1:inst-for-each-composition
        for (let i = 0; i < compositions.length; i++) {
          const entry = compositions[i] as unknown;
          // @cpt-begin:cpt-frontx-algo-template-manifest-validate-contract:p1:inst-check-composition-ref
          if (
            typeof entry !== 'object' ||
            entry === null ||
            Array.isArray(entry)
          ) {
            // @cpt-begin:cpt-frontx-algo-template-manifest-validate-contract:p1:inst-if-composition-invalid
            // @cpt-begin:cpt-frontx-algo-template-manifest-validate-contract:p1:inst-add-composition-violation
            violations.push({
              field: `compositions[${i}]`,
              message: 'composition entry must be an object with a "ref" field',
            });
            // @cpt-end:cpt-frontx-algo-template-manifest-validate-contract:p1:inst-add-composition-violation
            // @cpt-end:cpt-frontx-algo-template-manifest-validate-contract:p1:inst-if-composition-invalid
          } else {
            const ref = (entry as Record<string, unknown>)['ref'];
            // A structurally valid ref is a non-empty, non-whitespace-only string.
            // The full source-spec grammar is validated at resolution time, not here.
            if (typeof ref !== 'string' || ref.trim() === '') {
              // @cpt-begin:cpt-frontx-algo-template-manifest-validate-contract:p1:inst-if-composition-invalid
              // @cpt-begin:cpt-frontx-algo-template-manifest-validate-contract:p1:inst-add-composition-violation
              violations.push({
                field: `compositions[${i}].ref`,
                message: 'composition ref must be a non-empty string (source-spec or registered name)',
              });
              // @cpt-end:cpt-frontx-algo-template-manifest-validate-contract:p1:inst-add-composition-violation
              // @cpt-end:cpt-frontx-algo-template-manifest-validate-contract:p1:inst-if-composition-invalid
            }
          }
          // @cpt-end:cpt-frontx-algo-template-manifest-validate-contract:p1:inst-check-composition-ref
        }
        // @cpt-end:cpt-frontx-algo-template-manifest-validate-contract:p1:inst-for-each-composition
      }
    }
    // @cpt-end:cpt-frontx-algo-template-manifest-validate-contract:p1:inst-check-compositions
  }
  // @cpt-end:cpt-frontx-algo-template-manifest-validate-contract:p1:inst-if-project-template

  // @cpt-begin:cpt-frontx-algo-template-manifest-validate-contract:p1:inst-if-violations
  if (violations.length > 0) {
    // @cpt-begin:cpt-frontx-algo-template-manifest-validate-contract:p1:inst-return-rejected
    return { status: 'REJECTED', violations };
    // @cpt-end:cpt-frontx-algo-template-manifest-validate-contract:p1:inst-return-rejected
  }
  // @cpt-end:cpt-frontx-algo-template-manifest-validate-contract:p1:inst-if-violations

  // @cpt-begin:cpt-frontx-algo-template-manifest-validate-contract:p1:inst-return-validated
  return { status: 'VALIDATED', violations: [] };
  // @cpt-end:cpt-frontx-algo-template-manifest-validate-contract:p1:inst-return-validated
}
