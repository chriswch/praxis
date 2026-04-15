import { join } from "node:path";

export type PraxisPathSet = {
  root: string;
  praxisDir: string;
  runFile: string;
  storyLedgerFile: string;
  eventsFile: string;
  tracesDir: string;
  dispatchesDir: string;
  sessionsDir: string;
  approvalsDir: string;
  policyDir: string;
};

export function resolvePraxisPaths(repoRoot: string): PraxisPathSet {
  const praxisDir = join(repoRoot, ".praxis");

  return {
    root: repoRoot,
    praxisDir,
    runFile: join(praxisDir, "run.json"),
    storyLedgerFile: join(praxisDir, "story-ledger.json"),
    eventsFile: join(praxisDir, "events.jsonl"),
    tracesDir: join(praxisDir, "traces"),
    dispatchesDir: join(praxisDir, "dispatches"),
    sessionsDir: join(praxisDir, "sessions"),
    approvalsDir: join(praxisDir, "approvals"),
    policyDir: join(praxisDir, "policy")
  };
}
