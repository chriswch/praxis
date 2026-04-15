import { EXIT_CODE } from "../exit-codes.js";
import { PraxisStateRepository } from "../../runtime/state/index.js";
import { RunController } from "../../runtime/control/index.js";
import { runCommandWithEnvelope } from "./shared.js";

export async function runCancelCommand(
  repoRoot: string,
  json: boolean,
  note: string | null
): Promise<number> {
  return runCommandWithEnvelope(json, async () => {
    const controller = new RunController(new PraxisStateRepository(repoRoot));
    const outcome = await controller.cancelRun(note);

    return {
      ok: true,
      code: EXIT_CODE.OK,
      message: `Run ${outcome.run_id} cancelled.`,
      data: outcome
    };
  });
}
