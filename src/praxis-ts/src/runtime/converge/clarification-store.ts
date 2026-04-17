import { join } from "node:path";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import type { ConvergeStageResultRecord } from "../../contracts/model.js";
import { validateConvergeStageResult } from "../../contracts/validators.js";
import type { PraxisStateRepository } from "../state/repository.js";
import { readJsonFileIfExists, writeJsonFile } from "../state/store.js";

export type ClarificationAttemptSnapshot = Record<string, unknown> & {
  updated_at: string;
  changed_decisions_from_previous: string[];
};

type TargetSpecPayload = {
  targetSpecMarkdown: string;
  clarificationRecord: Record<string, unknown>;
  stageResult: ConvergeStageResultRecord & { stage: "clarifying-intent" };
};

export class ClarificationStore {
  constructor(private readonly repo: PraxisStateRepository) {}

  async persistTargetSpec(payload: TargetSpecPayload): Promise<void> {
    validateConvergeStageResult(payload.stageResult);

    const resultsDir = join(this.repo.paths.praxisDir, "results");
    await mkdir(resultsDir, { recursive: true });

    const changedDecisions = await this.computeChangedDecisions(payload.clarificationRecord);
    const snapshot = this.annotateSnapshot(payload.clarificationRecord, changedDecisions);

    await writeFile(
      this.repo.paths.targetSpecFile,
      `${payload.targetSpecMarkdown.trimEnd()}\n`,
      "utf8"
    );
    await writeJsonFile(this.repo.paths.clarificationFile, snapshot);
    await writeJsonFile(join(resultsDir, "clarifying-intent.json"), payload.stageResult);

    const attemptId = await this.nextAttemptId();
    const attemptDir = join(this.repo.paths.clarificationsDir, attemptId);
    const attemptResultsDir = join(attemptDir, "results");
    await mkdir(attemptResultsDir, { recursive: true });
    await writeFile(
      join(attemptDir, "target-spec.md"),
      `${payload.targetSpecMarkdown.trimEnd()}\n`,
      "utf8"
    );
    await writeJsonFile(join(attemptDir, "clarification.json"), snapshot);
    await writeJsonFile(join(attemptResultsDir, "clarifying-intent.json"), payload.stageResult);
    await writeJsonFile(join(attemptDir, "attempt.json"), {
      version: 1,
      attempt_id: attemptId,
      stage: "clarifying-intent",
      outcome_code: payload.stageResult.data.outcome_code,
      route_kind: payload.stageResult.route.kind,
      changed_decisions: changedDecisions,
      approval_status: readApprovalStatus(snapshot)
    });
  }

  private async computeChangedDecisions(current: Record<string, unknown>): Promise<string[]> {
    const previousClarification = await readJsonFileIfExists<Record<string, unknown>>(
      this.repo.paths.clarificationFile
    );
    const previousDecisions = readDecisionMap(previousClarification);
    const currentDecisions = readDecisionMap(current);
    return Object.keys(currentDecisions).filter((key) =>
      JSON.stringify(currentDecisions[key]) !== JSON.stringify(previousDecisions[key])
    );
  }

  private annotateSnapshot(
    record: Record<string, unknown>,
    changedDecisions: string[]
  ): ClarificationAttemptSnapshot {
    return {
      ...record,
      updated_at: new Date().toISOString(),
      changed_decisions_from_previous: changedDecisions
    };
  }

  private async nextAttemptId(): Promise<string> {
    let maxOrdinal = 0;
    const entries = await readdir(this.repo.paths.clarificationsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }
      const match = /^C-(\d+)$/.exec(entry.name);
      if (!match) {
        continue;
      }
      const ordinal = Number.parseInt(match[1], 10);
      if (!Number.isNaN(ordinal) && ordinal > maxOrdinal) {
        maxOrdinal = ordinal;
      }
    }
    return `C-${String(maxOrdinal + 1).padStart(3, "0")}`;
  }
}

function readDecisionMap(record: Record<string, unknown> | null | undefined): Record<string, unknown> {
  if (!record) {
    return {};
  }
  const decisions = record.decisions;
  if (typeof decisions !== "object" || decisions === null || Array.isArray(decisions)) {
    return {};
  }
  return decisions as Record<string, unknown>;
}

function readApprovalStatus(snapshot: ClarificationAttemptSnapshot): string | null {
  const approval = (snapshot as Record<string, unknown>).approval;
  if (typeof approval !== "object" || approval === null || Array.isArray(approval)) {
    return null;
  }
  const status = (approval as Record<string, unknown>).status;
  return typeof status === "string" ? status : null;
}
