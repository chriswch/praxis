#!/usr/bin/env node
// Copy prompt .md files from src/config/prompts/ to dist/config/prompts/.
// tsc only emits .js / .d.ts; the runtime loader (src/workflow/stage.ts:
// PROMPTS_DIR) resolves prompts relative to the dist/.js file, so the .md
// files must be alongside the compiled output.
import { cpSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const src = resolve(root, "src/config/prompts");
const dest = resolve(root, "dist/config/prompts");

cpSync(src, dest, { recursive: true });
