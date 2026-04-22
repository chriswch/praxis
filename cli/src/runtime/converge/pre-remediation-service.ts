import { readFile } from "node:fs/promises";
import { nowIsoUtc } from "../common/time.js";
import type {
  CampaignRecord,
  ConvergeStageResultRecord,
  GapAssessmentResult,
} from "../../contracts/model.js";
import type { PraxisStateRepository } from "../state/repository.js";
import { readJsonFileIfExists } from "../state/store.js";
import { stringifyError } from "./campaign-support.js";
import { ClarificationStore } from "./clarification-store.js";
import {
  buildConvergePreRemediationDispatch,
  toStageHistoryRecord,
} from "./pre-remediation-dispatch.js";
import type { ConvergeStageExecutorRegistry } from "./stage-executor.js";

export interface ClarifyingIntentOutcome {
  targetSpecText: string;
  needsClarification: boolean;
  clarificationIssues: string[];
  stageResult: ConvergeStageResultRecord & { stage: "clarifying-intent" };
}

export interface AssessingGapsOutcome {
  stageResult: ConvergeStageResultRecord & { stage: "assessing-gaps" };
  gap: GapAssessmentResult;
  findingsCount: number;
}

// Pre-remediation stages now route through the dispatch compiler and an
// executor registry. Each stage emits a DispatchRecord (persisted under
// .praxis/dispatches/) before execution and appends to stage-history.jsonl
// on completion, so the audit trail matches the craft workflow.
export class ConvergePreRemediationService {
  private readonly clarificationStore: ClarificationStore;

  constructor(
    private readonly repo: PraxisStateRepository,
    private readonly registry: ConvergeStageExecutorRegistry,
  ) {
    this.clarificationStore = new ClarificationStore(repo);
  }

  async runClarifyingIntent(
    campaign: CampaignRecord,
    objectiveText: string,
    options: { passNumber: number },
  ): Promise<ClarifyingIntentOutcome> {
    const dispatch = buildConvergePreRemediationDispatch(
      campaign,
      "clarifying-intent",
      this.repo.paths.root,
    );
    await this.repo.saveDispatch(dispatch);

    const executor = this.registry.resolve("clarifying-intent");
    const output = await executor.execute({
      campaign,
      dispatch,
      repo: this.repo,
      repoRoot: this.repo.paths.root,
      passNumber: options.passNumber,
      reviewId: null,
      generatedAt: nowIsoUtc(),
      objectiveText,
      targetSpecText: null,
    });

    const stageResult = output.stageResult as ConvergeStageResultRecord & {
      stage: "clarifying-intent";
    };

    // Persist the clarification snapshot + attempt bundle once per clarifying
    // run. The executor produces the target spec text and clarification
    // decision record; the store snapshots them into .praxis/clarifications/
    // C-### and updates the durable .praxis/target-spec.md + clarification.json
    // pointers. Agent executors emit .praxis/target-spec.md directly from the
    // subprocess; we re-read that content here when the executor did not
    // return it in-process.
    const clarificationRecord =
      output.clarificationRecord ?? (await this.loadClarificationRecord());
    const targetSpecMarkdown =
      output.targetSpecText ??
      (await this.readDurableTargetSpec()) ??
      "# Target Spec\n\n(target-spec produced by agent)\n";
    await this.clarificationStore.persistTargetSpec({
      targetSpecMarkdown,
      clarificationRecord,
      stageResult,
    });

    await this.appendStageHistory(stageResult, dispatch, output.artifactsWritten, campaign);

    return {
      targetSpecText: output.targetSpecText ?? "",
      needsClarification: output.needsClarification ?? false,
      clarificationIssues: output.clarificationIssues ?? [],
      stageResult,
    };
  }

  async runAssessingGaps(
    campaign: CampaignRecord,
    targetSpecText: string,
    reviewId: string,
    options: { passNumber: number },
  ): Promise<AssessingGapsOutcome> {
    const dispatch = buildConvergePreRemediationDispatch(
      campaign,
      "assessing-gaps",
      this.repo.paths.root,
    );
    await this.repo.saveDispatch(dispatch);

    const executor = this.registry.resolve("assessing-gaps");
    const output = await executor.execute({
      campaign,
      dispatch,
      repo: this.repo,
      repoRoot: this.repo.paths.root,
      passNumber: options.passNumber,
      reviewId,
      generatedAt: nowIsoUtc(),
      objectiveText: "",
      targetSpecText,
    });

    if (!output.gap) {
      throw new Error("Assessing-gaps executor returned no gap payload.");
    }

    const stageResult = output.stageResult as ConvergeStageResultRecord & {
      stage: "assessing-gaps";
    };

    await this.appendStageHistory(stageResult, dispatch, output.artifactsWritten, campaign);

    return {
      stageResult,
      gap: output.gap,
      findingsCount: output.gap.findings.length,
    };
  }

  private async loadClarificationRecord(): Promise<Record<string, unknown>> {
    const record = await readJsonFileIfExists<Record<string, unknown>>(
      this.repo.paths.clarificationFile,
    );
    return record ?? {};
  }

  private async readDurableTargetSpec(): Promise<string | null> {
    try {
      return await readFile(this.repo.paths.targetSpecFile, "utf8");
    } catch {
      return null;
    }
  }

  private async appendStageHistory(
    stageResult: ConvergeStageResultRecord,
    dispatch: Awaited<ReturnType<typeof buildConvergePreRemediationDispatch>>,
    artifactsWritten: string[],
    campaign: CampaignRecord,
  ): Promise<void> {
    const record = toStageHistoryRecord(stageResult, dispatch, artifactsWritten, campaign);
    try {
      await this.repo.validateAndAppendStageResult(record);
    } catch (error) {
      // Stage-history is a best-effort audit trail; the authoritative converge
      // stage result lives at .praxis/results/<stage>.json. Surface the failure
      // through audit-warnings so operators can see that the trail is degraded.
      try {
        await this.repo.appendAuditWarning({
          source: "converge-pre-remediation-service",
          campaign_id: campaign.campaign_id,
          stage: stageResult.stage,
          dispatch_id: dispatch.dispatch_id,
          error: stringifyError(error),
          recorded_at: nowIsoUtc(),
        });
      } catch {
        // If even the audit-warning write fails, drop silently — we have already
        // failed-open on the primary write and there is nothing left to escalate.
      }
    }
  }
}
