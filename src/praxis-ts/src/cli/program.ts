import { Command } from "commander";
import { resolveCommandOptions } from "./context.js";
import { runStubCommand } from "./commands/stub-command.js";

type GlobalOptions = {
  repoRoot?: string;
  json?: boolean;
};

type ActionContext = {
  commandName: string;
  args?: Record<string, unknown>;
};

function actionHandler(context: ActionContext, options: GlobalOptions): void {
  const resolved = resolveCommandOptions(options);
  process.exitCode = runStubCommand(context.commandName, resolved.json);
}

function registerLifecycleCommands(program: Command): void {
  program
    .command("run")
    .description("Create and initialize a Praxis run")
    .action((_, cmd) => actionHandler({ commandName: "run" }, cmd.optsWithGlobals()));

  program
    .command("continue")
    .description("Advance a paused run")
    .action((_, cmd) => actionHandler({ commandName: "continue" }, cmd.optsWithGlobals()));

  program
    .command("resume")
    .description("Resume an in-progress worker when safe")
    .action((_, cmd) => actionHandler({ commandName: "resume" }, cmd.optsWithGlobals()));

  program
    .command("approve")
    .description("Resolve a human gate")
    .action((_, cmd) => actionHandler({ commandName: "approve" }, cmd.optsWithGlobals()));

  program
    .command("cancel")
    .description("Cancel the active run or worker")
    .action((_, cmd) => actionHandler({ commandName: "cancel" }, cmd.optsWithGlobals()));

  program
    .command("status")
    .description("Show run status and next valid action")
    .action((_, cmd) => actionHandler({ commandName: "status" }, cmd.optsWithGlobals()));

  program
    .command("inspect")
    .description("Inspect detailed run and artifact data")
    .action((_, cmd) => actionHandler({ commandName: "inspect" }, cmd.optsWithGlobals()));

  program
    .command("doctor")
    .description("Report runtime and adapter health")
    .action((_, cmd) => actionHandler({ commandName: "doctor" }, cmd.optsWithGlobals()));
}

function registerInternalCommands(program: Command): void {
  program
    .command("dispatch")
    .description("Compile and persist next worker dispatch")
    .action((_, cmd) => actionHandler({ commandName: "dispatch" }, cmd.optsWithGlobals()));

  program
    .command("submit-stage-result")
    .description("Submit a stage result artifact for routing")
    .action((_, cmd) =>
      actionHandler({ commandName: "submit-stage-result" }, cmd.optsWithGlobals())
    );

  program
    .command("build-worker-launch")
    .description("Build worker launch payload from durable state")
    .action((_, cmd) =>
      actionHandler({ commandName: "build-worker-launch" }, cmd.optsWithGlobals())
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
  registerInternalCommands(program);

  return program;
}
