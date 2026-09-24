import { defineConfig } from "vitest/config";

import rootConfig from "./vitest.config";

// The dist-import gate runs against a fresh build (npm run test:dist); it is kept out of
// the unit include so `vitest --run` never depends on build artifacts. The gate loads the
// whole built package into jsdom, so it needs a wider budget than the unit tests.
export default defineConfig({
  ...rootConfig,
  test: {
    ...rootConfig.test,
    include: ["dist-tests/**/*.test.ts"],
    passWithNoTests: false,
    testTimeout: 30_000,
  },
});
