import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/cli.ts"],
  format: "esm",
  platform: "node",
  target: "node20",
  outDir: "dist",
  sourcemap: true,
  clean: true,
  // Praxis is shipped as a CLI bin only; no library .d.ts surface.
  dts: false,
  // ESM all the way down — no CJS shim.
  shims: false,
  // Emit `.js` (ESM via package.type) instead of `.mjs`, so `bin: dist/cli.js`
  // in package.json keeps working without renaming.
  fixedExtension: false,
  // Keep the SDK + zod external; users get them via `npm install`.
  // Bundling them would inflate the published artifact unnecessarily.
  deps: { skipNodeModulesBundle: true },
  // Prompt files live as .md so iteration doesn't require a code recompile.
  // They must ship alongside the compiled loader because
  // src/workflow/stage.ts reads them at runtime via fs.readFileSync. tsdown's
  // copy step replaces the previous scripts/copy-prompts.mjs hack and is
  // covered by the build-smoke regression test in tests/e2e/build-smoke.test.ts.
  copy: [
    {
      from: "src/config/prompts/*.md",
      to: "dist/config/prompts",
      flatten: true,
    },
  ],
});
