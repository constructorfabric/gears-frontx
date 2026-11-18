import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ecosystemScopeMatcher, readEcosystemPackages, readPackageManifest, readRepoDefinedPackageNames } from './ecosystem-packages.mjs';

/** @typedef {{ name: string, version: string }} Identity */
/** @typedef {Identity & { tarball: string, sha256: string, bundled: Identity[], outputs: Record<string, string> }} InventoryRow */
/** @typedef {InventoryRow & { local: string, integrity: string, manifest: Manifest }} Artifact */
/** @typedef {Identity & { dependencies?: Record<string, string>, peerDependencies?: Record<string, string>, peerDependenciesMeta?: Record<string, { optional?: boolean }>, optionalDependencies?: Record<string, string>, os?: string[], cpu?: string[], libc?: string[] }} Manifest */
/** @typedef {{ name?: string, version?: string, resolved?: string, integrity?: string, link?: boolean }} LockEntry */
/** @typedef {Identity & { path: string }} PublishRow */

const optionalPeers = new Map([
  ['@gears-frontx/mfes', '@gears-frontx/gts-plugin'],
  ['@gears-frontx/ui-kit', 'exceljs'],
]);
const installFlags = [
  '--omit=dev', '--include=peer', '--include=optional', '--ignore-scripts', '--no-audit', '--no-fund',
  '--strict-peer-deps', '--legacy-peer-deps=false', '--force=false', '--global=false', '--workspaces=false',
];
const hexDigest = /^[a-f0-9]{64}$/;
const packageName = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/;
const exactVersion = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

/** @param {unknown} condition @param {string} message @returns {asserts condition} */
function requireAudit(condition, message) {
  if (!condition) throw new Error(message);
}

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** @param {unknown} value @returns {value is Identity} */
function isIdentity(value) {
  return isRecord(value) && typeof value.name === 'string' && packageName.test(value.name) &&
    typeof value.version === 'string' && exactVersion.test(value.version);
}

/** @param {string} file @returns {unknown} */
function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

/** @param {string} rootDir */
function releasePackages(rootDir) {
  const packages = readEcosystemPackages(rootDir).filter(({ dir }) =>
    readPackageManifest(join(rootDir, 'packages', dir, 'package.json')).private !== true);
  requireAudit(packages.length > 0, 'No release packages found in packages/*');
  requireAudit(new Set(packages.map(({ name }) => name)).size === packages.length, 'Duplicate release package name');
  return packages;
}

/** @param {string} command @param {string[]} args @param {string} cwd */
function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', timeout: 120_000, maxBuffer: 16 * 1024 * 1024 });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed (${result.error?.message ?? result.signal ?? result.status})\n${result.stdout ?? ''}${result.stderr ?? ''}`);
  }
  return result.stdout;
}

/**
 * @param {ReturnType<typeof releasePackages>} expected
 * @param {string} packDir
 * @param {unknown} inventory
 * @param {string} scratch
 */
function prepareArtifacts(expected, packDir, inventory, scratch) {
  requireAudit(Array.isArray(inventory), 'Inventory must be an array of pack records');
  const packFiles = new Set(readdirSync(packDir).filter((file) => file.endsWith('.tgz')));
  const expectedVersions = new Map(expected.map(({ name, version }) => [name, version]));
  /** @type {Map<string, Artifact>} */
  const artifacts = new Map();
  for (const row of /** @type {unknown[]} */ (inventory)) {
    requireAudit(isRecord(row), 'Invalid inventory record');
    const { tarball, sha256, bundled, outputs } = row;
    requireAudit(isIdentity(row) && typeof tarball === 'string' && isAbsolute(tarball) &&
      typeof sha256 === 'string' && hexDigest.test(sha256) && Array.isArray(bundled) && bundled.every(isIdentity) &&
      isRecord(outputs) && Object.entries(outputs).every(([file, hash]) =>
        file && !isAbsolute(file) && !file.split(/[\\/]/).includes('..') && typeof hash === 'string' && hexDigest.test(hash)),
    'Invalid inventory record fields');
    const { name, version } = row;
    requireAudit(expectedVersions.get(name) === version, `Unexpected inventory identity ${name}@${version}`);
    requireAudit(!artifacts.has(name), `Duplicate inventory record for ${name}`);
    const file = basename(tarball);
    requireAudit(resolve(tarball) === join(packDir, file) && file.endsWith('.tgz'), `Tarball outside pack directory: ${tarball}`);
    requireAudit(packFiles.has(file), `Missing tarball: ${tarball}`);
    requireAudit(lstatSync(tarball).isFile(), `Not a regular tarball: ${tarball}`);

    const bytes = readFileSync(tarball);
    requireAudit(createHash('sha256').update(bytes).digest('hex') === sha256, `SHA-256 mismatch: ${tarball}`);
    const local = join(scratch, `artifact-${artifacts.size}.tgz`);
    writeFileSync(local, bytes);
    const entries = run('tar', ['-tzf', local], scratch).split('\n');
    requireAudit(entries.filter((entry) => entry === 'package/package.json').length === 1, `Expected one packed manifest: ${tarball}`);
    const manifest = JSON.parse(run('tar', ['-xOzf', local, 'package/package.json'], scratch));
    requireAudit(manifest?.name === name && manifest?.version === version && manifest.private !== true,
      `Expected ${name}@${version}, found ${manifest?.name}@${manifest?.version} in ${tarball}`);
    artifacts.set(name, {
      name, version, tarball, sha256, bundled, outputs: /** @type {Record<string, string>} */ (outputs), local, manifest,
      integrity: `sha512-${createHash('sha512').update(bytes).digest('base64')}`,
    });
    packFiles.delete(file);
  }
  requireAudit(packFiles.size === 0, `Unexpected tarball(s): ${[...packFiles].join(', ')}`);
  const missing = expected.filter(({ name }) => !artifacts.has(name));
  requireAudit(missing.length === 0, `Missing inventory record(s): ${missing.map(({ name }) => name).join(', ')}`);
  return artifacts;
}

/** @param {Manifest} manifest */
function getOptionalPeer(manifest) {
  requireAudit(!Object.keys(manifest.optionalDependencies ?? {}).length && !manifest.os && !manifest.cpu && !manifest.libc,
    `Unsupported conditional dependencies for ${manifest.name}`);
  const peers = Object.keys(manifest.peerDependencies ?? {}).filter((name) => manifest.peerDependenciesMeta?.[name]?.optional);
  requireAudit(peers.every((name) => name === optionalPeers.get(manifest.name)),
    `Unsupported optional peer scenario for ${manifest.name}: ${peers.join(', ')}`);
  return peers[0];
}

/**
 * @param {Artifact} artifact
 * @param {Map<string, Artifact>} available
 * @param {(name: string) => boolean} isInternal
 * @param {string | undefined} optionalPeer
 * @returns {Map<string, string>}
 */
function consumerDependencies(artifact, available, isInternal, optionalPeer) {
  /** @type {Map<string, string>} */
  const dependencies = new Map();
  /** @param {Artifact} current */
  function visit(current) {
    if (dependencies.has(current.name)) return;
    dependencies.set(current.name, `file:../${basename(current.local)}`);
    for (const [name, spec] of Object.entries({ ...current.manifest.dependencies, ...current.manifest.peerDependencies })) {
      const alias = spec.match(/^npm:((?:@[^/]+\/)?[^@]+)(?:@|$)/)?.[1];
      requireAudit(!alias || !isInternal(alias), `Unsupported internal dependency alias ${current.name} → ${spec}`);
      if (current.manifest.peerDependenciesMeta?.[name]?.optional && name !== optionalPeer) continue;
      const local = available.get(name);
      if (local) visit(local);
    }
  }
  visit(artifact);
  if (optionalPeer && !dependencies.has(optionalPeer)) {
    dependencies.set(optionalPeer, artifact.manifest.peerDependencies?.[optionalPeer] ?? '');
  }
  return dependencies;
}

/** @param {string} cwd */
function resolveLock(cwd) {
  run('npm', ['install', '--package-lock-only', '--package-lock=true', ...installFlags], cwd);
  const lock = readJson(join(cwd, 'package-lock.json'));
  requireAudit(isRecord(lock) && isRecord(lock.packages), `Invalid npm lockfile in ${cwd}`);
  return /** @type {Record<string, LockEntry>} */ (lock.packages);
}

/** @param {string} cwd @param {string} label */
function audit(cwd, label) {
  const args = ['audit', '--audit-level=high', '--omit=dev', '--include=peer', '--include=optional',
    '--workspaces=false', '--global=false', '--offline=false', '--prefer-online', '--json'];
  try {
    const raw = run('npm', args, cwd);
    const report = JSON.parse(raw);
    const counts = report?.metadata?.vulnerabilities;
    const levels = ['info', 'low', 'moderate', 'high', 'critical'];
    requireAudit(!report?.error && report?.auditReportVersion === 2 && isRecord(report.vulnerabilities) &&
      counts && levels.every((level) => Number.isSafeInteger(counts[level]) && counts[level] >= 0) &&
      counts.total === levels.reduce((total, level) => total + counts[level], 0) &&
      counts.high === 0 && counts.critical === 0 && Object.values(report.vulnerabilities).every((row) =>
        isRecord(row) && typeof row.severity === 'string' && levels.includes(row.severity) &&
        row.severity !== 'high' && row.severity !== 'critical'),
    `Invalid or blocking npm audit result\n${raw}`);
    console.log(`PASS ${label} ${JSON.stringify(counts)}`);
  } catch (error) {
    throw new Error(`${label}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/** @param {string} cwd @param {Map<string, string>} dependencies */
function initProject(cwd, dependencies) {
  mkdirSync(cwd);
  writeFileSync(join(cwd, 'package.json'), JSON.stringify({
    name: 'frontx-audit-consumer', version: '1.0.0', private: true,
    dependencies: Object.fromEntries(dependencies),
  }));
}

/**
 * @param {Artifact} artifact
 * @param {Map<string, Artifact>} available
 * @param {(name: string) => boolean} isInternal
 * @param {string} cwd
 * @param {string} label
 * @param {boolean} release
 * @param {string} [withPeer]
 */
function auditConsumer(artifact, available, isInternal, cwd, label, release, withPeer) {
  const dependencies = consumerDependencies(artifact, available, isInternal, withPeer);
  initProject(cwd, dependencies);
  const lock = resolveLock(cwd);
  const baselinePeer = getOptionalPeer(artifact.manifest);
  for (const name of dependencies.keys()) {
    requireAudit(Object.hasOwn(lock, `node_modules/${name}`), `${label}: ${name} missing from lock`);
  }
  for (const [path, entry] of Object.entries(lock)) {
    if (!path) continue;
    requireAudit(path.startsWith('node_modules/') && !entry.link, `${label}: unexpected lock path or link ${path}`);
    const name = path.split('/node_modules/').at(-1)?.replace(/^node_modules\//, '') ?? '';
    const actualName = entry.name ?? name;
    requireAudit(withPeer || !baselinePeer || (name !== baselinePeer && actualName !== baselinePeer),
      `${label}: optional peer ${baselinePeer} unexpectedly present`);
    if (!isInternal(name) && !isInternal(actualName)) {
      requireAudit(!entry.resolved?.startsWith('file:'), `${label}: unexpected local source for ${name} at ${path}`);
      continue;
    }
    const local = available.get(name) ?? available.get(actualName);
    if (release && !local) {
      requireAudit(isIdentity({ name: actualName, version: entry.version }) && !entry.link && /^https?:\/\//.test(entry.resolved ?? '') && entry.integrity,
        `${label}: expected a registry artifact for ${actualName} at ${path}`);
      continue;
    }
    requireAudit(local && name === actualName && !entry.link && entry.version === local.version &&
      entry.integrity === local.integrity && entry.resolved === `file:../${basename(local.local)}`,
    `${label}: expected the local tarball for ${actualName} at ${path}, got ${entry.resolved}@${entry.version}`);
  }
  run('npm', ['ci', ...installFlags], cwd);
  run('npm', ['ls', '--all', '--omit=dev', '--include=peer', '--include=optional', '--json'], cwd);
  audit(cwd, label);
}

/**
 * @param {ReturnType<typeof releasePackages>} expected
 * @param {unknown} publishSet
 * @returns {PublishRow[]}
 */
function validatePublishSet(expected, publishSet) {
  requireAudit(Array.isArray(publishSet) && publishSet.length > 0, 'Publish set must be a nonempty array');
  const packages = new Map(expected.map((pkg) => [pkg.name, pkg]));
  /** @type {PublishRow[]} */
  const validated = [];
  for (const row of /** @type {unknown[]} */ (publishSet)) {
    requireAudit(isRecord(row), 'Invalid publish row');
    const { path } = row;
    requireAudit(isIdentity(row) && typeof path === 'string', 'Invalid publish identity or path');
    const pkg = packages.get(row.name);
    requireAudit(pkg && pkg.version === row.version && path === `packages/${pkg.dir}`,
      `Unexpected or duplicate publish package ${row.name}@${row.version}`);
    packages.delete(row.name);
    validated.push({ name: row.name, version: row.version, path });
  }
  return validated;
}

/** @param {{ rootDir: string, packDir: string, inventory: unknown, publishSet?: unknown }} options */
export function auditProduction({ rootDir, packDir, inventory, publishSet }) {
  const expected = releasePackages(rootDir);
  const publish = publishSet === undefined ? [] : validatePublishSet(expected, publishSet);
  const scratch = mkdtempSync(join(tmpdir(), 'frontx-production-audit-'));
  try {
    const artifacts = prepareArtifacts(expected, resolve(packDir), inventory, scratch);
    const repoDefined = readRepoDefinedPackageNames(rootDir);
    const hasScope = ecosystemScopeMatcher(artifacts.keys());
    /** @param {string} name */
    const isInternal = (name) => artifacts.has(name) || repoDefined.has(name) || hasScope(name);
    const planned = new Map([...artifacts].filter(([name]) => publish.some((row) => row.name === name)));
    let index = 0;
    console.log(`Auditing ${process.platform}/${process.arch} with npm; optional peer coverage is limited to mfes/gts-plugin and ui-kit/exceljs.`);
    for (const [profile, packages] of /** @type {const} */ ([['local', artifacts], ['release', planned]])) {
      for (const artifact of packages.values()) {
        const peer = getOptionalPeer(artifact.manifest);
        for (const withPeer of peer ? [undefined, peer] : [undefined]) {
          const label = `${profile} consumer ${artifact.name}@${artifact.version}${withPeer ? ` + ${withPeer}` : ''}`;
          auditConsumer(artifact, packages, isInternal, join(scratch, `consumer-${index++}`), label, profile === 'release', withPeer);
        }
      }
    }
    const checked = new Set();
    for (const artifact of artifacts.values()) {
      for (const { name, version } of artifact.bundled) {
        const spec = `${name}@${version}`;
        if (checked.has(spec)) continue;
        const cwd = join(scratch, `bundled-${index++}`);
        initProject(cwd, new Map([[name, version]]));
        const entry = resolveLock(cwd)[`node_modules/${name}`];
        requireAudit(entry && (!entry.name || entry.name === name) && entry.version === version &&
          !entry.link && /^https?:\/\//.test(entry.resolved ?? '') && entry.integrity,
        `Expected registry package ${spec} in bundled audit lock`);
        audit(cwd, `bundled ${spec}`);
        checked.add(spec);
      }
    }
    return { packages: (publishSet === undefined ? expected : publish).map(({ name }) => {
      const { version, tarball, sha256 } = /** @type {Artifact} */ (artifacts.get(name));
      requireAudit(createHash('sha256').update(readFileSync(tarball)).digest('hex') === sha256,
        `Tarball changed during audit: ${tarball}`);
      return { name, version, tarball, sha256 };
    }) };
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

/** @param {string} rootDir @param {string[]} args */
async function cli(rootDir, args) {
  if (args.length === 2 && args[0] !== '--output-dir' && !args[0]?.startsWith('-')) {
    const [packDir = '', inventoryPath = ''] = args;
    auditProduction({ rootDir, packDir, inventory: readJson(inventoryPath) });
    return;
  }
  requireAudit((args.length === 2 || args.length === 4) && args[0] === '--output-dir' && args[1] &&
    (args.length === 2 || (args[2] === '--publish-set' && args[3])),
  'Usage: node scripts/audit-production.mjs <pack-dir> <inventory.json> | --output-dir <fresh-dir> [--publish-set <publish-set.json>]');
  const outputDir = resolve(args[1]);
  const expected = releasePackages(rootDir);
  const publishSet = args[3] ? validatePublishSet(expected, readJson(args[3])) : undefined;
  if (!existsSync(outputDir)) mkdirSync(outputDir);
  requireAudit(lstatSync(outputDir).isDirectory() && readdirSync(outputDir).length === 0,
    `Output directory must be fresh and empty: ${outputDir}`);
  const packDir = join(outputDir, 'packs');
  mkdirSync(packDir);
  // The producer owns the build-output inventory and packs each artifact once.
  const { packProductionPackage } = await import('./audit-production-inventory.mjs');
  const inventory = [];
  for (const { dir } of expected) {
    inventory.push(await packProductionPackage({ rootDir, packageDir: join(rootDir, 'packages', dir), packDir }));
  }
  writeFileSync(join(outputDir, 'inventory.json'), JSON.stringify(inventory, null, 2));
  const receipt = auditProduction({ rootDir, packDir, inventory, publishSet });
  writeFileSync(join(outputDir, 'receipt.json'), JSON.stringify(receipt, null, 2), { flag: 'wx' });
}

const script = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === script) {
  try {
    await cli(resolve(dirname(script), '..'), process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
