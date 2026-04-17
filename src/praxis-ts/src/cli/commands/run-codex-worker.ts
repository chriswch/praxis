import { EXIT_CODE } from "../exit-codes.js";
import { runCommandWithEnvelope } from "./shared.js";
import {
  runCodexWorkerHost,
  type WorkerHostMode,
} from "../../runtime/workers/codex-worker-host.js";

export type RunCodexWorkerCommandArgs = {
  dispatchId: string;
  workerId: string;
  handshakePath: string;
  mode: WorkerHostMode;
  expectedSessionId?: string;
};

export async function runRunCodexWorkerCommand(
  repoRoot: string,
  json: boolean,
  args: RunCodexWorkerCommandArgs,
): Promise<number> {
  return runCommandWithEnvelope(json, async () => {
    await runCodexWorkerHost({
      repoRoot,
      dispatchId: args.dispatchId,
      workerId: args.workerId,
      handshakePath: args.handshakePath,
      mode: args.mode,
      expectedSessionId: args.expectedSessionId ?? null,
    });

    return {
      ok: true,
      code: EXIT_CODE.OK,
      message: `Codex worker host ${args.workerId} finished for dispatch ${args.dispatchId}.`,
      data: {
        dispatch_id: args.dispatchId,
        worker_id: args.workerId,
        mode: args.mode,
      },
    };
  });
}
