#!/usr/bin/env node

/**
 * Build all MFE packages sequentially.
 * Called by the build and dev scripts before generate:mfe-manifests.
 */

import {
  buildMfesSequentially,
  getMFEPackages,
  noDiscoveredPackagesNotice,
} from './lib/mfe-tools.js';

async function main() {
  const { packages, skippedExamples } = getMFEPackages();

  if (packages.length === 0) {
    console.log(`${noDiscoveredPackagesNotice(skippedExamples)} Skipping MFE build.`);
    return;
  }

  console.log(`Found ${packages.length} MFE package(s):`);
  packages.forEach((mfe) => console.log(`  - ${mfe.name}`));
  console.log();

  await buildMfesSequentially(packages);
}

main().catch((err) => {
  console.error('❌ MFE build failed:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
