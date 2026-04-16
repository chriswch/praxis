#!/usr/bin/env node

process.stdout.write(`${JSON.stringify({ event: "started" })}\n`);
process.stdout.write(`${JSON.stringify({ event: "progress", message: "no session id emitted" })}\n`);
process.exit(0);
