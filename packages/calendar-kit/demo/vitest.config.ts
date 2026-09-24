import { defineConfig } from "vitest/config";

import rootConfig from "../vitest.config";

export default defineConfig({
  ...rootConfig,
  test: {
    ...rootConfig.test,
    include: ["demo/tests/translation-contract.test.ts"],
  },
});
