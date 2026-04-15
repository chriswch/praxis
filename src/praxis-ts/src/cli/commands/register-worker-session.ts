import { EXIT_CODE } from "../exit-codes.js";
import { PraxisStateRepository } from "../../runtime/state/index.js";
import { RunController } from "../../runtime/control/index.js";
import { runCommandWithEnvelope } from "./shared.js";

export type RegisterWorkerSessionOptions = {
  dispatchId: string;
  workerId: string;
  sessionId: string | null;
  startedAt: string;
  locator: string | null;
  resumable: boolean;
};

export async function runRegisterWorkerSessionCommand(
  repoRoot: string,
  json: boolean,
  options: RegisterWorkerSessionOptions
): Promise<number> {
  return runCommandWithEnvelope(json, async () => {
    const controller = new RunController(new PraxisStateRepository(repoRoot));
    const result = await controller.registerWorkerSession({
      dispatch_id: options.dispatchId,
      worker_id: options.workerId,
      session_id: options.sessionId,
      started_at: options.startedAt,
      locator: options.locator,
      resumable: options.resumable
    });

    return {
      ok: true,
      code: EXIT_CODE.OK,
      message: `Registered worker session for dispatch ${result.dispatch_id}.`,
      data: result
    };
  });
}
