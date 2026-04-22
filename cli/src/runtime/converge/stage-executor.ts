import type {
  CampaignRecord,
  ConvergeStageName,
  ConvergeStageResultRecord,
  DispatchRecord,
  GapAssessmentResult,
  RemediationMapRecord,
} from "../../contracts/model.js";
import type { PraxisStateRepository } from "../state/repository.js";

// Per-stage execution inputs for adapter-backed executors (clarifying-intent
// and assessing-gaps). Planning-remediation is dispatched in-process by
// ConvergePassService and does not flow through this registry.
export interface ConvergeStageExecutorContext {
  readonly campaign: CampaignRecord;
  readonly dispatch: DispatchRecord;
  readonly repo: PraxisStateRepository;
  readonly repoRoot: string;
  readonly passNumber: number;
  readonly reviewId: string | null;
  readonly generatedAt: string;
  readonly objectiveText: string;
  readonly targetSpecText: string | null;
}

export interface ConvergeStageExecutorOutput {
  readonly stageResult: ConvergeStageResultRecord;
  readonly artifactsWritten: string[];
  readonly gap?: GapAssessmentResult;
  readonly remediationMap?: RemediationMapRecord;
  readonly remediationMarkdown?: string;
  readonly targetSpecText?: string;
  readonly needsClarification?: boolean;
  readonly clarificationIssues?: string[];
  readonly clarificationRecord?: Record<string, unknown>;
}

export interface ConvergeStageExecutor {
  readonly stage: ConvergeStageName;
  execute(context: ConvergeStageExecutorContext): Promise<ConvergeStageExecutorOutput>;
}

// Registry for per-stage executors. Swapping an implementation (adapter-backed
// vs. in-process) is a registration change — the campaign service never cares
// which concrete executor runs the stage.
export class ConvergeStageExecutorRegistry {
  private readonly executors = new Map<ConvergeStageName, ConvergeStageExecutor>();

  register(executor: ConvergeStageExecutor): this {
    this.executors.set(executor.stage, executor);
    return this;
  }

  resolve(stage: ConvergeStageName): ConvergeStageExecutor {
    const executor = this.executors.get(stage);
    if (!executor) {
      throw new Error(`No converge stage executor registered for ${stage}.`);
    }
    return executor;
  }

  has(stage: ConvergeStageName): boolean {
    return this.executors.has(stage);
  }
}
