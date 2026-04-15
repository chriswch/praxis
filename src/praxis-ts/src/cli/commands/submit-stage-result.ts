import { EXIT_CODE } from "../exit-codes.js";
import { PraxisStateRepository } from "../../runtime/state/index.js";
import { RunController } from "../../runtime/control/index.js";
import { runCommandWithEnvelope } from "./shared.js";

export async function runSubmitStageResultCommand(
  repoRoot: string,
  json: boolean,
  stageResultPath: string
): Promise<number> {
  return runCommandWithEnvelope(json, async () => {
    const controller = new RunController(new PraxisStateRepository(repoRoot));
    const outcome = await controller.submitStageResult(stageResultPath);

    return {
      ok: true,
      code: EXIT_CODE.OK,
      message: `Accepted ${outcome.stage} result (${outcome.outcome_code}).`,
      data: outcome
    };
  });
}
