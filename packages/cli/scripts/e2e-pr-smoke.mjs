// @cpt-flow:cpt-frontx-flow-cli-tooling-e2e-pr:p1
// @cpt-dod:cpt-frontx-dod-cli-tooling-e2e-pr:p1
import path from 'path';
import process from 'node:process';
import { CLI_ENTRY, createHarness, shouldSkipInstall } from './e2e-lib.mjs';

// @cpt-begin:cpt-frontx-flow-cli-tooling-e2e-pr:p1:inst-e2e-pr-trigger
// CI triggers .github/workflows/cli-pr.yml on pull request to main; job cli-pr-e2e starts on ubuntu-latest with Node 24.14.x
// @cpt-end:cpt-frontx-flow-cli-tooling-e2e-pr:p1:inst-e2e-pr-trigger

// @cpt-begin:cpt-frontx-flow-cli-tooling-e2e-pr:p1:inst-e2e-pr-build-cli
// @gears-frontx/cli is built via npm run build --workspace=@gears-frontx/cli before this script runs
// @cpt-end:cpt-frontx-flow-cli-tooling-e2e-pr:p1:inst-e2e-pr-build-cli

// @cpt-begin:cpt-frontx-flow-cli-tooling-e2e-pr:p1:inst-e2e-pr-create-harness
const harness = createHarness('pr');
// @cpt-end:cpt-frontx-flow-cli-tooling-e2e-pr:p1:inst-e2e-pr-create-harness
const skipInstall = shouldSkipInstall();
const packageManager = process.env.CLI_E2E_PM || 'npm';
const expectedManagerEngines = {
  npm: '>=10.0.0',
  pnpm: '>=10.0.0',
  yarn: '>=4.0.0',
};

function runScriptArgs(scriptName, extraArgs = []) {
  if (packageManager === 'yarn') {
    return [scriptName, ...extraArgs];
  }
  if (extraArgs.length > 0) {
    return ['run', scriptName, '--', ...extraArgs];
  }
  return ['run', scriptName];
}

/**
 * Args for `test:unit` with verbose reporter. pnpm's `run <script> -- <args>` can
 * forward a stray `--` token into Vitest, which then drops --reporter=verbose from
 * stdout; `pnpm exec vitest` matches npm/yarn output for assertStepOutputIncludes.
 */
function runVitestUnitArgs() {
  if (packageManager === 'pnpm') {
    return ['exec', 'vitest', '--run', '--passWithNoTests=false', '--reporter=verbose'];
  }
  return runScriptArgs('test:unit', ['--reporter=verbose']);
}

function runScriptCommand(scriptName) {
  if (packageManager === 'yarn') {
    return `yarn ${scriptName}`;
  }
  return `${packageManager} run ${scriptName}`;
}

function assertStepOutputIncludes(stepResult, expectedSnippet, message) {
  const output = `${stepResult.stdout || ''}\n${stepResult.stderr || ''}`;
  harness.assert(output.includes(expectedSnippet), message);
}

function installArgs() {
  if (packageManager === 'npm') {
    return ['install', '--no-audit', '--no-fund'];
  }
  if (packageManager === 'pnpm') {
    return ['install', '--no-frozen-lockfile'];
  }
  return ['install', '--no-immutable'];
}

function runProjectValidation(projectRoot) {
  // @cpt-begin:cpt-frontx-flow-cli-tooling-e2e-pr:p1:inst-e2e-pr-validate-clean
  harness.runStep({
    name: 'validate-components-clean',
    cwd: projectRoot,
    command: 'node',
    args: [CLI_ENTRY, 'validate', 'components'],
  });
  // @cpt-end:cpt-frontx-flow-cli-tooling-e2e-pr:p1:inst-e2e-pr-validate-clean

  // @cpt-begin:cpt-frontx-flow-cli-tooling-e2e-pr:p1:inst-e2e-pr-validate-bad
  const badScreenPath = path.join(
    projectRoot,
    'src',
    'screensets',
    'test',
    'screens',
    'bad',
    'BadScreen.tsx'
  );
  harness.writeFile(
    badScreenPath,
    [
      "import React from 'react';",
      '',
      "const BadScreen: React.FC = () => <div style={{ color: '#ff0000' }}>bad</div>;",
      '',
      'export default BadScreen;',
      '',
    ].join('\n')
  );

  harness.runStep({
    name: 'validate-components-bad-screen',
    cwd: projectRoot,
    command: 'node',
    args: [CLI_ENTRY, 'validate', 'components'],
    expectExit: 1,
  });
  // @cpt-end:cpt-frontx-flow-cli-tooling-e2e-pr:p1:inst-e2e-pr-validate-bad
}

try {
  const workspace = harness.makeTempDir('workspace');
  const projectRoot = path.join(workspace, 'smoke-app');
  const demoMfeRoot = path.join(projectRoot, 'src', 'mfe_packages', 'demo-mfe');

  // @cpt-begin:cpt-frontx-flow-cli-tooling-e2e-pr:p1:inst-e2e-pr-create-app
  harness.runStep({
    name: 'create-app',
    cwd: workspace,
    command: 'node',
    args: [
      CLI_ENTRY,
      'create',
      'smoke-app',
      '--no-studio',
      '--local',
      '--uikit',
      'shadcn',
      '--package-manager',
      packageManager,
    ],
  });
  // @cpt-end:cpt-frontx-flow-cli-tooling-e2e-pr:p1:inst-e2e-pr-create-app

  // @cpt-begin:cpt-frontx-flow-cli-tooling-e2e-pr:p1:inst-e2e-pr-assert-files
  harness.assertPathExists(path.join(projectRoot, 'frontx.config.json'));
  harness.assertPathExists(path.join(projectRoot, 'package.json'));
  harness.assertPathExists(path.join(projectRoot, '.ai', 'GUIDELINES.md'));
  harness.assertPathExists(path.join(projectRoot, '.ai', 'project', 'GUIDELINES.md'));
  harness.assertPathExists(path.join(projectRoot, '.ai', 'project', 'targets', 'UNIT_TESTING.md'));
  harness.assertPathExists(path.join(projectRoot, 'vitest.config.ts'));
  harness.assertPathExists(path.join(projectRoot, 'src', 'app', 'layout', 'Layout.tsx'));
  harness.assertPathExists(path.join(projectRoot, 'src', 'app', 'lib', 'utils.test.ts'));
  harness.assertPathExists(path.join(projectRoot, 'scripts', 'generate-mfe-manifests.ts'));
  harness.assertPathExists(path.join(demoMfeRoot, 'package.json'));
  harness.assertPathExists(path.join(demoMfeRoot, 'vitest.config.ts'));
  harness.assertPathExists(path.join(demoMfeRoot, 'src', 'screens', 'home', 'HomeScreen.test.tsx'));
  // @cpt-end:cpt-frontx-flow-cli-tooling-e2e-pr:p1:inst-e2e-pr-assert-files

  // @cpt-begin:cpt-frontx-flow-cli-tooling-e2e-pr:p1:inst-e2e-pr-assert-engines
  const packageJson = harness.readJson(path.join(projectRoot, 'package.json'), {
    within: projectRoot,
  });
  harness.assert(
    packageJson.engines?.node === '>=24.14.0',
    'Generated project must pin node >=24.14.0'
  );
  harness.assert(
    packageJson.packageManager?.startsWith(`${packageManager}@`),
    `Generated project must set packageManager to ${packageManager}`
  );
  harness.assert(
    packageJson.engines?.[packageManager] === expectedManagerEngines[packageManager],
    `Generated project engines must require ${packageManager} ${expectedManagerEngines[packageManager]}`
  );
  harness.assert(
    typeof packageJson.dependencies?.['@gears-frontx/react'] === 'string' &&
      packageJson.dependencies['@gears-frontx/react'].startsWith('file:'),
    'PR smoke generated project must use local @gears-frontx packages from the checked-out monorepo'
  );
  if (packageManager === 'pnpm') {
    harness.assertPathExists(path.join(projectRoot, 'pnpm-workspace.yaml'));
  }
  if (packageManager === 'yarn') {
    harness.assertPathExists(path.join(projectRoot, '.yarnrc.yml'));
  }
  const frontxConfig = harness.readJson(path.join(projectRoot, 'frontx.config.json'), {
    within: projectRoot,
  });
  harness.assert(
    frontxConfig.packageManager === packageManager,
    `Generated frontx.config.json must set packageManager to ${packageManager}`
  );
  harness.assert(
    !('packageManagerVersion' in frontxConfig),
    'Generated frontx.config.json must not include packageManagerVersion'
  );
  const readmeContent = harness.readText(path.join(projectRoot, 'README.md'), {
    within: projectRoot,
  });
  harness.assert(
    readmeContent.includes(`${packageManager} install`) ||
      (packageManager === 'yarn' && readmeContent.includes('yarn dev')),
    'Generated README must include concrete package-manager setup commands'
  );
  harness.assert(
    packageJson.scripts?.['test:unit'] === 'vitest --run --passWithNoTests=false',
    'Generated project must expose test:unit as the standard unit-test command'
  );
  harness.assert(
    packageJson.scripts?.['test:unit:watch'] === 'vitest --watch',
    'Generated project must expose test:unit:watch'
  );
  harness.assert(
    typeof packageJson.devDependencies?.vitest === 'string' &&
      packageJson.devDependencies.vitest.length > 0,
    'Generated project must declare vitest in devDependencies'
  );
  const copilotInstructions = harness.readText(
    path.join(projectRoot, '.github', 'copilot-instructions.md'),
    { within: projectRoot }
  );
  const newScreenCommand = harness.readText(
    path.join(projectRoot, '.ai', 'commands', 'frontx-new-screen.md'),
    { within: projectRoot }
  );
  const newComponentCommand = harness.readText(
    path.join(projectRoot, '.ai', 'commands', 'frontx-new-component.md'),
    { within: projectRoot }
  );
  harness.assert(
    copilotInstructions.includes('test:unit'),
    'Generated AI guidance must reference the standard unit-test workflow'
  );
  harness.assert(
    newScreenCommand.includes('Add or update a screen test'),
    'Generated new-screen command must require a starter screen test'
  );
  harness.assert(
    newComponentCommand.includes('shared composite') &&
      newComponentCommand.includes(runScriptCommand('test:unit')),
    'Generated new-component command must require tests for shared composites'
  );
  // @cpt-end:cpt-frontx-flow-cli-tooling-e2e-pr:p1:inst-e2e-pr-assert-engines

  // @cpt-begin:cpt-frontx-flow-cli-tooling-e2e-pr:p1:inst-e2e-pr-git-init-install
  if (!skipInstall) {
    harness.runStep({
      name: 'git-init-generated-project',
      cwd: projectRoot,
      command: 'git',
      args: ['init'],
    });

    harness.runStep({
      name: `${packageManager}-install`,
      cwd: projectRoot,
      command: packageManager,
      args: installArgs(),
    });
    // @cpt-end:cpt-frontx-flow-cli-tooling-e2e-pr:p1:inst-e2e-pr-git-init-install

    // @cpt-begin:cpt-frontx-flow-cli-tooling-e2e-pr:p1:inst-e2e-pr-build-typecheck
    harness.runStep({
      name: 'build-generated-project',
      cwd: projectRoot,
      command: packageManager,
      args: runScriptArgs('build'),
    });

    harness.runStep({
      name: 'type-check-generated-project',
      cwd: projectRoot,
      command: packageManager,
      args: runScriptArgs('type-check'),
    });

    const rootUnitTestResult = harness.runStep({
      name: 'test-unit-generated-project',
      cwd: projectRoot,
      command: packageManager,
      args: runVitestUnitArgs(),
    });
    assertStepOutputIncludes(
      rootUnitTestResult,
      'src/app/mfe/bootstrap.test.ts',
      'Generated project root test:unit must execute the host-side MFE bootstrap smoke test'
    );

    const demoMfeUnitTestResult = harness.runStep({
      name: 'test-unit-generated-demo-mfe',
      cwd: demoMfeRoot,
      command: packageManager,
      args: runVitestUnitArgs(),
    });
    assertStepOutputIncludes(
      demoMfeUnitTestResult,
      'src/screens/home/HomeScreen.test.tsx',
      'Generated demo MFE must execute inherited _blank-mfe Vitest tests'
    );
    // @cpt-end:cpt-frontx-flow-cli-tooling-e2e-pr:p1:inst-e2e-pr-build-typecheck
  } else {
    harness.log(`Skipping ${packageManager} install/build/type-check/test:unit`);
  }

  runProjectValidation(projectRoot);

  // @cpt-begin:cpt-frontx-flow-cli-tooling-e2e-pr:p1:inst-e2e-pr-scaffold-layout
  harness.runStep({
    name: 'scaffold-layout-force',
    cwd: projectRoot,
    command: 'node',
    args: [CLI_ENTRY, 'scaffold', 'layout', '-f'],
  });
  // @cpt-end:cpt-frontx-flow-cli-tooling-e2e-pr:p1:inst-e2e-pr-scaffold-layout

  // @cpt-begin:cpt-frontx-flow-cli-tooling-e2e-pr:p1:inst-e2e-pr-ai-sync
  harness.runStep({
    name: 'ai-sync-diff',
    cwd: projectRoot,
    command: 'node',
    args: [CLI_ENTRY, 'ai', 'sync', '--tool', 'all', '--diff'],
  });
  // @cpt-end:cpt-frontx-flow-cli-tooling-e2e-pr:p1:inst-e2e-pr-ai-sync

  // @cpt-begin:cpt-frontx-flow-cli-tooling-e2e-pr:p1:inst-e2e-pr-upload-artifacts
  // CI uploads step logs and JSON summary as artifacts (handled in cli-pr.yml workflow)
  // @cpt-end:cpt-frontx-flow-cli-tooling-e2e-pr:p1:inst-e2e-pr-upload-artifacts

  // @cpt-begin:cpt-frontx-flow-cli-tooling-e2e-pr:p1:inst-e2e-pr-return
  harness.complete('passed');
  harness.log(`Completed successfully. Logs: ${harness.artifactDir}`);
  // @cpt-end:cpt-frontx-flow-cli-tooling-e2e-pr:p1:inst-e2e-pr-return
} catch (error) {
  harness.complete('failed');
  globalThis.console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
