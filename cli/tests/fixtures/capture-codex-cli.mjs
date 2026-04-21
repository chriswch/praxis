#!/usr/bin/env node

import { writeFile } from "node:fs/promises";

const argvPath = process.env.PRAXIS_TEST_ARGV_PATH;
if (argvPath) {
  await writeFile(argvPath, `${JSON.stringify(process.argv.slice(2), null, 2)}\n`, "utf8");
}

process.stdout.write("captured\n");
process.exit(0);
