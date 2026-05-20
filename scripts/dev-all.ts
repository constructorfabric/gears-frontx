#!/usr/bin/env node

/**
 * Dynamic dev:all orchestrator
 *
 * Scans src/mfe_packages/ for MFE packages and automatically starts
 * all found packages in parallel with the main app.
 *
 * Port discovery: reads each package's package.json preview (or dev) script
 * for a --port NNNN argument. No separate registry file required.
 */

import { spawn } from 'child_process';
import { readFileSync } from 'fs';
import { join } from 'path';
import { buildMfesSequentially, getMFEPackages, MfeInfo } from './lib/mfe-tools.js';

// Determine main app command based on available scripts
function getMainAppCommand(): string {
  const rootPkgPath = join(process.cwd(), 'package.json');
  try {
    const rootPkg = JSON.parse(readFileSync(rootPkgPath, 'utf-8')) as {
      scripts?: Record<string, string>;
    };
    if (rootPkg.scripts?.['generate:colors']) {
      return 'npm run generate:colors && vite';
    }
  } catch {
    // ignore — fall through to default
  }
  return 'vite';
}

// Build preview-only commands (no build step — MFEs are pre-built)
function buildPreviewCommands(mfes: MfeInfo[]): string[] {
  const commands: string[] = [];

  // Add main app
  commands.push(getMainAppCommand());

  // MFE preview only (build already done in the sequential step)
  for (const mfe of mfes) {
    commands.push(`cd src/mfe_packages/${mfe.name} && npm run preview`);
  }

  return commands;
}

// Run manifest generation after MFE builds
function generateManifests(): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log('📋 Generating MFE manifests...\n');

    const proc = spawn('/bin/sh', ['-c', 'npm run generate:mfe-manifests'], {
      stdio: 'inherit',
      cwd: process.cwd(),
    });

    proc.on('error', reject);
    proc.on('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Manifest generation failed with exit code ${code}`));
      }
    });
  });
}

// Main execution
async function main() {
  console.log('🚀 Starting dev:all...\n');

  const mfes = getMFEPackages();

  if (mfes.length === 0) {
    console.log('ℹ️  No MFE packages found in src/mfe_packages/');
    console.log('Starting main app only...\n');
  } else {
    console.log(`✅ Found ${mfes.length} MFE package(s):`);
    mfes.forEach((mfe, idx) => {
      console.log(`  [${idx}] ${mfe.name} (port ${mfe.port})`);
    });
    console.log();
  }

  // Step 1: Build all MFEs (produces dist/ with mf-manifest.json)
  await buildMfesSequentially(mfes);

  // Step 2: Generate manifests (reads dist/mf-manifest.json, produces generated-mfe-manifests.ts)
  await generateManifests();

  // Step 3: Start host + MFE preview servers concurrently
  const commands = buildPreviewCommands(mfes);

  // Quote each command properly for concurrently
  const quotedCommands = commands.map((cmd) => `"${cmd.replace(/"/g, '\\"')}"`);

  // Build concurrently command
  const concurrentlyCmd = ['concurrently', '--kill-others', ...quotedCommands];

  console.log(`📝 Running: ${concurrentlyCmd.join(' ')}\n`);

  // Execute concurrently
  const proc = spawn('npx', concurrentlyCmd, {
    stdio: 'inherit',
    shell: true,
  });

  proc.on('error', (error) => {
    console.error('❌ Failed to start dev:all:', error);
    process.exit(1);
  });

  proc.on('exit', (code) => {
    process.exit(code || 0);
  });
}

main().catch((error) => {
  console.error('❌ Error:', error);
  process.exit(1);
});
