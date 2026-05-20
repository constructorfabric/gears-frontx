#!/usr/bin/env node

/**
 * Build all MFE packages sequentially.
 * Called by the build and dev scripts before generate:mfe-manifests.
 */

import { buildMfesSequentially, getMFEPackages } from './lib/mfe-tools.js';

async function main() {
  const mfes = getMFEPackages();

  if (mfes.length === 0) {
    console.log('ℹ️  No MFE packages found in src/mfe_packages/, skipping MFE build.');
    return;
  }

  console.log(`Found ${mfes.length} MFE package(s):`);
  mfes.forEach((mfe) => console.log(`  - ${mfe.name}`));
  console.log();

  await buildMfesSequentially(mfes);
}

main().catch((err) => {
  console.error('❌ MFE build failed:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
