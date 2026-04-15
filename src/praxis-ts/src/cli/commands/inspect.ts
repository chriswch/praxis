import { EXIT_CODE } from "../exit-codes.js";
import { PraxisStateRepository } from "../../runtime/state/index.js";
import { RunController } from "../../runtime/control/index.js";
import { runCommandWithEnvelope } from "./shared.js";

export async function runInspectCommand(repoRoot: string, json: boolean): Promise<number> {
  return runCommandWithEnvelope(json, async () => {
    const repo = new PraxisStateRepository(repoRoot);
    const controller = new RunController(repo);
    const details = await controller.inspectRun();

    return {
      ok: true,
      code: EXIT_CODE.OK,
      message: `Inspecting run ${details.run.run_id}. Current stage: ${details.run.current.stage}.`,
      data: details
    };
  });
}
