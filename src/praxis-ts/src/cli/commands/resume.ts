import { EXIT_CODE } from "../exit-codes.js";
import { PraxisStateRepository } from "../../runtime/state/index.js";
import { RunController } from "../../runtime/control/index.js";
import { runCommandWithEnvelope } from "./shared.js";

export interface ResumeCommandOptions {
  orchestrate?: boolean;
}

export async function runResumeCommand(
  repoRoot: string,
  json: boolean,
  options: ResumeCommandOptions = {},
): Promise<number> {
  return runCommandWithEnvelope(json, async () => {
    const controller = new RunController(new PraxisStateRepository(repoRoot));
    const outcome = await controller.resumeRun();
    const resumed = options.orchestrate ? await controller.resumeRegisteredStage() : null;

    return {
      ok: true,
      code: EXIT_CODE.OK,
      message: resumed
        ? `Run ${outcome.run_id} resumed worker ${resumed.worker_id} for ${String(resumed.stage)}.`
        : `Run ${outcome.run_id} resumed at ${String(outcome.next_stage)}.`,
      data: {
        ...outcome,
        resumed,
      },
    };
  });
}
