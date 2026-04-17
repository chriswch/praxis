import type { AdapterName, CampaignRecord, CampaignStopReasonCode, FindingSeverity, ConvergeProfile } from "../../contracts/model.js";
import type { ConvergeRuntimeStage } from "./stage-runtime.js";

export type ConvergeRunInput = {
  adapter: AdapterName;
  objective: string;
  profile: ConvergeProfile;
  severityThreshold: FindingSeverity;
  maxPasses: number;
  maxFindingsPerPass: number;
  maxStoriesPerPass: number;
  scope: string[];
  commitPerStory: boolean;
  autoContinue: boolean;
  allowWaive: boolean;
};

export type ConvergeActionOutcome = {
  campaign_id: string;
  status: CampaignRecord["status"];
  current_pass: number;
  stop_reason_code: CampaignStopReasonCode | null;
  reason: string;
};

export type ConvergeChildRunProjection = {
  run_id: string;
  status: string;
  completion_state: "pending" | "completed" | "escalated";
  reason: string | null;
  next_action: string | null;
  next_stage: string | null;
  updated_at: string | null;
};

export type ConvergeStatusProjection = {
  campaign_id: string;
  status: CampaignRecord["status"];
  profile: CampaignRecord["profile"];
  severity_threshold: CampaignRecord["severity_threshold"];
  current_pass: number;
  max_passes: number;
  stop_reason_code: CampaignStopReasonCode | null;
  reason: string;
  current_review_id: string | null;
  current_child_run_id: string | null;
  child_run: ConvergeChildRunProjection | null;
  unresolved_at_or_above_threshold: number;
};

export type ConvergeInspectProjection = {
  campaign: CampaignRecord;
  target_spec_path: string;
  pre_remediation_contracts: Record<ConvergeRuntimeStage, {
    goal: string;
    required_inputs: string[];
    outputs: string[];
    done_when: string[];
  }>;
  artifacts: {
    objective_file: string;
    target_spec_file: string;
    gap_file: string;
    gap_data_file: string;
    remediation_map_file: string;
    remediation_map_data_file: string;
    campaign_file: string;
    campaign_ledger_file: string;
    child_run_slot_file: string;
    reviews_dir: string;
    passes_dir: string;
  };
  unresolved_findings: Array<{
    finding_id: string;
    title: string;
    severity: FindingSeverity;
    status: string;
    affected_paths: string[];
  }>;
  child_run: ConvergeChildRunProjection | null;
  recent_pass_ids: string[];
};
