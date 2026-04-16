import { join } from "node:path";

export type PraxisPathSet = {
  root: string;
  praxisDir: string;
  objectiveFile: string;
  campaignFile: string;
  campaignLedgerFile: string;
  runFile: string;
  storyLedgerFile: string;
  runLedgerTransactionFile: string;
  eventsFile: string;
  stageHistoryFile: string;
  passesDir: string;
  reviewsDir: string;
  tracesDir: string;
  dispatchesDir: string;
  sessionsDir: string;
  worktreesDir: string;
  approvalsDir: string;
  policyDir: string;
};

export function resolvePraxisPaths(repoRoot: string): PraxisPathSet {
  const praxisDir = join(repoRoot, ".praxis");

  return {
    root: repoRoot,
    praxisDir,
    objectiveFile: join(praxisDir, "objective.md"),
    campaignFile: join(praxisDir, "campaign.json"),
    campaignLedgerFile: join(praxisDir, "campaign-ledger.json"),
    runFile: join(praxisDir, "run.json"),
    storyLedgerFile: join(praxisDir, "story-ledger.json"),
    runLedgerTransactionFile: join(praxisDir, "run-ledger-transaction.json"),
    eventsFile: join(praxisDir, "events.jsonl"),
    stageHistoryFile: join(praxisDir, "stage-history.jsonl"),
    passesDir: join(praxisDir, "passes"),
    reviewsDir: join(praxisDir, "reviews"),
    tracesDir: join(praxisDir, "traces"),
    dispatchesDir: join(praxisDir, "dispatches"),
    sessionsDir: join(praxisDir, "sessions"),
    worktreesDir: join(praxisDir, "worktrees"),
    approvalsDir: join(praxisDir, "approvals"),
    policyDir: join(praxisDir, "policy")
  };
}
