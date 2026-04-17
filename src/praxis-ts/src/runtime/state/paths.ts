import { join } from "node:path";

export type PraxisPathSet = {
  root: string;
  praxisDir: string;
  objectiveFile: string;
  targetSpecFile: string;
  gapFile: string;
  gapDataFile: string;
  remediationMapFile: string;
  remediationMapDataFile: string;
  campaignFile: string;
  campaignLedgerFile: string;
  childRunSlotFile: string;
  runFile: string;
  storyLedgerFile: string;
  runLedgerTransactionFile: string;
  eventsFile: string;
  stageHistoryFile: string;
  auditWarningsFile: string;
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
    targetSpecFile: join(praxisDir, "target-spec.md"),
    gapFile: join(praxisDir, "gap.md"),
    gapDataFile: join(praxisDir, "gap.json"),
    remediationMapFile: join(praxisDir, "remediation-map.md"),
    remediationMapDataFile: join(praxisDir, "remediation-map.json"),
    campaignFile: join(praxisDir, "campaign.json"),
    campaignLedgerFile: join(praxisDir, "campaign-ledger.json"),
    childRunSlotFile: join(praxisDir, "child-run-slot.json"),
    runFile: join(praxisDir, "run.json"),
    storyLedgerFile: join(praxisDir, "story-ledger.json"),
    runLedgerTransactionFile: join(praxisDir, "run-ledger-transaction.json"),
    eventsFile: join(praxisDir, "events.jsonl"),
    stageHistoryFile: join(praxisDir, "stage-history.jsonl"),
    auditWarningsFile: join(praxisDir, "audit-warnings.jsonl"),
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
