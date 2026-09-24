import { defineConfig } from "vitest/config";

const nodeMajor = Math.trunc(
  Number(process.versions.node.split(".")[0] ?? "0")
);

export default defineConfig({
  resolve: {
    dedupe: ["react", "react-dom"],
  },
  root: import.meta.dirname,
  test: {
    coverage: {
      exclude: [
        "**/*.test.{js,jsx,ts,tsx,cjs,cts,mjs,mts}",
        "**/*.spec.{js,jsx,ts,tsx,cjs,cts,mjs,mts}",
        "**/dist/**",
        "**/__tests__/**",
        "**/__test-utils__/**",
        "**/*.config.*",
      ],
      provider: "v8",
      reporter: ["text", "json", "html"],
      thresholds: {
        branches: 60,
        functions: 70,
        lines: 70,
        statements: 70,
      },
    },
    // Vitest 4 stubs every CSS module to an empty string before Vite's asset
    // plugin can serve '?raw' imports, so './theme.css?raw' would resolve to
    // ''. Process only raw CSS requests through the real pipeline; CSS-module
    // stubbing for component styles is unchanged.
    css: { include: [/\.css\?raw$/u] },
    environment: "jsdom",
    exclude: ["**/__test-utils__/**", "**/node_modules/**", "**/dist/**"],
    execArgv: nodeMajor >= 25 ? ["--no-experimental-webstorage"] : [],
    globals: true,
    include: [
      "__tests__/**/*.test.{ts,tsx}",
      "__tests__/**/*.spec.{ts,tsx}",
      "src/**/*.test.{ts,tsx}",
      "src/**/*.spec.{ts,tsx}",
      "scripts/**/*.test.{ts,tsx}",
      "demo/**/*.test.{ts,tsx}",
    ],
    passWithNoTests: false,
    // ui-kit dist imports per-chunk CSS; Node chokes unless it is inlined.
    server: { deps: { inline: [/@gears-frontx[\\/]ui-kit/u] } },
    setupFiles: ["./src/__test-utils__/setup.ts"],
    testTimeout: 15_000,
  },
});
