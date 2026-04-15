import { Command } from "commander";
import { resolveCommandOptions } from "./context.js";
import { runInspectCommand, runRunCommand, runStatusCommand, runStubCommand } from "./commands/index.js";
import type { AdapterName, ExecutionMode, WorkflowName } from "../contracts/model.js";

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

function toGlobalOptions(cmd: Command): ReturnType<typeof resolveCommandOptions> {
  return resolveCommandOptions(cmd.optsWithGlobals<GlobalOptions>());
}

function registerLifecycleCommands(program: Command): void {
  program
    .command("run")
    .description("Create and initialize a Praxis run")
    .requiredOption("--entry-task <text>", "Entry task summary")
    .option("--workflow <workflow>", "Workflow name", "forge")
    .option("--adapter <adapter>", "Adapter name", "codex")
    .option("--execution-mode <mode>", "Execution mode", "manual")
    .option("--entrypoint <entrypoint>", "Runtime entrypoint")
    .action(async (opts: RunOptions, cmd: Command) => {
      const global = toGlobalOptions(cmd);
      process.exitCode = await runRunCommand(global.repoRoot, global.json, {
        workflow: opts.workflow,
        adapter: opts.adapter,
        executionMode: opts.executionMode,
        entryTask: opts.entryTask,
        entrypoint: opts.entrypoint
      });
    });

  program
    .command("continue")
    .description("Advance a paused run")
    .action((_, cmd: Command) => {
      const global = toGlobalOptions(cmd);
      process.exitCode = runStubCommand("continue", global.json);
    });

  program
    .command("resume")
    .description("Resume an in-progress worker when safe")
    .action((_, cmd: Command) => {
      const global = toGlobalOptions(cmd);
      process.exitCode = runStubCommand("resume", global.json);
    });

  program
    .command("approve")
    .description("Resolve a human gate")
    .action((_, cmd: Command) => {
      const global = toGlobalOptions(cmd);
      process.exitCode = runStubCommand("approve", global.json);
    });

  program
    .command("cancel")
    .description("Cancel the active run or worker")
    .action((_, cmd: Command) => {
      const global = toGlobalOptions(cmd);
      process.exitCode = runStubCommand("cancel", global.json);
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
    .action((_, cmd: Command) => {
      const global = toGlobalOptions(cmd);
      process.exitCode = runStubCommand("doctor", global.json);
    });
}

function registerInternalCommands(program: Command): void {
  program
    .command("dispatch")
    .description("Compile and persist next worker dispatch")
    .action((_, cmd: Command) => {
      const global = toGlobalOptions(cmd);
      process.exitCode = runStubCommand("dispatch", global.json);
    });

  program
    .command("submit-stage-result")
    .description("Submit a stage result artifact for routing")
    .action((_, cmd: Command) => {
      const global = toGlobalOptions(cmd);
      process.exitCode = runStubCommand("submit-stage-result", global.json);
    });

  program
    .command("build-worker-launch")
    .description("Build worker launch payload from durable state")
    .action((_, cmd: Command) => {
      const global = toGlobalOptions(cmd);
      process.exitCode = runStubCommand("build-worker-launch", global.json);
    });
}

export function buildProgram(): Command {
  const program = new Command();

  program
    .name("praxis")
    .description("Praxis TypeScript CLI")
    .option("--repo-root <path>", "Repository root path", ".")
    .option("--json", "Emit JSON output", false);

  registerLifecycleCommands(program);
  registerInternalCommands(program);

  return program;
}
