// @cpt-flow:cpt-frontx-flow-cli-tooling-validate-components:p1
// @cpt-algo:cpt-frontx-algo-cli-tooling-scan-component-violations:p1
// @cpt-dod:cpt-frontx-dod-cli-tooling-validate:p1
import path from 'path';
import fs from 'fs/promises';
import type { CommandDefinition } from '../../core/command.js';
import { validationOk, validationError } from '../../core/types.js';
import { getScreensetsDir } from '../../utils/project.js';

/**
 * Get line number for a match index in content
 */
function getLineNumber(content: string, index: number): number {
  let lineNumber = 1;
  for (let i = 0; i < index && i < content.length; i++) {
    if (content[i] === '\n') {
      lineNumber++;
    }
  }
  return lineNumber;
}

/**
 * Validation result for a single violation
 */
export interface ComponentViolation {
  file: string;
  line?: number;
  rule: 'inline-component' | 'inline-data' | 'uikit-impurity' | 'ui-component-impurity' | 'inline-style';
  message: string;
  severity: 'error' | 'warning';
  suggestion?: string;
}

/**
 * Arguments for validate components command
 */
export interface ValidateComponentsArgs {
  path?: string;
}

/**
 * Result of validate components command
 */
export interface ValidateComponentsResult {
  violations: ComponentViolation[];
  scannedFiles: number;
  passed: boolean;
}

// Patterns to detect violations
// Note: FC generics may contain nested braces, so we match until `= ` more permissively
const INLINE_FC_PATTERN = /const\s+(\w+)\s*:\s*(?:React\.)?FC(?:<[\s\S]*?>)?\s*=/g;
const INLINE_DATA_PATTERN = /const\s+(\w+)\s*(?::\s*\w+(?:\[\])?)?\s*=\s*\[[\s\S]*?\{[\s\S]*?\}/g;
// Detect business logic imports (hooks, state, events) from @gears-frontx/react or @gears-frontx/framework
const BUSINESS_LOGIC_IMPORT_PATTERN = /import\s+(?:(?!\btype\b)[^;]*)\s+from\s+['"]@gears-frontx\/(?:react|framework)['"]/;
const INLINE_STYLE_PATTERN = /style\s*=\s*\{\{/g;
const HEX_COLOR_PATTERN = /#[0-9a-fA-F]{3,8}(?=['"`])/g;

/**
 * Check if file is in components/ui/ (allowed to use inline styles)
 */
function isInComponentsUiFolder(filePath: string): boolean {
  const componentsUiPattern = /[/\\]components[/\\]ui[/\\]/;
  if (componentsUiPattern.test(filePath)) {
    return true;
  }

  return false;
}

/**
 * Scan a file for component violations
 */
// @cpt-begin:cpt-frontx-algo-cli-tooling-scan-component-violations:p1:inst-iterate-source-files
async function scanFile(
  filePath: string,
  relativePath: string
): Promise<ComponentViolation[]> {
  const violations: ComponentViolation[] = [];
  const content = await fs.readFile(filePath, 'utf-8');
  const lines = content.split('\n');

  const isScreenFile = filePath.endsWith('Screen.tsx');
  const isUiComponentFile = isInComponentsUiFolder(filePath);
  // @cpt-end:cpt-frontx-algo-cli-tooling-scan-component-violations:p1:inst-iterate-source-files

  // @cpt-begin:cpt-frontx-algo-cli-tooling-scan-component-violations:p1:inst-detect-inline-components
  // Check for inline components in Screen files
  if (isScreenFile) {
    // Find all FC declarations
    let match: RegExpExecArray | null;
    const fcPattern = new RegExp(INLINE_FC_PATTERN.source, 'g');

    while ((match = fcPattern.exec(content)) !== null) {
      const componentName = match[1];

      // Find line number
      const lineNumber = getLineNumber(content, match.index);

      // Skip if it's the main exported component (usually at end of file)
      const isExportDefault =
        content.includes(`export default ${componentName}`) ||
        content.includes(`export { ${componentName} as default }`);

      if (!isExportDefault) {
        violations.push({
          file: relativePath,
          line: lineNumber,
          rule: 'inline-component',
          message: `Inline component "${componentName}" detected in screen file`,
          severity: 'error',
          suggestion: `Extract to screens/{screen}/components/${componentName}.tsx or components/ui/${componentName}.tsx`,
        });
      }
    }
    // @cpt-end:cpt-frontx-algo-cli-tooling-scan-component-violations:p1:inst-detect-inline-components

    // @cpt-begin:cpt-frontx-algo-cli-tooling-scan-component-violations:p1:inst-detect-inline-data
    // Check for inline data arrays
    const dataPattern = new RegExp(INLINE_DATA_PATTERN.source, 'g');
    while ((match = dataPattern.exec(content)) !== null) {
      const varName = match[1];

      // Skip common non-data patterns
      if (
        varName.match(
          /^(columns|options|items|routes|menu|tabs|steps|fields)$/i
        )
      ) {
        continue;
      }

      // Check if it looks like mock data (has multiple objects with similar structure)
      const matchContent = match[0];
      const objectCount = (matchContent.match(/\{/g) || []).length;

      if (objectCount >= 3) {
        const lineNumber = getLineNumber(content, match.index);

        violations.push({
          file: relativePath,
          line: lineNumber,
          rule: 'inline-data',
          message: `Inline data array "${varName}" violates architecture`,
          severity: 'error',
          suggestion:
            'Data must come from API services. Create api/{domain}/mocks.ts and fetch via event-driven flow.',
        });
      }
    }
    // @cpt-end:cpt-frontx-algo-cli-tooling-scan-component-violations:p1:inst-detect-inline-data
  }

  // @cpt-begin:cpt-frontx-algo-cli-tooling-scan-component-violations:p1:inst-detect-ui-component-impurity
  // Check for @gears-frontx/react or @gears-frontx/framework imports in UI component files
  if (isUiComponentFile) {
    if (BUSINESS_LOGIC_IMPORT_PATTERN.test(content)) {
      // Find line number of the import
      let lineNumber = 1;
      for (let i = 0; i < lines.length; i++) {
        if (BUSINESS_LOGIC_IMPORT_PATTERN.test(lines[i])) {
          lineNumber = i + 1;
          break;
        }
      }

      violations.push({
        file: relativePath,
        line: lineNumber,
        rule: 'ui-component-impurity',
        message: 'UI component imports from @gears-frontx/react or @gears-frontx/framework',
        severity: 'error',
        suggestion:
          'UI components in components/ui/ must be presentational only. Move to screens/{screen}/components/ if business logic is needed.',
      });
    }
  }
  // @cpt-end:cpt-frontx-algo-cli-tooling-scan-component-violations:p1:inst-detect-ui-component-impurity

  // @cpt-begin:cpt-frontx-algo-cli-tooling-scan-component-violations:p1:inst-detect-inline-styles
  // Check for inline styles (all files except components/ui/)
  if (!isInComponentsUiFolder(filePath)) {
    let match: RegExpExecArray | null;
    const stylePattern = new RegExp(INLINE_STYLE_PATTERN.source, 'g');

    while ((match = stylePattern.exec(content)) !== null) {
      const lineNumber = getLineNumber(content, match.index);

      violations.push({
        file: relativePath,
        line: lineNumber,
        rule: 'inline-style',
        message: 'Inline style={{}} is forbidden',
        severity: 'error',
        suggestion: 'Use Tailwind classes instead (e.g., className="p-4 bg-background")',
      });
    }

    // Check for hex colors
    const hexPattern = new RegExp(HEX_COLOR_PATTERN.source, 'g');
    while ((match = hexPattern.exec(content)) !== null) {
      const lineNumber = getLineNumber(content, match.index);
      const color = match[0];

      violations.push({
        file: relativePath,
        line: lineNumber,
        rule: 'inline-style',
        message: `Hex color "${color}" is forbidden`,
        severity: 'error',
        suggestion: 'Use CSS variable like "hsl(var(--primary))" or Tailwind class',
      });
    }
  }
  // @cpt-end:cpt-frontx-algo-cli-tooling-scan-component-violations:p1:inst-detect-inline-styles

  // @cpt-begin:cpt-frontx-algo-cli-tooling-scan-component-violations:p1:inst-return-violations
  return violations;
  // @cpt-end:cpt-frontx-algo-cli-tooling-scan-component-violations:p1:inst-return-violations
}

/**
 * Recursively scan directory for TypeScript/TSX files
 */
async function scanDirectory(
  dirPath: string,
  basePath: string
): Promise<{ violations: ComponentViolation[]; fileCount: number }> {
  const violations: ComponentViolation[] = [];
  let fileCount = 0;

  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        // Skip node_modules and dist
        if (entry.name === 'node_modules' || entry.name === 'dist') {
          continue;
        }
        const result = await scanDirectory(fullPath, basePath);
        violations.push(...result.violations);
        fileCount += result.fileCount;
      } else if (entry.isFile() && /\.(tsx?)$/.test(entry.name)) {
        const relativePath = path.relative(basePath, fullPath);
        const fileViolations = await scanFile(fullPath, relativePath);
        violations.push(...fileViolations);
        fileCount++;
      }
    }
  } catch (_error) {
    // Directory might not exist, that's okay
  }

  return { violations, fileCount };
}

/**
 * Validate components command implementation
 */
// @cpt-begin:cpt-frontx-flow-cli-tooling-validate-components:p1:inst-invoke-validate
export const validateComponentsCommand: CommandDefinition<
  ValidateComponentsArgs,
  ValidateComponentsResult
> = {
  name: 'validate:components',
  description: 'Validate component structure and placement',
  args: [
    {
      name: 'path',
      description:
        'Path to validate (defaults to src/screensets/)',
      required: false,
    },
  ],
  options: [],

  // @cpt-begin:cpt-frontx-flow-cli-tooling-validate-components:p1:inst-check-project-root-validate
  validate(_args, ctx) {
    // Must be inside a project
    if (!ctx.projectRoot) {
      return validationError(
        'NOT_IN_PROJECT',
        'Not inside a FrontX project. Run this command from a project root.'
      );
    }

    return validationOk();
  },
  // @cpt-end:cpt-frontx-flow-cli-tooling-validate-components:p1:inst-check-project-root-validate

  async execute(args, ctx): Promise<ValidateComponentsResult> {
    const { logger, projectRoot } = ctx;

    // @cpt-begin:cpt-frontx-flow-cli-tooling-validate-components:p1:inst-resolve-scan-path
    // Determine scan path
    let scanPath: string;
    if (args.path) {
      scanPath = path.isAbsolute(args.path)
        ? args.path
        : path.join(projectRoot!, args.path);
    } else {
      scanPath = getScreensetsDir(projectRoot!);
    }
    // @cpt-end:cpt-frontx-flow-cli-tooling-validate-components:p1:inst-resolve-scan-path

    logger.info(`Validating components in ${path.relative(projectRoot!, scanPath) || scanPath}...`);
    logger.newline();

    // @cpt-begin:cpt-frontx-flow-cli-tooling-validate-components:p1:inst-run-scan
    // Scan for violations
    const { violations, fileCount } = await scanDirectory(scanPath, projectRoot!);
    // @cpt-end:cpt-frontx-flow-cli-tooling-validate-components:p1:inst-run-scan

    // Group violations by severity
    const errors = violations.filter((v) => v.severity === 'error');
    const warnings = violations.filter((v) => v.severity === 'warning');

    // @cpt-begin:cpt-frontx-flow-cli-tooling-validate-components:p1:inst-report-violations
    // Report results
    if (violations.length === 0) {
      logger.success(`No violations found in ${fileCount} files`);
      // @cpt-begin:cpt-frontx-flow-cli-tooling-validate-components:p1:inst-return-clean
      return { violations: [], scannedFiles: fileCount, passed: true };
      // @cpt-end:cpt-frontx-flow-cli-tooling-validate-components:p1:inst-return-clean
    }

    // Print violations grouped by file
    const byFile = new Map<string, ComponentViolation[]>();
    for (const v of violations) {
      const existing = byFile.get(v.file) || [];
      existing.push(v);
      byFile.set(v.file, existing);
    }

    for (const [file, fileViolations] of byFile) {
      logger.log(`\n${file}:`);
      for (const v of fileViolations) {
        const prefix = v.severity === 'error' ? '  ✗' : '  ⚠';
        const lineInfo = v.line ? `:${v.line}` : '';
        logger.log(`${prefix} [${v.rule}]${lineInfo} ${v.message}`);
        if (v.suggestion) {
          logger.log(`    → ${v.suggestion}`);
        }
      }
    }

    logger.newline();
    logger.log(`Scanned ${fileCount} files`);
    if (errors.length > 0) {
      logger.error(`${errors.length} error(s)`);
    }
    if (warnings.length > 0) {
      logger.warn(`${warnings.length} warning(s)`);
    }
    // @cpt-end:cpt-frontx-flow-cli-tooling-validate-components:p1:inst-report-violations

    // @cpt-begin:cpt-frontx-flow-cli-tooling-validate-components:p1:inst-return-validate
    return {
      violations,
      scannedFiles: fileCount,
      passed: errors.length === 0,
    };
    // @cpt-end:cpt-frontx-flow-cli-tooling-validate-components:p1:inst-return-validate
  },
};
// @cpt-end:cpt-frontx-flow-cli-tooling-validate-components:p1:inst-invoke-validate
