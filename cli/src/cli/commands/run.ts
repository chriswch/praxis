import { EXIT_CODE } from "../exit-codes.js";
import { PraxisStateRepository } from "../../runtime/state/index.js";
import { RunController } from "../../runtime/control/index.js";
import { ConvergeCampaignService } from "../../runtime/converge/index.js";
import {
  deriveObjectiveMarkdown,
  extractEmbeddedSlashCommands,
  writeObjectiveMarkdown,
} from "../../runtime/converge/intent-derivation.js";
import { runCommandWithEnvelope } from "./shared.js";
import type {
  AdapterName,
  ConvergeProfile,
  ExecutionMode,
  FindingSeverity,
} from "../../contracts/model.js";

export interface RunCommandArgs {
  adapter: AdapterName;
  executionMode: ExecutionMode;
  entryTask?: string;
  intent?: string;
  entrypoint?: string;
  // G-08: positional-intent defaults to autopilot + auto-continue. Operators
  // can opt out via --manual / --no-auto-continue when they want pass-level
  // checkpoints.
  manual?: boolean;
  autoContinue?: boolean;
  profile?: ConvergeProfile;
  severityThreshold?: FindingSeverity;
  maxPasses?: number;
  maxFindingsPerPass?: number;
  maxStoriesPerPass?: number;
  scope?: string[];
  commitPerStory?: boolean;
  allowWaive?: boolean;
}

export interface RunCommandOptions {
  orchestrate?: boolean;
}

export async function runRunCommand(
  repoRoot: string,
  json: boolean,
  args: RunCommandArgs,
  options: RunCommandOptions = {},
): Promise<number> {
  return runCommandWithEnvelope<Record<string, unknown>>(json, async () => {
    if (args.intent) {
      return runPositionalIntentCampaign(repoRoot, args);
    }

    if (!args.entryTask) {
      throw new Error(
        "Provide a positional intent (`praxis run \"<intent>\"`) or --entry-task <text>.",
      );
    }

    return runSingleStoryCraft(repoRoot, args.entryTask, args, options);
  });
}

async function runSingleStoryCraft(
  repoRoot: string,
  entryTask: string,
  args: RunCommandArgs,
  options: RunCommandOptions,
) {
  const repo = new PraxisStateRepository(repoRoot);
  const controller = new RunController(repo);
  const run = await controller.initializeRun({
    adapter: args.adapter,
    executionMode: args.executionMode,
    entryTask,
    entrypoint: args.entrypoint,
  });
  const shouldLaunch = options.orchestrate && run.routing.next_action === "run_stage";
  const launched = shouldLaunch ? await controller.launchReadyStage() : null;

  return {
    ok: true,
    code: EXIT_CODE.OK,
    message: launched
      ? `Initialized ${run.workflow} run ${run.run_id} and launched ${String(launched.stage)}.`
      : `Initialized ${run.workflow} run ${run.run_id}. Next stage: ${String(run.current.stage)}.`,
    data: {
      run_id: run.run_id,
      workflow: run.workflow,
      adapter: run.runtime.adapter,
      execution_mode: run.execution.mode,
      next_action: run.routing.next_action,
      next_stage: run.routing.next_stage,
      deprecated_entry_form: true,
      deprecation_note:
        "--entry-task is deprecated. Prefer `praxis run \"<intent>\"` (positional) to use the iterative loop.",
      launched,
    },
  };
}

async function runPositionalIntentCampaign(repoRoot: string, args: RunCommandArgs) {
  const intent = args.intent ?? "";
  const repo = new PraxisStateRepository(repoRoot);
  await repo.ensureLayout();

  const embeddedCommands = extractEmbeddedSlashCommands(intent);
  const derived = await deriveObjectiveMarkdown(intent, args.adapter, repoRoot);
  const objectivePath = await writeObjectiveMarkdown(repoRoot, derived.objectiveMarkdown);

  const autoContinue = args.manual === true ? false : (args.autoContinue ?? true);
  const service = new ConvergeCampaignService(repo);
  const outcome = await service.runCampaign({
    adapter: args.adapter,
    objective: objectivePath,
    profile: args.profile ?? "product-spec-gap",
    severityThreshold: args.severityThreshold ?? "medium",
    maxPasses: args.maxPasses ?? 8,
    maxFindingsPerPass: args.maxFindingsPerPass ?? 12,
    maxStoriesPerPass: args.maxStoriesPerPass ?? 12,
    scope: args.scope ?? [],
    commitPerStory: args.commitPerStory ?? false,
    autoContinue,
    allowWaive: args.allowWaive ?? false,
  });

  return {
    ok: true,
    code: EXIT_CODE.OK,
    message: `Campaign ${outcome.campaign_id} is ${outcome.status}.`,
    data: {
      ...outcome,
      intent_objective_path: objectivePath,
      embedded_commands: embeddedCommands,
      derived_sections_count: derived.derivedSections.length,
    },
  };
}

// G-01 helper: auto-detect the adapter from the environment. Prefers a
// binary override env var if set, else defaults to claude.
export function detectAdapterFromEnv(): AdapterName {
  if (process.env.PRAXIS_CLAUDE_BIN && process.env.PRAXIS_CLAUDE_BIN.trim().length > 0) {
    return "claude";
  }
  if (process.env.PRAXIS_CODEX_BIN && process.env.PRAXIS_CODEX_BIN.trim().length > 0) {
    return "codex";
  }
  if (process.env.CLAUDECODE === "1") {
    return "claude";
  }
  return "claude";
}
