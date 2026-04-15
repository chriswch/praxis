import { EXIT_CODE } from "../exit-codes.js";
import { PraxisStateRepository } from "../../runtime/state/index.js";
import { RunController } from "../../runtime/control/index.js";
import { runCommandWithEnvelope } from "./shared.js";

export async function runStatusCommand(repoRoot: string, json: boolean): Promise<number> {
  return runCommandWithEnvelope(json, async () => {
    const repo = new PraxisStateRepository(repoRoot);
    const controller = new RunController(repo);
    const status = await controller.getStatus();

    return {
      ok: true,
      code: EXIT_CODE.OK,
      message: `Run ${status.run_id} is ${status.status}. Next action: ${status.next_action}.`,
      data: status
    };
  });
}
