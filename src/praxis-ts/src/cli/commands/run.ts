import { EXIT_CODE } from "../exit-codes.js";
import { PraxisStateRepository } from "../../runtime/state/index.js";
import { RunController } from "../../runtime/control/index.js";
import { runCommandWithEnvelope } from "./shared.js";
import type { AdapterName, ExecutionMode, WorkflowName } from "../../contracts/model.js";

export type RunCommandArgs = {
  workflow: WorkflowName;
  adapter: AdapterName;
  executionMode: ExecutionMode;
  entryTask: string;
  entrypoint?: string;
};

export type RunCommandOptions = {
  orchestrate?: boolean;
};

export async function runRunCommand(
  repoRoot: string,
  json: boolean,
  args: RunCommandArgs,
  options: RunCommandOptions = {}
): Promise<number> {
  return runCommandWithEnvelope(json, async () => {
    const repo = new PraxisStateRepository(repoRoot);
    const controller = new RunController(repo);
    const run = await controller.initializeRun({
      workflow: args.workflow,
      adapter: args.adapter,
      executionMode: args.executionMode,
      entryTask: args.entryTask,
      entrypoint: args.entrypoint
    });
    const launched = options.orchestrate ? await controller.launchReadyStage() : null;

    return {
      ok: true,
      code: EXIT_CODE.OK,
      message: launched
        ? `Initialized ${run.workflow} run ${run.run_id} and launched ${launched.stage}.`
        : `Initialized ${run.workflow} run ${run.run_id}. Next stage: ${run.current.stage}.`,
      data: {
        run_id: run.run_id,
        workflow: run.workflow,
        adapter: run.runtime.adapter,
        execution_mode: run.execution.mode,
        next_action: run.routing.next_action,
        next_stage: run.routing.next_stage,
        launched
      }
    };
  });
}
