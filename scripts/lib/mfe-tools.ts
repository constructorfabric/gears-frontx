#!/usr/bin/env node

/**
 * Shared MFE package discovery and build utilities.
 * Used by dev-all.ts (build + preview) and build-mfes.ts (build only).
 */

import { spawn } from 'child_process';
import { existsSync, readdirSync, readFileSync } from 'fs';
import { dirname, join } from 'path';

// Resolve sibling CLIs from Node's own bin directory rather than relying on
// PATH lookup. This avoids CWE-427 (attacker-controllable PATH shadowing a
// trusted executable), even though these scripts are dev-only.
export const NODE_BIN_DIR = dirname(process.execPath);

export const MFE_PACKAGES_DIR = join(process.cwd(), 'src/mfe_packages');

// Packages to skip (shared libraries, hidden dirs)
const EXCLUDED_PACKAGES = new Set(['shared']);

export interface MfeInfo {
  name: string;
  port: number;
}

/** Scan src/mfe_packages/ and extract port from each package's scripts. */
export function getMFEPackages(): MfeInfo[] {
  if (!existsSync(MFE_PACKAGES_DIR)) {
    return [];
  }

  const mfes: MfeInfo[] = [];
  const entries = readdirSync(MFE_PACKAGES_DIR, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (EXCLUDED_PACKAGES.has(entry.name)) continue;
    if (entry.name.startsWith('.')) continue;

    const pkgJsonPath = join(MFE_PACKAGES_DIR, entry.name, 'package.json');
    if (!existsSync(pkgJsonPath)) continue;

    try {
      const pkgJson = JSON.parse(readFileSync(pkgJsonPath, 'utf-8')) as {
        scripts?: Record<string, string>;
      };
      const scripts = pkgJson.scripts ?? {};

      // Try preview first (stable port source), fall back to dev
      const portSource = scripts['preview'] ?? scripts['dev'] ?? '';
      const portMatch = portSource.match(/--port\s+(\d+)/);

      if (!portMatch) {
        console.warn(`⚠️  Could not find --port in scripts for ${entry.name}, skipping`);
        continue;
      }

      mfes.push({ name: entry.name, port: parseInt(portMatch[1], 10) });
    } catch (e) {
      console.warn(`⚠️  Failed to read package.json for ${entry.name}:`, e);
    }
  }

  return mfes;
}

/** Build MFE packages sequentially using vite build in each package directory. */
export async function buildMfesSequentially(mfes: MfeInfo[]): Promise<void> {
  if (mfes.length === 0) return;

  console.log('📦 Building MFE packages...\n');

  // Spawn `vite build` per package with `cwd` set to that package — avoids
  // `/bin/sh -c` concatenation (which is non-portable on Windows and fragile
  // when a package path contains shell-special characters).
  for (const mfe of mfes) {
    await new Promise<void>((resolve, reject) => {
      const npxPath = join(
        NODE_BIN_DIR,
        process.platform === 'win32' ? 'npx.cmd' : 'npx',
      );
      const proc = spawn(npxPath, ['vite', 'build'], {
        stdio: 'inherit',
        cwd: join(MFE_PACKAGES_DIR, mfe.name),
      });
      proc.on('error', reject);
      proc.on('exit', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`MFE build failed for ${mfe.name} with exit code ${code}`));
      });
    });
  }

  console.log('\n✅ All MFE packages built successfully.\n');
}
