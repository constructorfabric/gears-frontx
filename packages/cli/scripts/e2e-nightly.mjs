// @cpt-flow:cpt-frontx-flow-cli-tooling-e2e-nightly:p2
// @cpt-dod:cpt-frontx-dod-cli-tooling-e2e-nightly:p1
import fs from 'fs';
import path from 'path';
import process from 'node:process';
import { CLI_ENTRY, createHarness, shouldSkipInstall } from './e2e-lib.mjs';

// @cpt-begin:cpt-frontx-flow-cli-tooling-e2e-nightly:p2:inst-e2e-nightly-trigger
// CI triggers .github/workflows/cli-nightly.yml on schedule (daily 03:00 UTC) or manual dispatch
// @cpt-end:cpt-frontx-flow-cli-tooling-e2e-nightly:p2:inst-e2e-nightly-trigger

// @cpt-begin:cpt-frontx-flow-cli-tooling-e2e-nightly:p2:inst-e2e-nightly-build-cli
// @gears-frontx/cli is built via npm run build --workspace=@gears-frontx/cli before this script runs
// @cpt-end:cpt-frontx-flow-cli-tooling-e2e-nightly:p2:inst-e2e-nightly-build-cli

// @cpt-begin:cpt-frontx-flow-cli-tooling-e2e-nightly:p2:inst-e2e-nightly-create-harness
const harness = createHarness('nightly');
// @cpt-end:cpt-frontx-flow-cli-tooling-e2e-nightly:p2:inst-e2e-nightly-create-harness
const skipInstall = shouldSkipInstall();
const expectedManagerEngines = {
  npm: '>=10.0.0',
  pnpm: '>=10.0.0',
  yarn: '>=4.0.0',
};

function runScriptArgs(packageManager, scriptName) {
  if (packageManager === 'yarn') {
    return [scriptName];
  }
  return ['run', scriptName];
}

function installArgs(packageManager) {
  if (packageManager === 'npm') {
    return ['install', '--no-audit', '--no-fund'];
  }
  if (packageManager === 'pnpm') {
    return ['install', '--no-frozen-lockfile'];
  }
  return ['install', '--no-immutable'];
}

function maybeInstallAndCheck(projectRoot, packageManager = 'npm', includeTypeCheck = true) {
  if (skipInstall) {
    harness.log(`Skipping ${packageManager} install/build for ${projectRoot}`);
    return;
  }

  harness.runStep({
    name: `git-init-${path.basename(projectRoot)}`,
    cwd: projectRoot,
    command: 'git',
    args: ['init'],
  });

  harness.runStep({
    name: `${packageManager}-install-${path.basename(projectRoot)}`,
    cwd: projectRoot,
    command: packageManager,
    args: installArgs(packageManager),
  });

  harness.runStep({
    name: `build-${path.basename(projectRoot)}`,
    cwd: projectRoot,
    command: packageManager,
    args: runScriptArgs(packageManager, 'build'),
  });

  if (includeTypeCheck) {
    harness.runStep({
      name: `type-check-${path.basename(projectRoot)}`,
      cwd: projectRoot,
      command: packageManager,
      args: runScriptArgs(packageManager, 'type-check'),
    });
  }
}

try {
  const workspace = harness.makeTempDir('workspace');

  const appRoot = path.join(workspace, 'nightly-app');
  // @cpt-begin:cpt-frontx-flow-cli-tooling-e2e-nightly:p2:inst-e2e-nightly-create-default
  harness.runStep({
    name: 'create-frontx-app',
    cwd: workspace,
    command: 'node',
    args: [CLI_ENTRY, 'create', 'nightly-app', '--no-studio', '--uikit', 'shadcn', '--package-manager', 'npm'],
  });
  const appPackageJson = harness.readJson(path.join(appRoot, 'package.json'));
  harness.assert(
    appPackageJson.engines?.npm === expectedManagerEngines.npm,
    `npm app should require npm ${expectedManagerEngines.npm}`
  );
  const appConfig = harness.readJson(path.join(appRoot, 'frontx.config.json'));
  harness.assert(
    appConfig.packageManager === 'npm',
    'npm app frontx.config.json must set packageManager to npm'
  );
  harness.assert(
    !('packageManagerVersion' in appConfig),
    'npm app frontx.config.json must not include packageManagerVersion'
  );
  maybeInstallAndCheck(appRoot, 'npm', true);
  // @cpt-end:cpt-frontx-flow-cli-tooling-e2e-nightly:p2:inst-e2e-nightly-create-default

  const pnpmRoot = path.join(workspace, 'nightly-pnpm');
  harness.runStep({
    name: 'create-pnpm-app',
    cwd: workspace,
    command: 'node',
    args: [CLI_ENTRY, 'create', 'nightly-pnpm', '--no-studio', '--uikit', 'shadcn', '--package-manager', 'pnpm'],
  });
  const pnpmPackageJson = harness.readJson(path.join(pnpmRoot, 'package.json'));
  harness.assert(
    pnpmPackageJson.packageManager?.startsWith('pnpm@'),
    'pnpm app should set packageManager to pnpm'
  );
  harness.assert(
    pnpmPackageJson.engines?.pnpm === expectedManagerEngines.pnpm,
    `pnpm app should require pnpm ${expectedManagerEngines.pnpm}`
  );
  harness.assertPathExists(path.join(pnpmRoot, 'pnpm-workspace.yaml'));
  const pnpmConfig = harness.readJson(path.join(pnpmRoot, 'frontx.config.json'));
  harness.assert(
    pnpmConfig.packageManager === 'pnpm',
    'pnpm app frontx.config.json must set packageManager to pnpm'
  );
  harness.assert(
    !('packageManagerVersion' in pnpmConfig),
    'pnpm app frontx.config.json must not include packageManagerVersion'
  );
  maybeInstallAndCheck(pnpmRoot, 'pnpm', true);

  const yarnRoot = path.join(workspace, 'nightly-yarn');
  harness.runStep({
    name: 'create-yarn-app',
    cwd: workspace,
    command: 'node',
    args: [CLI_ENTRY, 'create', 'nightly-yarn', '--no-studio', '--uikit', 'shadcn', '--package-manager', 'yarn'],
  });
  const yarnPackageJson = harness.readJson(path.join(yarnRoot, 'package.json'));
  harness.assert(
    yarnPackageJson.packageManager?.startsWith('yarn@'),
    'yarn app should set packageManager to yarn'
  );
  harness.assert(
    yarnPackageJson.engines?.yarn === expectedManagerEngines.yarn,
    `yarn app should require yarn ${expectedManagerEngines.yarn}`
  );
  harness.assertPathExists(path.join(yarnRoot, '.yarnrc.yml'));
  const yarnConfig = harness.readJson(path.join(yarnRoot, 'frontx.config.json'));
  harness.assert(
    yarnConfig.packageManager === 'yarn',
    'yarn app frontx.config.json must set packageManager to yarn'
  );
  harness.assert(
    !('packageManagerVersion' in yarnConfig),
    'yarn app frontx.config.json must not include packageManagerVersion'
  );
  maybeInstallAndCheck(yarnRoot, 'yarn', true);

  // @cpt-begin:cpt-frontx-flow-cli-tooling-e2e-nightly:p2:inst-e2e-nightly-migrate-commands
  harness.runStep({
    name: 'migrate-list',
    cwd: appRoot,
    command: 'node',
    args: [CLI_ENTRY, 'migrate', '--list'],
  });

  harness.runStep({
    name: 'migrate-status',
    cwd: appRoot,
    command: 'node',
    args: [CLI_ENTRY, 'migrate', '--status'],
  });
  // @cpt-end:cpt-frontx-flow-cli-tooling-e2e-nightly:p2:inst-e2e-nightly-migrate-commands

  // @cpt-begin:cpt-frontx-flow-cli-tooling-e2e-nightly:p2:inst-e2e-nightly-ai-sync-idempotent
  harness.runStep({
    name: 'ai-sync-diff-first',
    cwd: appRoot,
    command: 'node',
    args: [CLI_ENTRY, 'ai', 'sync', '--tool', 'all', '--diff'],
  });

  harness.runStep({
    name: 'ai-sync-diff-second',
    cwd: appRoot,
    command: 'node',
    args: [CLI_ENTRY, 'ai', 'sync', '--tool', 'all', '--diff'],
  });
  // @cpt-end:cpt-frontx-flow-cli-tooling-e2e-nightly:p2:inst-e2e-nightly-ai-sync-idempotent

  // @cpt-begin:cpt-frontx-flow-cli-tooling-e2e-nightly:p2:inst-e2e-nightly-custom-uikit
  const customRoot = path.join(workspace, 'nightly-custom');
  harness.runStep({
    name: 'create-custom-app',
    cwd: workspace,
    command: 'node',
    args: [CLI_ENTRY, 'create', 'nightly-custom', '--no-studio', '--uikit', 'none', '--package-manager', 'npm'],
  });
  maybeInstallAndCheck(customRoot, 'npm', true);
  // @cpt-end:cpt-frontx-flow-cli-tooling-e2e-nightly:p2:inst-e2e-nightly-custom-uikit

  // @cpt-begin:cpt-frontx-flow-cli-tooling-e2e-nightly:p2:inst-e2e-nightly-layer-scaffolds
  for (const layer of ['sdk', 'framework', 'react']) {
    const projectName = `nightly-${layer}`;
    const projectRoot = path.join(workspace, projectName);
    harness.runStep({
      name: `create-${layer}-layer`,
      cwd: workspace,
      command: 'node',
      args: [CLI_ENTRY, 'create', projectName, '--layer', layer],
    });
    const layerReadme = fs.readFileSync(path.join(projectRoot, 'README.md'), 'utf8');
    harness.assert(
      layerReadme.includes(`npm install ${projectName}`),
      `Layer README must include install command with package name for ${projectName}`
    );
    maybeInstallAndCheck(projectRoot, 'npm', true);
  }
  // @cpt-end:cpt-frontx-flow-cli-tooling-e2e-nightly:p2:inst-e2e-nightly-layer-scaffolds

  // @cpt-begin:cpt-frontx-flow-cli-tooling-e2e-nightly:p2:inst-e2e-nightly-invalid-name
  harness.runStep({
    name: 'reject-invalid-name',
    cwd: workspace,
    command: 'node',
    args: [CLI_ENTRY, 'create', 'Invalid Name'],
    expectExit: 1,
  });
  // @cpt-end:cpt-frontx-flow-cli-tooling-e2e-nightly:p2:inst-e2e-nightly-invalid-name

  // @cpt-begin:cpt-frontx-flow-cli-tooling-e2e-nightly:p2:inst-e2e-nightly-upload-artifacts
  // CI uploads step logs and JSON summary as artifacts (handled in cli-nightly.yml workflow)
  // @cpt-end:cpt-frontx-flow-cli-tooling-e2e-nightly:p2:inst-e2e-nightly-upload-artifacts

  // @cpt-begin:cpt-frontx-flow-cli-tooling-e2e-nightly:p2:inst-e2e-nightly-return
  harness.complete('passed');
  harness.log(`Completed successfully. Logs: ${harness.artifactDir}`);
  // @cpt-end:cpt-frontx-flow-cli-tooling-e2e-nightly:p2:inst-e2e-nightly-return
} catch (error) {
  harness.complete('failed');
  globalThis.console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
