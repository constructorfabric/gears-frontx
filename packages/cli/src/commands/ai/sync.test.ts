import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs-extra';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {
  aiSyncCommand,
  generateClaudeMd,
  generateCopilotInstructions,
  generateCursorRules,
  generateWindsurfRules,
} from './sync.js';
import type { CommandContext } from '../../core/command.js';

async function createTempProject(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'frontx-ai-sync-test-'));
}

function createLoggerSpies() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    success: vi.fn(),
    log: vi.fn(),
    newline: vi.fn(),
  };
}

function expectUnitTestingGuidance(content: string, command: string): void {
  expect(content).toContain(`Run \`${command}\``);
  expect(content).toContain('unit-test triggers apply');
  expect(content).toContain('.ai/project/targets/UNIT_TESTING.md');
  expect(content).toContain('frontx validate');
  expect(content).toContain('structural validation only');
}

describe('generateClaudeMd', () => {
  let projectRoot: string;

  beforeEach(async () => {
    projectRoot = await createTempProject();
  });

  afterEach(async () => {
    await fs.remove(projectRoot);
  });

  it('writes a CLAUDE.md that requires the standard unit-test command and references the UNIT_TESTING target', async () => {
    const result = await generateClaudeMd(projectRoot, null, 'npm');

    expect(result.file).toBe('CLAUDE.md');
    expect(result.changed).toBe(true);

    const content = await readFile(path.join(projectRoot, 'CLAUDE.md'), 'utf-8');
    expect(content).toContain('GUIDELINES.md');
    expect(content).toContain('frontx validate components');
    expectUnitTestingGuidance(content, 'npm run test:unit');
  });

  it('appends user rules from .ai/rules/app.md when provided', async () => {
    await generateClaudeMd(projectRoot, 'Always use TypeScript.', 'npm');

    const content = await readFile(path.join(projectRoot, 'CLAUDE.md'), 'utf-8');
    expect(content).toMatch(/## Project-Specific Rules/);
    expect(content).toMatch(/Always use TypeScript\./);
  });

  it('marks the file as unchanged on a second identical write', async () => {
    await generateClaudeMd(projectRoot, null, 'npm');
    const result = await generateClaudeMd(projectRoot, null, 'npm');

    expect(result.changed).toBe(false);
  });

  it('supports diff mode for a new file without writing it', async () => {
    const logger = createLoggerSpies();

    const result = await generateClaudeMd(projectRoot, null, 'npm', {
      showDiff: true,
      logger,
    });

    expect(result).toEqual({ file: 'CLAUDE.md', changed: true });
    expect(logger.log).toHaveBeenCalledWith('\n+ CLAUDE.md (new file)');
    expect(await fs.pathExists(path.join(projectRoot, 'CLAUDE.md'))).toBe(false);
  });

  it('supports diff mode for unchanged files', async () => {
    await generateClaudeMd(projectRoot, null, 'npm');
    const logger = createLoggerSpies();

    const result = await generateClaudeMd(projectRoot, null, 'npm', {
      showDiff: true,
      logger,
    });

    expect(result).toEqual({ file: 'CLAUDE.md', changed: false });
    expect(logger.log).toHaveBeenCalledWith('\n= CLAUDE.md (unchanged)');
  });
});

describe('generateCopilotInstructions', () => {
  let projectRoot: string;

  beforeEach(async () => {
    projectRoot = await createTempProject();
  });

  afterEach(async () => {
    await fs.remove(projectRoot);
  });

  it('substitutes the arch:check command for npm', async () => {
    await generateCopilotInstructions(
      projectRoot,
      null,
      '**REQUIRED**: Use local shadcn/ui components for all UI',
      'npm'
    );

    const content = await readFile(
      path.join(projectRoot, '.github', 'copilot-instructions.md'),
      'utf-8'
    );
    expect(content).toContain('Run `npm run arch:check` before committing');
  });

  it('substitutes the arch:check command for pnpm', async () => {
    await generateCopilotInstructions(
      projectRoot,
      null,
      '**REQUIRED**: Use local shadcn/ui components for all UI',
      'pnpm'
    );

    const content = await readFile(
      path.join(projectRoot, '.github', 'copilot-instructions.md'),
      'utf-8'
    );
    expect(content).toContain('`pnpm run arch:check`');
  });

  it('substitutes the arch:check command for yarn (no "run" keyword)', async () => {
    await generateCopilotInstructions(
      projectRoot,
      null,
      '**REQUIRED**: Use local shadcn/ui components for all UI',
      'yarn'
    );

    const content = await readFile(
      path.join(projectRoot, '.github', 'copilot-instructions.md'),
      'utf-8'
    );
    expect(content).toContain('`yarn arch:check`');
  });

  it('includes both the arch:check and unit-testing rules, with unit-testing appended after arch:check', async () => {
    await generateCopilotInstructions(
      projectRoot,
      null,
      '**REQUIRED**: Use local shadcn/ui components for all UI',
      'npm'
    );

    const content = await readFile(
      path.join(projectRoot, '.github', 'copilot-instructions.md'),
      'utf-8'
    );

    const archCheckRule = 'Run `npm run arch:check` before committing';
    const unitTestingRule = 'Run `npm run test:unit`';
    const structuralRule = 'structural validation only';

    expect(content, 'the arch:check rule must be present').toContain(archCheckRule);
    expect(content, 'the unit-testing rule must be present').toContain(unitTestingRule);
    expect(content).toContain('.ai/project/targets/UNIT_TESTING.md');

    const archCheckIndex = content.indexOf(archCheckRule);
    const unitTestingIndex = content.indexOf(unitTestingRule);
    expect(
      unitTestingIndex,
      'the unit-testing rule must be appended after the arch:check rule, not inserted before it'
    ).toBeGreaterThan(archCheckIndex);
    expect(content).toContain(structuralRule);
    expect(content.indexOf(structuralRule)).toBeGreaterThan(unitTestingIndex);
  });

  it('uses the package-manager-specific test:unit command in the copilot unit-testing rule', async () => {
    await generateCopilotInstructions(
      projectRoot,
      null,
      '**REQUIRED**: Use local shadcn/ui components for all UI',
      'yarn'
    );

    const content = await readFile(
      path.join(projectRoot, '.github', 'copilot-instructions.md'),
      'utf-8'
    );

    expectUnitTestingGuidance(content, 'yarn test:unit');
  });

  it('embeds the resolved uikit rule verbatim', async () => {
    const uikitRule = '**REQUIRED**: Use the configured UI kit package `@acme/ui` for all standard UI (do not default to shadcn/ui)';

    await generateCopilotInstructions(projectRoot, null, uikitRule, 'npm');

    const content = await readFile(
      path.join(projectRoot, '.github', 'copilot-instructions.md'),
      'utf-8'
    );
    expect(content).toMatch(/@acme\/ui/);
  });
});

describe('generateCursorRules', () => {
  let projectRoot: string;

  beforeEach(async () => {
    projectRoot = await createTempProject();
  });

  afterEach(async () => {
    await fs.remove(projectRoot);
  });

  it('writes .cursor/rules/frontx.mdc with unit-testing guidance', async () => {
    const result = await generateCursorRules(projectRoot, null, 'npm');

    expect(result.file).toBe('.cursor/rules/frontx.mdc');
    expect(result.changed).toBe(true);

    const content = await readFile(
      path.join(projectRoot, '.cursor', 'rules', 'frontx.mdc'),
      'utf-8'
    );
    expect(content).toContain('alwaysApply: true');
    expectUnitTestingGuidance(content, 'npm run test:unit');
  });

  it('uses the package-manager-specific test command in generated rules', async () => {
    await generateCursorRules(projectRoot, null, 'yarn');

    const content = await readFile(
      path.join(projectRoot, '.cursor', 'rules', 'frontx.mdc'),
      'utf-8'
    );

    expectUnitTestingGuidance(content, 'yarn test:unit');
  });

  it('marks the generated rules as unchanged on a second identical write', async () => {
    await generateCursorRules(projectRoot, null, 'npm');
    const result = await generateCursorRules(projectRoot, null, 'npm');

    expect(result.changed).toBe(false);
  });
});

describe('generateWindsurfRules', () => {
  let projectRoot: string;

  beforeEach(async () => {
    projectRoot = await createTempProject();
  });

  afterEach(async () => {
    await fs.remove(projectRoot);
  });

  it('writes .windsurf/rules/frontx.md with unit-testing guidance', async () => {
    const result = await generateWindsurfRules(projectRoot, null, 'npm');

    expect(result.file).toBe('.windsurf/rules/frontx.md');
    expect(result.changed).toBe(true);

    const content = await readFile(
      path.join(projectRoot, '.windsurf', 'rules', 'frontx.md'),
      'utf-8'
    );
    expect(content).toContain('trigger: always_on');
    expectUnitTestingGuidance(content, 'npm run test:unit');
  });

  it('appends user rules from .ai/rules/app.md', async () => {
    await generateWindsurfRules(projectRoot, 'Prefer composition over inheritance.', 'npm');

    const content = await readFile(
      path.join(projectRoot, '.windsurf', 'rules', 'frontx.md'),
      'utf-8'
    );
    expect(content).toMatch(/## Project-Specific Rules/);
    expect(content).toMatch(/Prefer composition over inheritance\./);
  });

  it('uses the package-manager-specific test command in generated rules', async () => {
    await generateWindsurfRules(projectRoot, null, 'pnpm');

    const content = await readFile(
      path.join(projectRoot, '.windsurf', 'rules', 'frontx.md'),
      'utf-8'
    );

    expectUnitTestingGuidance(content, 'pnpm run test:unit');
  });
});

describe('aiSyncCommand', () => {
  let projectRoot: string;

  beforeEach(async () => {
    projectRoot = await createTempProject();
  });

  afterEach(async () => {
    await fs.remove(projectRoot);
  });

  function createContext(
    logger = createLoggerSpies(),
    config: CommandContext['config'] = null,
    root: string | null = projectRoot
  ): CommandContext {
    return {
      cwd: projectRoot,
      projectRoot: root,
      config,
      logger: logger as unknown as CommandContext['logger'],
      prompt: async <T extends Record<string, unknown>>() => ({} as T),
    };
  }

  it('fails validation when not inside a project', () => {
    expect(aiSyncCommand.validate({}, createContext(createLoggerSpies(), null, null))).toEqual({
      ok: false,
      errors: [
        {
          code: 'NOT_IN_PROJECT',
          message: 'Not inside a FrontX project. Run this command from a project root.',
        },
      ],
    });
  });

  it('passes validation when projectRoot is present', () => {
    expect(aiSyncCommand.validate({}, createContext())).toEqual({
      ok: true,
      errors: [],
    });
  });

  it('returns early in diff mode when the .ai directory is missing', async () => {
    await fs.writeJson(path.join(projectRoot, 'package.json'), {
      scripts: { 'test:unit': 'vitest --run' },
    });
    const logger = createLoggerSpies();

    await expect(
      aiSyncCommand.execute({ diff: true }, createContext(logger))
    ).resolves.toEqual({
      filesGenerated: [],
      commandsGenerated: 0,
      toolsUpdated: [],
    });

    expect(logger.warn).toHaveBeenCalledWith('.ai/ directory not found. Nothing to diff.');
  });

  it('generates tool configs and command adapters with project/company/frontx/package precedence', async () => {
    await fs.writeJson(path.join(projectRoot, 'package.json'), {
      packageManager: 'pnpm@10.1.0',
      scripts: { 'test:unit': 'vitest --run' },
    });
    await fs.writeJson(path.join(projectRoot, 'frontx.config.json'), {
      frontx: true,
      uikit: '@acme/ui',
    });

    await fs.ensureDir(path.join(projectRoot, '.ai', 'commands'));
    await fs.ensureDir(path.join(projectRoot, '.ai', 'company', 'commands'));
    await fs.ensureDir(path.join(projectRoot, '.ai', 'project', 'commands'));
    await fs.ensureDir(path.join(projectRoot, '.ai', 'rules'));
    await fs.ensureDir(path.join(projectRoot, '.ai', 'project', 'targets'));

    await fs.writeFile(
      path.join(projectRoot, '.ai', 'commands', 'frontx-shared.md'),
      '# frontx:shared - FrontX shared command\n\nfrontx shared body\n'
    );
    await fs.writeFile(
      path.join(projectRoot, '.ai', 'company', 'commands', 'frontx-shared.md'),
      '# frontx:shared - Company shared command\n\ncompany shared body\n'
    );
    await fs.writeFile(
      path.join(projectRoot, '.ai', 'company', 'commands', 'frontx-company.md'),
      '# frontx:company - Company command\n\ncompany body\n'
    );
    await fs.writeFile(
      path.join(projectRoot, '.ai', 'project', 'commands', 'frontx-shared.md'),
      '# frontx:shared - Project shared command\n\nproject shared body\n'
    );
    await fs.writeFile(
      path.join(projectRoot, '.ai', 'project', 'commands', 'frontx-project.md'),
      '# frontx:project - Project command\n\nproject body\n'
    );
    await fs.writeFile(
      path.join(projectRoot, '.ai', 'rules', 'app.md'),
      'Always use project-specific sync rules.\n'
    );
    await fs.writeFile(
      path.join(projectRoot, '.ai', 'project', 'targets', 'UNIT_TESTING.md'),
      '# Unit Testing\n\n## COVERAGE RULES\n- keep tests focused\n'
    );

    const packageDir = path.join(projectRoot, 'node_modules', '@gears-frontx', 'mock-package');
    const pkgCommandsDir = path.join(packageDir, 'commands');
    await fs.ensureDir(pkgCommandsDir);
    await fs.writeFile(
      path.join(pkgCommandsDir, 'frontx-package.md'),
      '# frontx:package - Package command\n\npackage command body\n'
    );
    await fs.writeFile(
      path.join(pkgCommandsDir, 'frontxdev-internal.md'),
      '# frontxdev:internal - Should be ignored\n'
    );
    await fs.writeFile(path.join(packageDir, 'CLAUDE.md'), '# Mock package docs\n');

    const logger = createLoggerSpies();
    const result = await aiSyncCommand.execute(
      { tool: 'all', detectPackages: true },
      createContext(logger, { frontx: true, uikit: '@acme/ui' })
    );

    expect(result.filesGenerated).toEqual([
      'CLAUDE.md',
      '.github/copilot-instructions.md',
      '.cursor/rules/frontx.mdc',
      '.windsurf/rules/frontx.md',
    ]);
    expect(result.commandsGenerated).toBe(16);
    expect(result.toolsUpdated).toEqual([
      'Claude',
      'GitHub Copilot',
      'Cursor',
      'Windsurf',
    ]);

    const claudeContent = await readFile(path.join(projectRoot, 'CLAUDE.md'), 'utf-8');
    expect(claudeContent).toContain('pnpm run test:unit');
    expect(claudeContent).toContain('Always use project-specific sync rules.');

    const copilotContent = await readFile(
      path.join(projectRoot, '.github', 'copilot-instructions.md'),
      'utf-8'
    );
    expect(copilotContent).toContain('@acme/ui');
    expect(copilotContent).toContain('pnpm run arch:check');

    const claudeSharedAdapter = await readFile(
      path.join(projectRoot, '.claude', 'commands', 'frontx-shared.md'),
      'utf-8'
    );
    expect(claudeSharedAdapter).toContain('description: Project shared command');
    expect(claudeSharedAdapter).toContain('Use `.ai/project/commands/frontx-shared.md`');

    const copilotPackageCommand = await readFile(
      path.join(projectRoot, '.github', 'copilot-commands', 'frontx-package.md'),
      'utf-8'
    );
    expect(copilotPackageCommand).toContain('package command body');

    expect(logger.log).toHaveBeenCalledWith('  ✓ Found user rules in .ai/rules/app.md');
    expect(logger.log).toHaveBeenCalledWith('  ✓ Found 1 commands from installed packages');
    expect(logger.warn).toHaveBeenCalledWith(
      'Unit testing guidance is present but missing expected Vitest EXECUTION/ENVIRONMENT sections.'
    );
    expect(logger.log).toHaveBeenCalledWith(
      'Detected 1 @gears-frontx packages with documentation:'
    );
  });
});
