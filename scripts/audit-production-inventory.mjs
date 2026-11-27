import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { isBuiltin } from 'node:module';
import os from 'node:os';
import path from 'node:path';

/** @typedef {{inputs: Record<string, string>, imports: string[], sha256: string}} Output */
/** @typedef {{version: string, name?: string, integrity?: string, resolved?: string}} LockEntry */
/** @typedef {{name: string, version: string, private?: boolean, main?: string, module?: string, types?: string, typings?: string, exports?: unknown, bin?: string | Record<string, string>, files?: string[], dependencies?: Record<string, string>, optionalDependencies?: Record<string, string>, peerDependencies?: Record<string, string>}} Manifest */
/** @typedef {{outputs: Record<string, {inputs: Record<string, {bytesInOutput: number}>, imports: {path: string, external?: boolean}[]}>}} Metafile */

/** @param {string} file */
const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));

/** @param {string} file */
const sha256 = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');

/** @param {string} name */
const slash = (name) => name.split(path.sep).join('/');

/** @param {string} dir @param {string} name */
const within = (dir, name) => slash(path.relative(dir, name));

/** @param {string} name */
const isRelative = (name) => Boolean(name) && !path.posix.isAbsolute(name) && !/[\\:\0]/u.test(name) &&
  name.split('/').every((part) => part && part !== '.' && part !== '..');

/** @param {string} rootDir @param {string} packageDir */
const metadataPath = (rootDir, packageDir) => path.join(rootDir, 'dist/audit-production', path.basename(packageDir) + '.json');

/** @param {string} file */
function sourceHash(file) {
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) throw new Error(`Unknown bundle input: ${file}`);
  return sha256(file);
}

// Alternate output directories are used by test and development builds.
export function tsupInventoryOptions(outDir = 'dist') {
  const packageDir = process.cwd();
  if (path.resolve(packageDir, outDir) !== path.join(packageDir, 'dist')) return {};
  return {
    metafile: true,
    async onSuccess() {
      recordTsupInventory(packageDir);
    },
  };
}

/** Run after tsup has finalized JS and maps, then remove metadata from the npm files tree.
 * @param {string} packageDir */
export function recordTsupInventory(packageDir) {
  const rootDir = path.resolve(packageDir, '../..');
  const sidecar = metadataPath(rootDir, packageDir);
  fs.rmSync(sidecar, { force: true });
  /** @type {Record<string, Output>} */
  const outputs = {};
  for (const format of ['cjs', 'esm']) {
    const metafile = path.join(packageDir, 'dist', `metafile-${format}.json`);
    /** @type {Metafile} */
    const meta = readJson(metafile);
    // tsup writes sourcemaps separately from chunks after its render transforms.
    const entries = Object.entries(meta.outputs).filter(([file]) => !file.endsWith('.map'));
    if (!entries.length) throw new Error(`No ${format} outputs in ${metafile}`);
    for (const [file, output] of entries) {
      if (!isRelative(file) || !file.startsWith('dist/')) throw new Error(`Unexpected tsup output: ${file}`);
      if (Object.hasOwn(outputs, file)) throw new Error(`Duplicate tsup output: ${file}`);
      const inputs = Object.fromEntries(Object.entries(output.inputs)
        .filter(([, input]) => input.bytesInOutput > 0)
        .map(([id]) => {
          if (id.includes('\0')) throw new Error(`Unknown bundle input: ${id}`);
          const file = path.resolve(packageDir, id);
          return [within(rootDir, file), sourceHash(file)];
        }));
      const imports = output.imports.filter((entry) => entry.external).map((entry) => entry.path);
      const outputPath = path.join(packageDir, file);
      outputs[file] = { inputs, imports, sha256: sha256(outputPath) };
      if (fs.existsSync(outputPath + '.map')) {
        outputs[file + '.map'] = { inputs, imports: [], sha256: sha256(outputPath + '.map') };
      }
    }
    fs.unlinkSync(metafile);
  }
  fs.mkdirSync(path.dirname(sidecar), { recursive: true });
  fs.writeFileSync(sidecar, JSON.stringify(outputs));
}

/** @param {string} file @param {string[]} args @param {string} cwd */
function run(file, args, cwd) {
  return execFileSync(file, args, { cwd, encoding: 'utf8', timeout: 120_000, maxBuffer: 8 * 1024 * 1024 });
}

/** @param {string} dir @returns {string[]} */
function packedFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isFile()) return [entry.name];
    if (entry.isDirectory()) return packedFiles(path.join(dir, entry.name)).map((file) => entry.name + '/' + file);
    throw new Error(`Unexpected packed file type: ${entry.name}`);
  });
}

/** @param {unknown} value @returns {string[]} */
function stringLeaves(value) {
  if (typeof value === 'string') return [value];
  if (value && typeof value === 'object') return Object.values(value).flatMap(stringLeaves);
  return [];
}

/** @param {Manifest} manifest @param {Set<string>} files */
function verifyTargets(manifest, files) {
  const exports = manifest.exports;
  const rules = exports && typeof exports === 'object' ? Object.entries(exports) : [];
  /** @param {string} target */
  const requireFile = (target) => {
    if (!files.has(target.replace(/^\.\//u, ''))) throw new Error(`Missing packed target: ${target}`);
  };
  for (const target of stringLeaves([manifest.main, manifest.module, manifest.types, manifest.typings, manifest.bin, exports])) {
    if (!target.includes('*')) requireFile(target);
  }
  const exclusions = rules.filter(([, value]) => value === null).map(([key]) => key.split('*')[0]);
  for (const [key, value] of rules) {
    const patterns = stringLeaves(value).filter((target) => target.includes('*'));
    if (!patterns.length) continue;
    const exports = new Set();
    for (const pattern of patterns.filter((target) => !/\.d\.[cm]?ts$/u.test(target))) {
      const [prefix, suffix] = pattern.replace(/^\.\//u, '').split('*');
      for (const file of files) {
        if (!file.startsWith(prefix) || !file.endsWith(suffix)) continue;
        const subpath = file.slice(prefix.length, suffix ? -suffix.length : undefined);
        if (!exclusions.some((exclude) => key.replace('*', subpath).startsWith(exclude))) exports.add(subpath);
      }
    }
    if (!exports.size) throw new Error(`No packed targets for export ${key}`);
    for (const subpath of exports) {
      for (const pattern of patterns) requireFile(pattern.replace('*', subpath));
    }
  }
  for (const item of manifest.files ?? []) {
    if (!isRelative(item) || /[*?!\[\]]/u.test(item) ||
        ![...files].some((file) => file === item || file.startsWith(item + '/'))) {
      throw new Error(`Unverified package files entry: ${item}`);
    }
  }
}

/** @param {string} input @param {string} rootDir @param {string} packageDir @param {Record<string, LockEntry>} lock */
function embeddedPackage(input, rootDir, packageDir, lock) {
  if (!isRelative(input)) throw new Error(`Unknown bundle input: ${input}`);
  const resolved = within(rootDir, fs.realpathSync(path.join(rootDir, input)));
  const segments = resolved.split('/');
  const index = segments.lastIndexOf('node_modules');
  if (!isRelative(resolved)) throw new Error(`Unknown bundle input: ${input} (resolved to ${resolved})`);
  if (index < 0) {
    if (resolved.startsWith(within(rootDir, packageDir) + '/') && !resolved.startsWith(within(rootDir, packageDir) + '/dist/')) {
      return undefined;
    }
    throw new Error(`Unknown bundle input: ${input} (resolved to ${resolved})`);
  }
  const locator = segments.slice(index + 1, index + (segments[index + 1]?.startsWith('@') ? 3 : 2)).join('/');
  const packageRoot = segments.slice(0, index + 1).concat(locator).join('/');
  const entry = lock[packageRoot];
  /** @type {Manifest} */
  const { name, version } = readJson(path.join(rootDir, packageRoot, 'package.json'));
  if (entry?.version !== version || (entry.name ?? locator) !== name || !entry.integrity ||
      !/^https:\/\//u.test(entry.resolved ?? '')) {
    throw new Error(`Bundle input lock mismatch: ${input} (${name}@${version}, lock ${packageRoot})`);
  }
  return { name, version };
}

/** @param {string} name @param {Manifest} manifest */
function verifyExternal(name, manifest) {
  if (isBuiltin(name)) return;
  const packageName = name.split('/').slice(0, name.startsWith('@') ? 2 : 1).join('/');
  if (![manifest.dependencies, manifest.peerDependencies, manifest.optionalDependencies]
    .some((edges) => edges && Object.hasOwn(edges, packageName))) {
    throw new Error(`Undeclared bundled output import: ${manifest.name} → ${name}`);
  }
}

/** Pack one already-built package and verify the actual tarball bytes against build provenance.
 * @param {{rootDir: string, packageDir: string, packDir: string}} paths */
export function packProductionPackage({ rootDir, packageDir, packDir }) {
  rootDir = fs.realpathSync(rootDir);
  packageDir = fs.realpathSync(packageDir);
  /** @type {Manifest} */
  const local = readJson(path.join(packageDir, 'package.json'));
  if (local.private || !local.name || !local.version) throw new Error(`Invalid public package: ${packageDir}`);
  /** @type {Record<string, Output>} */
  const inventory = readJson(metadataPath(rootDir, packageDir));
  if (!Object.keys(inventory).length) throw new Error(`Empty build inventory: ${local.name}`);
  /** @type {Record<string, LockEntry>} */
  const lock = readJson(path.join(rootDir, 'package-lock.json')).packages;
  if (!lock || typeof lock !== 'object') throw new Error('Missing package-lock packages');
  fs.mkdirSync(packDir, { recursive: true });
  const npmArgs = ['pack', '--json', '--pack-destination', packDir];
  const npmCli = process.env.npm_execpath;
  const result = JSON.parse(npmCli ? run(process.execPath, [npmCli, ...npmArgs], packageDir) : run('npm', npmArgs, packageDir));
  if (!Array.isArray(result) || result.length !== 1 || result[0].name !== local.name ||
      result[0].version !== local.version || !isRelative(result[0].filename) || result[0].filename.includes('/') ||
      !result[0].filename.endsWith('.tgz')) throw new Error(`Invalid npm pack result: ${local.name}`);
  const tarball = path.join(packDir, result[0].filename);
  const digest = sha256(tarball);
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'frontx-pack-'));
  try {
    const list = run('tar', ['-tzf', tarball], scratch).trimEnd().split('\n');
    if (list.some((file) => !file.startsWith('package/') || !isRelative(file.slice('package/'.length))) ||
        new Set(list).size !== list.length) throw new Error(`Invalid tarball entries: ${tarball}`);
    run('tar', ['-xzf', tarball], scratch);
    const extracted = path.join(scratch, 'package');
    const files = new Set(packedFiles(extracted));
    if (files.size !== list.length || list.some((file) => !files.has(file.slice('package/'.length)))) {
      throw new Error(`Incomplete extracted tarball: ${tarball}`);
    }
    /** @type {Manifest} */
    const manifest = readJson(path.join(extracted, 'package.json'));
    if (manifest.name !== local.name || manifest.version !== local.version || manifest.private) {
      throw new Error(`Packed package identity mismatch: ${local.name}`);
    }
    verifyTargets(manifest, files);
    for (const file of Object.keys(inventory)) {
      if (!files.has(file)) throw new Error(`Missing recorded build output: ${file}`);
    }
    /** @type {Map<string, {name: string, version: string}>} */
    const bundled = new Map();
    /** @type {Map<string, string>} */
    const checkedInputs = new Map();
    /** @type {Record<string, string>} */
    const outputs = {};
    for (const file of [...files].sort()) {
      const hash = sha256(path.join(extracted, file));
      const record = Object.hasOwn(inventory, file) ? inventory[file] : undefined;
      if (record) {
        if (hash !== record.sha256) throw new Error(`Packed output hash mismatch: ${file}`);
        for (const name of record.imports) {
          // Preserved modules are external to each esbuild entry and ship in the same package.
          if (/^\.\.?\//u.test(name)) {
            const target = path.posix.join(path.posix.dirname(file), name);
            if (!target.startsWith('dist/') || !Object.hasOwn(inventory, target) || !files.has(target)) {
              throw new Error(`Unverified local output import: ${file} → ${name}`);
            }
          } else {
            verifyExternal(name, manifest);
          }
        }
        for (const [input, expected] of Object.entries(record.inputs)) {
          if (!isRelative(input)) throw new Error(`Unknown bundle input: ${input}`);
          if (!checkedInputs.has(input)) {
            const dependency = embeddedPackage(input, rootDir, packageDir, lock);
            if (dependency) bundled.set(`${dependency.name}@${dependency.version}`, dependency);
            checkedInputs.set(input, sourceHash(path.join(rootDir, input)));
          }
          if (checkedInputs.get(input) !== expected) throw new Error(`Bundle input hash mismatch: ${input}`);
        }
      } else if (manifest.name === '@gears-frontx/cyber-pilot-kit-frontx' &&
                 file === 'skills/project-scaffolding/scripts/verify-walk.mjs') {
        if (hash !== sha256(path.join(packageDir, file))) throw new Error(`Packed source hash mismatch: ${file}`);
      } else if (file !== 'package.json' && !/\.(?:md|txt|toml)$/iu.test(file) &&
                 !/^(?:LICEN[CS]E|NOTICE)$/u.test(file) && !/^dist\/.*\.d\.[cm]?ts(?:\.map)?$/u.test(file)) {
        throw new Error(`Unrecorded packed output: ${file}`);
      }
      outputs[file] = hash;
    }
    if (sha256(tarball) !== digest) throw new Error(`Tarball changed while verifying: ${tarball}`);
    return { name: manifest.name, version: manifest.version, tarball, sha256: digest,
      bundled: [...bundled.values()].sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version)), outputs };
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}
