/**
 * Copy template files from main project to CLI package
 *
 * This script is DRIVEN BY manifest.yaml - the single source of truth for template assembly.
 *
 * 3-Stage Pipeline:
 * - Stage 1a: Copy static presets from packages/cli/template-sources/project/
 * - Stage 1b: Copy root project files (source code that IS the monorepo app)
 * - Stage 1c: Assemble .ai/ from markers (uses ai-overrides/ for @standalone:override files)
 * - Stage 2: Generate IDE rules and command adapters
 *
 * AI CONFIGURATION STRATEGY:
 * - Root .ai/ is canonical source of truth for all rules and commands
 * - Files marked with <!-- @standalone --> are copied verbatim
 * - Files marked with <!-- @standalone:override --> use versions from ai-overrides/
 * - Files without markers are monorepo-only (not copied)
 * - frontxdev-* commands are monorepo-only (not copied to standalone projects)
 * - Command adapters are GENERATED for all IDEs
 */
// @cpt-algo:cpt-frontx-algo-cli-tooling-build-templates:p1
// @cpt-dod:cpt-frontx-dod-cli-tooling-templates:p1
import fs from 'fs-extra';
import lodash from 'lodash';
import path from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';
import {
  renderStandaloneVitestConfig,
  renderStandaloneMfeVitestBase,
  renderStandaloneVitestSetupFile,
} from '../../../vitest.shared.ts';
import {
  TARGET_LAYERS,
  isTargetApplicableToLayer,
  type LayerType,
} from '../src/core/layers.js';

const { trim } = lodash;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLI_ROOT = path.resolve(__dirname, '..');
const PROJECT_ROOT = path.resolve(CLI_ROOT, '../..');
const TEMPLATES_DIR = path.join(CLI_ROOT, 'templates');
const MANIFEST_PATH = path.join(CLI_ROOT, 'template-sources', 'manifest.yaml');

/**
 * Manifest schema (loaded from manifest.yaml)
 */
interface Manifest {
  version: string;
  description: string;
  project: {
    source: string;
    description: string;
    contents: string[];
  };
  layout: {
    source: string;
    description: string;
    destination: string;
    files: string[];
  };
  root: {
    description: string;
    files: string[];
    directories: string[];
  };
  ai_overrides: {
    source: string;
    description: string;
    usage: string;
    contents: string[];
  };
  generated: {
    description: string;
    files: string[];
  };
  output: {
    directory: string;
    description: string;
  };
}

/**
 * Load and parse manifest.yaml
 */
async function loadManifest(): Promise<Manifest> {
  if (!(await fs.pathExists(MANIFEST_PATH))) {
    throw new Error(`Manifest not found at ${MANIFEST_PATH}`);
  }

  const content = await fs.readFile(MANIFEST_PATH, 'utf-8');
  const manifest = yaml.load(content) as Manifest;

  // Validate required fields
  if (!manifest.version || !manifest.project || !manifest.root) {
    throw new Error('Invalid manifest: missing required fields');
  }

  return manifest;
}

/**
 * Extract description from a command file
 * Looks for the first H1 header after the marker comment
 */
async function extractCommandDescription(filePath: string): Promise<string> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    // Look for "# frontx:command-name - Description" pattern
    const h1Match = content.match(/^#\s+frontx:\S+\s+-\s+(.+)$/m);
    if (h1Match) {
      return trim(h1Match[1]);
    }
    // Fallback: use filename
    const name = path.basename(filePath, '.md');
    return `FrontX ${name.replace('frontx-', '').replace(/-/g, ' ')} command`;
  } catch {
    return 'FrontX command';
  }
}

/**
 * Generate IDE command adapters from @standalone marked commands
 * Generates adapters for Claude (commands), Cursor (commands), and Windsurf (workflows)
 * Excludes frontxdev-* commands (monorepo-only)
 *
 * @param standaloneCommands - List of standalone command paths
 * @param templatesDir - Destination templates directory
 * @param layer - Target layer (currently unused for adapters, reserved for future use)
 */
async function generateCommandAdapters(
  standaloneCommands: string[],
  templatesDir: string,
  _layer: LayerType = 'app'
): Promise<{ claude: number; cursor: number; windsurf: number }> {
  const claudeCommandsDir = path.join(templatesDir, '.claude', 'commands');
  const cursorCommandsDir = path.join(templatesDir, '.cursor', 'commands');
  const windsurfWorkflowsDir = path.join(templatesDir, '.windsurf', 'workflows');

  await fs.ensureDir(claudeCommandsDir);
  await fs.ensureDir(cursorCommandsDir);
  await fs.ensureDir(windsurfWorkflowsDir);

  let claudeCount = 0;
  let cursorCount = 0;
  let windsurfCount = 0;

  // Generate frontx-* command adapters
  for (const relativePath of standaloneCommands) {
    // Only process commands/ directory files
    if (!relativePath.startsWith('commands/')) continue;

    const cmdFileName = path.basename(relativePath); // e.g., "frontx-validate.md"

    // Skip internal commands (monorepo-only - frontxdev-* and commands/internal/)
    if (cmdFileName.startsWith('frontxdev-') || relativePath.includes('commands/internal/')) continue;

    const srcPath = path.join(PROJECT_ROOT, '.ai', relativePath);
    const description = await extractCommandDescription(srcPath);

    // Claude adapter
    const claudeContent = `---
description: ${description}
---

Use \`.ai/${relativePath}\` as the single source of truth.
`;
    await fs.writeFile(path.join(claudeCommandsDir, cmdFileName), claudeContent);
    claudeCount++;

    // Cursor adapter (same format as Claude)
    const cursorContent = `---
description: ${description}
---

Use \`.ai/${relativePath}\` as the single source of truth.
`;
    await fs.writeFile(path.join(cursorCommandsDir, cmdFileName), cursorContent);
    cursorCount++;

    // Windsurf adapter (workflow format)
    const windsurfContent = `---
description: ${description}
---

Use \`.ai/${relativePath}\` as the single source of truth.
`;
    await fs.writeFile(path.join(windsurfWorkflowsDir, cmdFileName), windsurfContent);
    windsurfCount++;
  }

  return { claude: claudeCount, cursor: cursorCount, windsurf: windsurfCount };
}

/**
 * Bundle commands from @gears-frontx packages into CLI templates
 * These are the actual command files (not adapters) that ship with each package
 * Scans packages/[pkg]/commands/[cmd].md and copies ALL variants to a commands-bundle directory
 * The variant selection happens at project creation time, not at CLI build time
 *
 * @param templatesDir - Destination templates directory
 */
async function bundlePackageCommands(
  templatesDir: string
): Promise<{ bundledVariants: number; baseCommands: Set<string> }> {
  const commandsBundleDir = path.join(templatesDir, 'commands-bundle');
  await fs.ensureDir(commandsBundleDir);

  let bundledVariants = 0;
  const baseCommands = new Set<string>(); // Track base command names (without variants)

  // Scan packages/*/commands/ directories
  const packagesDir = path.join(PROJECT_ROOT, 'packages');
  const packages = await fs.readdir(packagesDir);

  for (const pkg of packages) {
    // Skip CLI package (has its own commands structure)
    if (pkg === 'cli') continue;

    const commandsDir = path.join(packagesDir, pkg, 'commands');
    if (!(await fs.pathExists(commandsDir))) continue;

    const files = await fs.readdir(commandsDir);

    for (const file of files) {
      if (!file.endsWith('.md')) continue;
      // Skip monorepo-only commands
      if (file.startsWith('frontxdev-')) continue;

      const srcPath = path.join(commandsDir, file);
      const destPath = path.join(commandsBundleDir, file);

      // Copy all variants to commands-bundle/
      await fs.copy(srcPath, destPath);
      bundledVariants++;

      // Extract base command name (e.g., "frontx-new-api-service" from "frontx-new-api-service.framework.md")
      const baseName = file.replace(/\.(sdk|framework|react)\.md$/, '').replace(/\.md$/, '');
      baseCommands.add(baseName);
    }
  }

  return { bundledVariants, baseCommands };
}

/**
 * Generate IDE adapters for bundled package commands
 * Creates placeholder adapters that will be populated with actual commands at project creation time
 *
 * @param baseCommands - Set of base command names from bundled commands
 * @param templatesDir - Destination templates directory
 */
async function generateBundledCommandAdapters(
  baseCommands: Set<string>,
  templatesDir: string
): Promise<{ claude: number; cursor: number; windsurf: number }> {
  const claudeCommandsDir = path.join(templatesDir, '.claude', 'commands');
  const cursorCommandsDir = path.join(templatesDir, '.cursor', 'commands');
  const windsurfWorkflowsDir = path.join(templatesDir, '.windsurf', 'workflows');

  await fs.ensureDir(claudeCommandsDir);
  await fs.ensureDir(cursorCommandsDir);
  await fs.ensureDir(windsurfWorkflowsDir);

  let claudeCount = 0;
  let cursorCount = 0;
  let windsurfCount = 0;

  // Generate adapters for each base command
  for (const baseName of baseCommands) {
    const cmdFileName = `${baseName}.md`;

    // Read description from the first available variant in commands-bundle
    const commandsBundleDir = path.join(templatesDir, 'commands-bundle');
    const bundleFiles = await fs.readdir(commandsBundleDir);
    const matchingVariant = bundleFiles.find(f => f.startsWith(baseName));

    if (!matchingVariant) continue;

    const description = await extractCommandDescription(path.join(commandsBundleDir, matchingVariant));

    // Claude adapter
    const claudeContent = `---
description: ${description}
---

Use \`.ai/commands/${cmdFileName}\` as the single source of truth.
`;
    await fs.writeFile(path.join(claudeCommandsDir, cmdFileName), claudeContent);
    claudeCount++;

    // Cursor adapter
    const cursorContent = `---
description: ${description}
---

Use \`.ai/commands/${cmdFileName}\` as the single source of truth.
`;
    await fs.writeFile(path.join(cursorCommandsDir, cmdFileName), cursorContent);
    cursorCount++;

    // Windsurf adapter
    const windsurfContent = `---
description: ${description}
---

Use \`.ai/commands/${cmdFileName}\` as the single source of truth.
`;
    await fs.writeFile(path.join(windsurfWorkflowsDir, cmdFileName), windsurfContent);
    windsurfCount++;
  }

  return { claude: claudeCount, cursor: cursorCount, windsurf: windsurfCount };
}

/**
 * Generate IDE rules as pointers to .ai/GUIDELINES.md
 * All IDEs use the same single source of truth
 */
async function generateIdeRules(templatesDir: string): Promise<void> {
  // CLAUDE.md at project root
  const guidelinesPointer = `REQUIRED: Read \`.ai/GUIDELINES.md\` before implementing any code changes. Follow its ROUTING section to find the correct target file.

REQUIRED: When creating or modifying UI components, check the configured UI kit (\`frontx.config.json\` → \`uikit\`) and use its components. Read \`.ai/targets/UIKIT.md\` if it exists.`;

  const claudeMdContent = `# CLAUDE.md

${guidelinesPointer}
`;
  await fs.writeFile(path.join(templatesDir, 'CLAUDE.md'), claudeMdContent);

  // Cursor rules
  const cursorRulesDir = path.join(templatesDir, '.cursor', 'rules');
  await fs.ensureDir(cursorRulesDir);
  const cursorRuleContent = `---
description: FrontX development guidelines
globs: ["**/*"]
alwaysApply: true
---

${guidelinesPointer}
`;
  await fs.writeFile(path.join(cursorRulesDir, 'frontx.mdc'), cursorRuleContent);

  // Windsurf rules
  const windsurfRulesDir = path.join(templatesDir, '.windsurf', 'rules');
  await fs.ensureDir(windsurfRulesDir);
  const windsurfRuleContent = `---
trigger: always_on
---

${guidelinesPointer}
`;
  await fs.writeFile(path.join(windsurfRulesDir, 'frontx.md'), windsurfRuleContent);

  // GitHub Copilot instructions
  const githubDir = path.join(templatesDir, '.github');
  await fs.ensureDir(githubDir);
  const copilotInstructionsContent = `# FrontX Development Guidelines for GitHub Copilot

Always read \`.ai/GUIDELINES.md\` before making changes.

## Quick Reference

For detailed guidance, use these resources:
- **Architecture**: See \`.ai/GUIDELINES.md\` and target files in \`.ai/targets/\`
- **Event-driven patterns**: \`.ai/targets/EVENTS.md\`
- **Screensets**: \`.ai/targets/SCREENSETS.md\`
- **API services**: \`.ai/targets/API.md\`
- **Styling**: \`.ai/targets/STYLING.md\`
- **Themes**: \`.ai/targets/THEMES.md\`

## Critical Rules

1. **REQUIRED**: Read the appropriate target file before changing code
2. **REQUIRED**: Event-driven architecture only (dispatch events, handle in actions)
3. **FORBIDDEN**: Direct slice dispatch from UI components
4. **FORBIDDEN**: Hardcoded colors or inline styles
5. **REQUIRED**: Use the configured UI kit for all UI (check \`frontx.config.json\` \`uikit\` field)
6. **REQUIRED**: Run \`npm run arch:check\` before committing

## Available Commands

Use \`.ai/commands/\` for detailed workflows:
- \`frontx-new-screenset\` - Create new screenset
- \`frontx-new-screen\` - Add screen to screenset
- \`frontx-new-action\` - Create action handler
- \`frontx-new-api-service\` - Add API service
- \`frontx-new-component\` - Add UI component
- \`frontx-validate\` - Validate changes
- \`frontx-quick-ref\` - Quick reference guide

## Routing

Always consult \`.ai/GUIDELINES.md\` ROUTING section to find the correct target file for your task.
`;
  await fs.writeFile(path.join(githubDir, 'copilot-instructions.md'), copilotInstructionsContent);
}

/**
 * Check if file has a standalone marker
 */
async function getStandaloneMarker(
  filePath: string
): Promise<'standalone' | 'override' | null> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const firstLines = content.slice(0, 200); // Check first 200 chars

    if (firstLines.includes('<!-- @standalone:override -->')) {
      return 'override';
    }
    if (firstLines.includes('<!-- @standalone -->')) {
      return 'standalone';
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Recursively scan directory for files with markers
 *
 * @param dir - Directory to scan
 * @param baseDir - Base directory for relative paths
 * @param layer - Target layer for filtering targets (optional)
 */
async function scanForMarkedFiles(
  dir: string,
  baseDir: string,
  layer?: LayerType
): Promise<Array<{ relativePath: string; marker: 'standalone' | 'override' }>> {
  const results: Array<{
    relativePath: string;
    marker: 'standalone' | 'override';
  }> = [];

  if (!(await fs.pathExists(dir))) {
    return results;
  }

  const entries = await fs.readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relativePath = path.relative(baseDir, fullPath);

    if (entry.isDirectory()) {
      const subResults = await scanForMarkedFiles(fullPath, baseDir, layer);
      results.push(...subResults);
    } else if (entry.name.endsWith('.md')) {
      const marker = await getStandaloneMarker(fullPath);
      if (marker) {
        // Filter targets based on layer if specified
        if (layer && relativePath.startsWith('targets/')) {
          const targetFileName = path.basename(relativePath);
          if (!isTargetApplicableToLayer(targetFileName, layer)) {
            console.log(`  ⓘ Excluding target '${targetFileName}' for layer '${layer}'`);
            continue;
          }
        }

        results.push({ relativePath, marker });
      }
    }
  }

  return results;
}

async function countFiles(dir: string): Promise<number> {
  let count = 0;
  if (!(await fs.pathExists(dir))) return 0;
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      count += await countFiles(path.join(dir, entry.name));
    } else {
      count++;
    }
  }
  return count;
}

async function copyTemplates() {
  console.log('📦 Copying templates from main project...\n');

  // @cpt-begin:cpt-frontx-algo-cli-tooling-build-templates:p1:inst-generate-manifest
  // Load manifest - single source of truth
  const manifest = await loadManifest();
  console.log(`📄 Loaded manifest v${manifest.version}\n`);
  // @cpt-end:cpt-frontx-algo-cli-tooling-build-templates:p1:inst-generate-manifest

  // Clean templates directory
  await fs.remove(TEMPLATES_DIR);
  await fs.ensureDir(TEMPLATES_DIR);

  // @cpt-begin:cpt-frontx-algo-cli-tooling-build-templates:p1:inst-copy-project-sources
  // ============================================
  // STAGE 1a: Copy static presets (from manifest.project)
  // ============================================
  console.log(`Stage 1a: Static Presets (${manifest.project.source}):`);
  const presetsDir = path.join(CLI_ROOT, 'template-sources/project');

  // Copy eslint-plugin-local
  const eslintPluginSrc = path.join(presetsDir, 'eslint-plugin-local');
  const eslintPluginDest = path.join(TEMPLATES_DIR, 'eslint-plugin-local');
  if (await fs.pathExists(eslintPluginSrc)) {
    await fs.copy(eslintPluginSrc, eslintPluginDest, {
      filter: (src: string) => !src.includes('/dist/') && !src.includes('/node_modules/'),
    });
    console.log(`  ✓ eslint-plugin-local/ (${await countFiles(eslintPluginDest)} files)`);
  }

  // Flatten configs/ to templates root
  const configsSrc = path.join(presetsDir, 'configs');
  if (await fs.pathExists(configsSrc)) {
    const configFiles = await fs.readdir(configsSrc);
    for (const file of configFiles) {
      const srcPath = path.join(configsSrc, file);
      // Rename _pre-commit-config.yaml to .pre-commit-config.yaml
      // (stored with underscore to prevent prek from detecting it during monorepo commits)
      // Rename _github/ to .github/
      // (stored with underscore to prevent GitHub from picking up template workflows)
      const destFileName = file === '_pre-commit-config.yaml' ? '.pre-commit-config.yaml'
        : file === '_github' ? '.github'
        : file;
      const destPath = path.join(TEMPLATES_DIR, destFileName);

      // Transform eslint.config.js path for standalone projects
      // In monorepo: ../eslint-plugin-local (configs/ -> eslint-plugin-local/)
      // In standalone: ./eslint-plugin-local (root -> eslint-plugin-local/)
      if (file === 'eslint.config.js') {
        let content = await fs.readFile(srcPath, 'utf-8');
        content = content.replace(
          "../eslint-plugin-local",
          './eslint-plugin-local'
        );
        await fs.writeFile(destPath, content);
      } else {
        await fs.copy(srcPath, destPath);
      }
    }
    console.log(`  ✓ configs/ flattened to root (${configFiles.length} files)`);
  }

  // Flatten scripts/ to templates/scripts/
  const scriptsSrc = path.join(presetsDir, 'scripts');
  const scriptsDest = path.join(TEMPLATES_DIR, 'scripts');
  if (await fs.pathExists(scriptsSrc)) {
    await fs.ensureDir(scriptsDest);
    const scriptFiles = await fs.readdir(scriptsSrc);
    for (const file of scriptFiles) {
      await fs.copy(path.join(scriptsSrc, file), path.join(scriptsDest, file));
    }
    console.log(`  ✓ scripts/ (${scriptFiles.length} files)`);
  }

  // Copy root-level files from template-sources/project/
  const presetsEntries = await fs.readdir(presetsDir, { withFileTypes: true });
  const rootFiles = presetsEntries.filter(e => e.isFile());
  for (const file of rootFiles) {
    // Monorepo-only: root tsconfig extends configs/ and maps workspace packages to src.
    // Standalone templates get tsconfig.json from flattening configs/ only.
    if (file.name === 'tsconfig.json') {
      continue;
    }
    await fs.copy(path.join(presetsDir, file.name), path.join(TEMPLATES_DIR, file.name));
    console.log(`  ✓ ${file.name}`);
  }

  // ============================================
  // STAGE 1b: Copy root project files (from manifest.root)
  // ============================================
  console.log('\nStage 1b: Root Project Files:');

  // Copy root files from manifest
  for (const file of manifest.root.files) {
    const src = path.join(PROJECT_ROOT, file);
    const dest = path.join(TEMPLATES_DIR, file);

    if (await fs.pathExists(src)) {
      await fs.copy(src, dest);
      console.log(`  ✓ ${file}`);
    } else {
      console.log(`  ⚠ ${file} (not found, skipping)`);
    }
  }

  // Copy root directories from manifest
  for (const dir of manifest.root.directories) {
    const src = path.join(PROJECT_ROOT, dir);
    const dest = path.join(TEMPLATES_DIR, dir);

    if (await fs.pathExists(src)) {
      await fs.copy(src, dest);
      const fileCount = await countFiles(dest);
      console.log(`  ✓ ${dir}/ (${fileCount} files)`);
    } else {
      console.log(`  ⚠ ${dir}/ (not found, skipping)`);
    }
  }

  // Copy src/app/mfe/ from monorepo root (MfeScreenContainer, bootstrap, etc.).
  // The host's bootstrap is the single source of truth — scaffolded projects
  // run the same MFE machinery (no override). The runtime manifest endpoint
  // `/generated-mfe-manifests.json` is served from the scaffolded project's
  // `public/` directory; an empty `[]` placeholder is shipped below so a fresh
  // scaffold boots before its first `generate:mfe-manifests` run.
  const mfeSrc = path.join(PROJECT_ROOT, 'src/app/mfe');
  const mfeDest = path.join(TEMPLATES_DIR, 'src/app/mfe');
  if (await fs.pathExists(mfeSrc)) {
    // Per ADR cpt-frontx-adr-mf2-manifest-discovery, manifests are aggregated to
    // `public/generated-mfe-manifests.json` at build time and fetched at runtime —
    // framework code is decoupled from build-time `import` semantics. Ship only the
    // runtime-fetch contract: the `.json` placeholder + its `.json.d.ts` type decl.
    // Never ship a `generated-mfe-manifests.ts` (a dead pre-ADR import file); exclude
    // it defensively so a dirty working tree cannot leak it into scaffolded projects.
    await fs.copy(mfeSrc, mfeDest, {
      filter: (src) => path.basename(src) !== 'generated-mfe-manifests.ts',
    });
    const mfeFileCount = await countFiles(mfeDest);
    console.log(`  ✓ src/app/mfe/ (${mfeFileCount} files from monorepo)`);
  }

  // @cpt-begin:cpt-frontx-dod-cli-tooling-templates:p1:inst-mfe-manifest-generator-script
  // Copy scripts/generate-mfe-manifests.ts from monorepo (single source of
  // truth — same generator that powers the host's runtime manifest endpoint).
  const generatorSrc = path.join(PROJECT_ROOT, 'scripts/generate-mfe-manifests.ts');
  const generatorDest = path.join(TEMPLATES_DIR, 'scripts/generate-mfe-manifests.ts');
  if (await fs.pathExists(generatorSrc)) {
    await fs.ensureDir(path.dirname(generatorDest));
    await fs.copy(generatorSrc, generatorDest);
    console.log('  ✓ scripts/generate-mfe-manifests.ts (from monorepo)');
  }
  // Copy scripts/build-mfes.ts and scripts/lib/mfe-tools.ts from monorepo
  // (must run before generate-mfe-manifests to produce dist/mfe-manifest.json per MFE).
  const buildMfesSrc = path.join(PROJECT_ROOT, 'scripts/build-mfes.ts');
  const buildMfesDest = path.join(TEMPLATES_DIR, 'scripts/build-mfes.ts');
  if (await fs.pathExists(buildMfesSrc)) {
    await fs.ensureDir(path.dirname(buildMfesDest));
    await fs.copy(buildMfesSrc, buildMfesDest);
    console.log('  ✓ scripts/build-mfes.ts (from monorepo)');
  }
  const mfeToolsSrc = path.join(PROJECT_ROOT, 'scripts/lib/mfe-tools.ts');
  const mfeToolsDest = path.join(TEMPLATES_DIR, 'scripts/lib/mfe-tools.ts');
  if (await fs.pathExists(mfeToolsSrc)) {
    await fs.ensureDir(path.dirname(mfeToolsDest));
    await fs.copy(mfeToolsSrc, mfeToolsDest);
    console.log('  ✓ scripts/lib/mfe-tools.ts (from monorepo)');
  }
  // @cpt-end:cpt-frontx-dod-cli-tooling-templates:p1:inst-mfe-manifest-generator-script

  // @cpt-begin:cpt-frontx-dod-cli-tooling-templates:p1:inst-mfe-manifest-empty-placeholder
  // Ship an empty manifest JSON so a freshly-scaffolded project's runtime fetch
  // succeeds before the first `npm run generate:mfe-manifests`.
  const publicManifestDest = path.join(TEMPLATES_DIR, 'public/generated-mfe-manifests.json');
  await fs.ensureDir(path.dirname(publicManifestDest));
  await fs.writeFile(publicManifestDest, '[]\n');
  console.log('  ✓ public/generated-mfe-manifests.json (empty placeholder)');
  // @cpt-end:cpt-frontx-dod-cli-tooling-templates:p1:inst-mfe-manifest-empty-placeholder

  // Copy MFE template from _blank-mfe (source only, no dist/ or node_modules/)
  const mfeTemplateSrc = path.join(PROJECT_ROOT, 'src/mfe_packages/_blank-mfe');
  const mfeTemplateDest = path.join(TEMPLATES_DIR, 'mfe-template');
  if (await fs.pathExists(mfeTemplateSrc)) {
    await fs.copy(mfeTemplateSrc, mfeTemplateDest, {
      filter: (srcPath: string) => {
        const rel = path.relative(mfeTemplateSrc, srcPath);
        if (rel.startsWith('dist') || rel.startsWith('node_modules')) return false;
        return true;
      },
    });
    const fileCount = await countFiles(mfeTemplateDest);
    console.log(`  ✓ mfe-template/ (${fileCount} files from _blank-mfe)`);
  } else {
    console.log('  ⚠ mfe-template/ (src/mfe_packages/_blank-mfe not found, skipping)');
  }

  // Copy MFE shared utilities
  const mfeSharedSrc = path.join(PROJECT_ROOT, 'src/mfe_packages/shared');
  const mfeSharedDest = path.join(TEMPLATES_DIR, 'mfe-shared');
  if (await fs.pathExists(mfeSharedSrc)) {
    await fs.copy(mfeSharedSrc, mfeSharedDest);
    const fileCount = await countFiles(mfeSharedDest);
    console.log(`  ✓ mfe-shared/ (${fileCount} files from mfe_packages/shared)`);
  } else {
    console.log('  ⚠ mfe-shared/ (src/mfe_packages/shared not found, skipping)');
  }

  const mfeVitestBaseSrc = path.join(PROJECT_ROOT, 'src/mfe_packages/vitest.mfe.base.ts');
  const mfeVitestBaseDest = path.join(TEMPLATES_DIR, 'src/mfe_packages/vitest.mfe.base.ts');
  if (await fs.pathExists(mfeVitestBaseSrc)) {
    await fs.ensureDir(path.dirname(mfeVitestBaseDest));
    await fs.copy(mfeVitestBaseSrc, mfeVitestBaseDest);
    console.log('  ✓ src/mfe_packages/vitest.mfe.base.ts');
  } else {
    console.log('  ⚠ src/mfe_packages/vitest.mfe.base.ts (not found, skipping)');
  }

  // Copy layout templates from monorepo source (single source of truth)
  // Source: /src/app/layout/ (monorepo's canonical layout files)
  // Destination: templates/layout/shadcn/ (CLI template with subdirectory structure)
  const layoutSrc = path.join(PROJECT_ROOT, 'src/app/layout');
  const layoutDest = path.join(TEMPLATES_DIR, 'layout', 'shadcn');
  if (await fs.pathExists(layoutSrc)) {
    await fs.copy(layoutSrc, layoutDest);
    const fileCount = await countFiles(layoutDest);
    console.log(`  ✓ layout/ templates (${fileCount} files from monorepo source)`);
  }

  // Copy custom-uikit layout templates from template-sources/layout-custom-uikit/
  const customUikitLayoutSrc = path.join(CLI_ROOT, 'template-sources', 'layout-custom-uikit');
  const customUikitLayoutDest = path.join(TEMPLATES_DIR, 'layout', 'custom-uikit');
  if (await fs.pathExists(customUikitLayoutSrc)) {
    await fs.copy(customUikitLayoutSrc, customUikitLayoutDest);
    const fileCount = await countFiles(customUikitLayoutDest);
    console.log(`  ✓ layout/custom-uikit/ (${fileCount} inline-styled layout files)`);
  }

  // ============================================
  // STAGE 1b-override: Apply standalone-specific files from template-sources/project/
  // These override monorepo root files that have diverged (e.g. MFE-specific code)
  // ============================================
  console.log('\nStage 1b-override: Standalone Overrides:');
  const standaloneSrcDir = path.join(presetsDir, 'src');
  if (await fs.pathExists(standaloneSrcDir)) {
    await fs.copy(standaloneSrcDir, path.join(TEMPLATES_DIR, 'src'), { overwrite: true });
    const standaloneOverrideCount = await countFiles(standaloneSrcDir);
    console.log(`  ✓ src/ standalone overrides (${standaloneOverrideCount} files)`);
  }

  // Override layout templates with standalone versions (MFE-specific code removed)
  const standaloneLayoutDir = path.join(presetsDir, 'src', 'app', 'layout');
  if (await fs.pathExists(standaloneLayoutDir)) {
    await fs.copy(standaloneLayoutDir, path.join(TEMPLATES_DIR, 'layout', 'shadcn'), { overwrite: true });
    const layoutOverrideCount = await countFiles(standaloneLayoutDir);
    console.log(`  ✓ layout/ standalone overrides (${layoutOverrideCount} files → shadcn)`);
  }

  await fs.writeFile(path.join(TEMPLATES_DIR, 'vitest.config.ts'), renderStandaloneVitestConfig());
  console.log('  ✓ vitest.config.ts (generated from vitest.shared.ts)');

  await fs.writeFile(path.join(TEMPLATES_DIR, 'vitest.setup.ts'), renderStandaloneVitestSetupFile());
  console.log('  ✓ vitest.setup.ts (generated shared test setup)');

  const standaloneMfeVitestBaseDest = path.join(TEMPLATES_DIR, 'src', 'mfe_packages', 'vitest.mfe.base.ts');
  await fs.ensureDir(path.dirname(standaloneMfeVitestBaseDest));
  await fs.writeFile(
    standaloneMfeVitestBaseDest,
    renderStandaloneMfeVitestBase(),
  );
  console.log('  ✓ src/mfe_packages/vitest.mfe.base.ts (generated from vitest.shared.ts)');

  // @cpt-end:cpt-frontx-algo-cli-tooling-build-templates:p1:inst-copy-project-sources

  // @cpt-begin:cpt-frontx-algo-cli-tooling-build-templates:p1:inst-copy-ai-targets-build
  // ============================================
  // STAGE 1c: Assemble .ai/ from markers (using manifest.ai_overrides)
  // ============================================
  console.log('\nStage 1c: AI Configuration (marker-based):');
  const aiSourceDir = path.join(PROJECT_ROOT, '.ai');
  const aiDestDir = path.join(TEMPLATES_DIR, '.ai');
  const overridesDir = path.join(CLI_ROOT, 'template-sources', 'ai-overrides');

  await fs.ensureDir(aiDestDir);

  // Scan root .ai/ for marked files (no layer filtering at build time)
  const markedFiles = await scanForMarkedFiles(aiSourceDir, aiSourceDir);

  let standaloneCount = 0;
  let overrideCount = 0;

  for (const { relativePath, marker } of markedFiles) {
    const destPath = path.join(aiDestDir, relativePath);
    await fs.ensureDir(path.dirname(destPath));

    // Skip internal commands (monorepo-only - frontxdev-* and commands/internal/)
    if (relativePath.includes('frontxdev-') || relativePath.includes('commands/internal/')) continue;

    if (marker === 'standalone') {
      // Copy verbatim from root .ai/
      const srcPath = path.join(aiSourceDir, relativePath);
      await fs.copy(srcPath, destPath);
      standaloneCount++;
    } else if (marker === 'override') {
      // Copy from ai-overrides/ (path from manifest)
      const overridePath = path.join(overridesDir, relativePath);
      if (await fs.pathExists(overridePath)) {
        await fs.copy(overridePath, destPath);
        overrideCount++;
      } else {
        console.log(`  ⚠ Override not found: ${relativePath}`);
      }
    }
  }
  // @cpt-end:cpt-frontx-algo-cli-tooling-build-templates:p1:inst-copy-ai-targets-build

  // @cpt-begin:cpt-frontx-algo-cli-tooling-build-templates:p1:inst-copy-guidelines-variants
  // Copy all GUIDELINES layer variants from ai-overrides/
  // These will be selected at project creation time based on layer
  const guidelinesVariants = ['GUIDELINES.sdk.md', 'GUIDELINES.framework.md'];
  for (const variant of guidelinesVariants) {
    const variantSrc = path.join(overridesDir, variant);
    const variantDest = path.join(aiDestDir, variant);
    if (await fs.pathExists(variantSrc)) {
      await fs.copy(variantSrc, variantDest);
      console.log(`  ✓ ${variant} (layer variant)`);
    } else {
      console.log(`  ⚠ ${variant} (layer variant not found, skipping)`);
    }
  }

  // Copy company/ and project/ hierarchy directories from ai-overrides/
  // These are preserved across updates and not marked with standalone markers
  const hierarchyDirs = ['company', 'project'];
  for (const dirName of hierarchyDirs) {
    const hierarchySrc = path.join(overridesDir, dirName);
    const hierarchyDest = path.join(aiDestDir, dirName);
    if (await fs.pathExists(hierarchySrc)) {
      await fs.copy(hierarchySrc, hierarchyDest);
      console.log(`  ✓ ${dirName}/ (hierarchy placeholder)`);
    }
  }

  console.log(`  ✓ .ai/ (${standaloneCount} standalone, ${overrideCount} overrides)`);
  // @cpt-end:cpt-frontx-algo-cli-tooling-build-templates:p1:inst-copy-guidelines-variants

  // @cpt-begin:cpt-frontx-algo-cli-tooling-build-templates:p1:inst-bundle-commands
  // ============================================
  // STAGE 2: Generate IDE rules and adapters
  // ============================================
  console.log('\nStage 2: Generated IDE Configuration:');

  // Generate command adapters for all IDEs (from .ai/commands/)
  const standaloneCommands = markedFiles
    .filter((f) => f.marker === 'standalone')
    .map((f) => f.relativePath);
  const adapterCounts = await generateCommandAdapters(standaloneCommands, TEMPLATES_DIR);

  // Bundle ALL command variants from @gears-frontx packages (packages/*/commands/)
  // Variant selection happens at project creation time
  const packageCounts = await bundlePackageCommands(TEMPLATES_DIR);

  // Generate IDE adapters for bundled commands
  const bundledAdapterCounts = await generateBundledCommandAdapters(packageCounts.baseCommands, TEMPLATES_DIR);

  const totalClaude = adapterCounts.claude + bundledAdapterCounts.claude;
  const totalCursor = adapterCounts.cursor + bundledAdapterCounts.cursor;
  const totalWindsurf = adapterCounts.windsurf + bundledAdapterCounts.windsurf;

  console.log(`  ✓ .claude/commands/ (${totalClaude} adapters: ${adapterCounts.claude} from .ai/commands/, ${bundledAdapterCounts.claude} from packages)`);
  console.log(`  ✓ .cursor/commands/ (${totalCursor} adapters: ${adapterCounts.cursor} from .ai/commands/, ${bundledAdapterCounts.cursor} from packages)`);
  console.log(`  ✓ .windsurf/workflows/ (${totalWindsurf} adapters: ${adapterCounts.windsurf} from .ai/commands/, ${bundledAdapterCounts.windsurf} from packages)`);
  console.log(`  ✓ commands-bundle/ (${packageCounts.bundledVariants} command variants from packages)`);
  // @cpt-end:cpt-frontx-algo-cli-tooling-build-templates:p1:inst-bundle-commands

  // @cpt-begin:cpt-frontx-algo-cli-tooling-build-templates:p1:inst-copy-ide-adapters
  // Generate IDE rules (CLAUDE.md, .cursor/rules/, .windsurf/rules/, .github/copilot-instructions.md)
  await generateIdeRules(TEMPLATES_DIR);
  console.log('  ✓ CLAUDE.md (pointer to .ai/GUIDELINES.md)');
  console.log('  ✓ .cursor/rules/frontx.mdc (pointer)');
  console.log('  ✓ .windsurf/rules/frontx.md (pointer)');
  console.log('  ✓ .github/copilot-instructions.md (GitHub Copilot)');
  // @cpt-end:cpt-frontx-algo-cli-tooling-build-templates:p1:inst-copy-ide-adapters

  // ============================================
  // Write output manifest.json (runtime manifest for CLI)
  // ============================================
  const standaloneCommandFiles = standaloneCommands
    .filter((f) => f.startsWith('commands/') && !f.includes('frontxdev-') && !f.includes('commands/internal/'));
  const outputManifest = {
    pipeline: '3-stage',
    sourceManifest: 'packages/cli/template-sources/manifest.yaml',
    stage1a: {
      source: manifest.project.source,
      items: manifest.project.contents,
    },
    stage1b: {
      source: 'project root',
      rootFiles: manifest.root.files,
      directories: manifest.root.directories,
    },
    stage1c: {
      source: 'root .ai/ (marker-based)',
      overridesSource: manifest.ai_overrides.source,
      standaloneFiles: markedFiles
        .filter((f) => f.marker === 'standalone' && !f.relativePath.includes('frontxdev-') && !f.relativePath.includes('commands/internal/'))
        .map((f) => f.relativePath),
      overrideFiles: markedFiles
        .filter((f) => f.marker === 'override')
        .map((f) => f.relativePath),
    },
    stage2: {
      generated: [
        'CLAUDE.md',
        '.cursor/rules/frontx.mdc',
        '.windsurf/rules/frontx.md',
        ...standaloneCommandFiles.map((f) => `.claude/commands/${path.basename(f)}`),
      ],
    },
    layerConfiguration: {
      description: 'Layer-aware filtering for SDK architecture',
      layers: ['sdk', 'framework', 'react', 'app'],
      targetMapping: TARGET_LAYERS,
      guidelinesVariants: {
        sdk: 'GUIDELINES.sdk.md',
        framework: 'GUIDELINES.framework.md',
        react: 'GUIDELINES.md',
        app: 'GUIDELINES.md',
      },
    },
    mfeTemplate: 'mfe-template',
    mfeShared: 'mfe-shared',
    generatedAt: new Date().toISOString(),
  };
  await fs.writeJson(path.join(TEMPLATES_DIR, 'manifest.json'), outputManifest, {
    spaces: 2,
  });

  console.log('\n✅ Templates copied successfully!');
  console.log(`   Location: ${TEMPLATES_DIR}`);
}

copyTemplates().catch((err) => {
  console.error('❌ Failed to copy templates:', err);
  process.exit(1);
});
