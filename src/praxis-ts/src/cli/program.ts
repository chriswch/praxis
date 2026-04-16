import { Command, Option } from "commander";
import { resolveCommandOptions } from "./context.js";
import {
  runApproveCommand,
  runBuildWorkerLaunchCommand,
  runCancelCommand,
  runConvergeCancelCommand,
  runConvergeContinueCommand,
  runConvergeInspectCommand,
  runConvergeResumeCommand,
  runConvergeRunCommand,
  runConvergeStatusCommand,
  runContinueCommand,
  runDoctorCommand,
  runDispatchCommand,
  runInspectCommand,
  runRegisterWorkerSessionCommand,
  runRunCodexWorkerCommand,
  runResumeCommand,
  runRunCommand,
  runSubmitStageResultCommand,
  runStatusCommand
} from "./commands/index.js";
import {
  ADAPTER_NAMES,
  CONVERGE_PROFILES,
  EXECUTION_MODES,
  FINDING_SEVERITIES,
  WORKFLOW_NAMES,
  type AdapterName,
  type ConvergeProfile,
  type ExecutionMode,
  type FindingSeverity,
  type WorkflowName
} from "../contracts/model.js";

type GlobalOptions = {
  repoRoot?: string;
  json?: boolean;
};

type RunOptions = GlobalOptions & {
  workflow: WorkflowName;
  adapter: AdapterName;
  executionMode: ExecutionMode;
  entryTask: string;
  entrypoint?: string;
};

type ConvergeRunOptions = GlobalOptions & {
  workflow: "forge";
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

function toGlobalOptions(cmd: Command): ReturnType<typeof resolveCommandOptions> {
  return resolveCommandOptions(cmd.optsWithGlobals<GlobalOptions>());
}

function parsePositiveInt(raw: string): number {
  const value = Number.parseInt(raw, 10);
  if (Number.isNaN(value)) {
    return 0;
  }
  return value;
}

function registerLifecycleCommands(program: Command): void {
  program
    .command("run")
    .description("Create and initialize a Praxis run")
    .requiredOption("--entry-task <text>", "Entry task summary")
    .addOption(
      new Option("--workflow <workflow>", "Workflow name")
        .choices([...WORKFLOW_NAMES])
        .default("forge")
    )
    .addOption(
      new Option("--adapter <adapter>", "Adapter name")
        .choices([...ADAPTER_NAMES])
        .default("codex")
    )
    .addOption(
      new Option("--execution-mode <mode>", "Execution mode")
        .choices([...EXECUTION_MODES])
        .default("manual")
    )
    .option("--entrypoint <entrypoint>", "Runtime entrypoint")
    .action(async (opts: RunOptions, cmd: Command) => {
      const global = toGlobalOptions(cmd);
      process.exitCode = await runRunCommand(global.repoRoot, global.json, {
        workflow: opts.workflow,
        adapter: opts.adapter,
        executionMode: opts.executionMode,
        entryTask: opts.entryTask,
        entrypoint: opts.entrypoint
      }, { orchestrate: true });
    });

  program
    .command("continue")
    .description("Advance a paused run")
    .action(async (_, cmd: Command) => {
      const global = toGlobalOptions(cmd);
      process.exitCode = await runContinueCommand(global.repoRoot, global.json, { orchestrate: true });
    });

  program
    .command("resume")
    .description("Resume an in-progress worker when safe")
    .action(async (_, cmd: Command) => {
      const global = toGlobalOptions(cmd);
      process.exitCode = await runResumeCommand(global.repoRoot, global.json, { orchestrate: true });
    });

  program
    .command("approve")
    .description("Resolve a human gate")
    .option("--note <text>", "Approval note")
    .action(async (opts: { note?: string }, cmd: Command) => {
      const global = toGlobalOptions(cmd);
      process.exitCode = await runApproveCommand(
        global.repoRoot,
        global.json,
        opts.note ?? null,
        { orchestrate: true }
      );
    });

  program
    .command("cancel")
    .description("Cancel the active run or worker")
    .option("--note <text>", "Cancellation note")
    .action(async (opts: { note?: string }, cmd: Command) => {
      const global = toGlobalOptions(cmd);
      process.exitCode = await runCancelCommand(global.repoRoot, global.json, opts.note ?? null);
    });

  program
    .command("status")
    .description("Show run status and next valid action")
    .action(async (_, cmd: Command) => {
      const global = toGlobalOptions(cmd);
      process.exitCode = await runStatusCommand(global.repoRoot, global.json);
    });

  program
    .command("inspect")
    .description("Inspect detailed run and artifact data")
    .action(async (_, cmd: Command) => {
      const global = toGlobalOptions(cmd);
      process.exitCode = await runInspectCommand(global.repoRoot, global.json);
    });

  program
    .command("doctor")
    .description("Report runtime and adapter health")
    .action(async (_, cmd: Command) => {
      const global = toGlobalOptions(cmd);
      process.exitCode = await runDoctorCommand(global.repoRoot, global.json);
    });
}

function registerConvergeCommands(program: Command): void {
  const converge = program
    .command("converge")
    .description("Campaign-level iterative convergence using child forge remediation");

  converge
    .command("run")
    .description("Start a converge campaign")
    .requiredOption("--objective <path>", "Objective document path")
    .addOption(
      new Option("--workflow <workflow>", "Child remediation workflow")
        .choices(["forge"])
        .default("forge")
    )
    .addOption(
      new Option("--adapter <adapter>", "Adapter name")
        .choices([...ADAPTER_NAMES])
        .default("codex")
    )
    .addOption(
      new Option("--profile <profile>", "Assessment profile")
        .choices([...CONVERGE_PROFILES])
        .default("product-spec-gap")
    )
    .addOption(
      new Option("--severity-threshold <severity>", "Convergence threshold")
        .choices([...FINDING_SEVERITIES])
        .default("medium")
    )
    .option("--max-passes <n>", "Maximum convergence passes", "8")
    .option("--max-findings-per-pass <n>", "Maximum findings per remediation batch", "12")
    .option("--max-stories-per-pass <n>", "Maximum stories per remediation batch", "12")
    .option("--scope <paths...>", "Scope path prefixes", [])
    .option("--commit-per-story", "Require remediation commits per story", false)
    .option("--auto-continue", "Auto-advance campaign passes", false)
    .option("--allow-waive", "Allow waiving low-confidence low-severity findings", false)
    .action(async (opts: ConvergeRunOptions, cmd: Command) => {
      const global = toGlobalOptions(cmd);
      process.exitCode = await runConvergeRunCommand(global.repoRoot, global.json, {
        workflow: "forge",
        adapter: opts.adapter,
        objective: opts.objective,
        profile: opts.profile,
        severityThreshold: opts.severityThreshold,
        maxPasses: parsePositiveInt(String(opts.maxPasses)),
        maxFindingsPerPass: parsePositiveInt(String(opts.maxFindingsPerPass)),
        maxStoriesPerPass: parsePositiveInt(String(opts.maxStoriesPerPass)),
        scope: Array.isArray(opts.scope) ? opts.scope : [],
        commitPerStory: opts.commitPerStory ?? false,
        autoContinue: opts.autoContinue ?? false,
        allowWaive: opts.allowWaive ?? false
      });
    });

  converge
    .command("status")
    .description("Show converge campaign status")
    .action(async (_, cmd: Command) => {
      const global = toGlobalOptions(cmd);
      process.exitCode = await runConvergeStatusCommand(global.repoRoot, global.json);
    });

  converge
    .command("inspect")
    .description("Inspect detailed converge campaign state")
    .action(async (_, cmd: Command) => {
      const global = toGlobalOptions(cmd);
      process.exitCode = await runConvergeInspectCommand(global.repoRoot, global.json);
    });

  converge
    .command("continue")
    .description("Continue a waiting converge campaign")
    .action(async (_, cmd: Command) => {
      const global = toGlobalOptions(cmd);
      process.exitCode = await runConvergeContinueCommand(global.repoRoot, global.json);
    });

  converge
    .command("resume")
    .description("Resume a running converge campaign from durable state")
    .action(async (_, cmd: Command) => {
      const global = toGlobalOptions(cmd);
      process.exitCode = await runConvergeResumeCommand(global.repoRoot, global.json);
    });

  converge
    .command("cancel")
    .description("Cancel a converge campaign")
    .option("--note <text>", "Cancellation note")
    .action(async (opts: { note?: string }, cmd: Command) => {
      const global = toGlobalOptions(cmd);
      process.exitCode = await runConvergeCancelCommand(global.repoRoot, global.json, opts.note ?? null);
    });
}

function registerInternalCommands(program: Command): void {
  program
    .command("dispatch")
    .description("Compile and persist next worker dispatch")
    .action(async (_, cmd: Command) => {
      const global = toGlobalOptions(cmd);
      process.exitCode = await runDispatchCommand(global.repoRoot, global.json);
    });

  program
    .command("submit-stage-result")
    .description("Submit a stage result artifact for routing")
    .requiredOption("--stage-result-path <path>", "Path to stage result JSON")
    .action(async (opts: { stageResultPath: string }, cmd: Command) => {
      const global = toGlobalOptions(cmd);
      process.exitCode = await runSubmitStageResultCommand(
        global.repoRoot,
        global.json,
        opts.stageResultPath
      );
    });

  program
    .command("build-worker-launch")
    .description("Build worker launch payload from durable state")
    .action(async (_, cmd: Command) => {
      const global = toGlobalOptions(cmd);
      process.exitCode = await runBuildWorkerLaunchCommand(global.repoRoot, global.json);
    });

  program
    .command("register-worker-session")
    .description("Persist adapter launch metadata for lifecycle resume/cancel")
    .requiredOption("--dispatch-id <dispatch-id>", "Dispatch identifier")
    .requiredOption("--worker-id <worker-id>", "Adapter worker identifier")
    .requiredOption("--started-at <iso8601>", "Worker launch timestamp")
    .option("--session-id <session-id>", "Adapter session identifier")
    .option("--locator <locator>", "Adapter worker locator")
    .option("--resumable", "Mark session as resumable", false)
    .action(
      async (
        opts: {
          dispatchId: string;
          workerId: string;
          startedAt: string;
          sessionId?: string;
          locator?: string;
          resumable?: boolean;
        },
        cmd: Command
      ) => {
        const global = toGlobalOptions(cmd);
        process.exitCode = await runRegisterWorkerSessionCommand(global.repoRoot, global.json, {
          dispatchId: opts.dispatchId,
          workerId: opts.workerId,
          sessionId: opts.sessionId ?? null,
          startedAt: opts.startedAt,
          locator: opts.locator ?? null,
          resumable: opts.resumable ?? false
        });
      }
    );

  program
    .command("run-codex-worker")
    .description("Internal Codex worker host entrypoint")
    .requiredOption("--dispatch-id <dispatch-id>", "Dispatch identifier")
    .requiredOption("--worker-id <worker-id>", "Worker identifier")
    .requiredOption("--handshake-path <path>", "Handshake artifact path under .praxis")
    .requiredOption("--mode <mode>", "Worker host mode (launch|resume)")
    .option("--expected-session-id <session-id>", "Expected provider session ID for resume")
    .action(
      async (
        opts: {
          dispatchId: string;
          workerId: string;
          handshakePath: string;
          mode: string;
          expectedSessionId?: string;
        },
        cmd: Command
      ) => {
        const global = toGlobalOptions(cmd);
        if (opts.mode !== "launch" && opts.mode !== "resume") {
          throw new Error(`Invalid run-codex-worker mode: ${opts.mode}`);
        }
        process.exitCode = await runRunCodexWorkerCommand(global.repoRoot, global.json, {
          dispatchId: opts.dispatchId,
          workerId: opts.workerId,
          handshakePath: opts.handshakePath,
          mode: opts.mode,
          expectedSessionId: opts.expectedSessionId
        });
      }
    );
}

export function buildProgram(): Command {
  const program = new Command();

  program
    .name("praxis")
    .description("Praxis TypeScript CLI")
    .option("--repo-root <path>", "Repository root path", ".")
    .option("--json", "Emit JSON output", false);

  registerLifecycleCommands(program);
  registerConvergeCommands(program);
  registerInternalCommands(program);

  return program;
}
