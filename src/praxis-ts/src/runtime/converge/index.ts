export { ConvergeCampaignService } from "./campaign-service.js";
export { assessGaps, assessObjective } from "./assessment.js";
export { planRemediation, planPassBatch } from "./planner.js";
export {
  createEmptyCampaignLedger,
  mergeAssessmentIntoLedger,
  listActiveFindings,
  countUnresolvedAtOrAboveThreshold
} from "./ledger.js";
export type {
  ConvergeActionOutcome,
  ConvergeChildRunProjection,
  ConvergeInspectProjection,
  ConvergeRunInput,
  ConvergeStatusProjection
} from "./types.js";
