import { EXIT_CODE } from "../exit-codes.js";
import { runCommandWithEnvelope } from "./shared.js";
import {
  runClaudeWorkerHost,
  type WorkerHostMode,
} from "../../runtime/workers/claude-worker-host.js";

export interface RunClaudeWorkerCommandArgs {
  dispatchId: string;
  workerId: string;
  handshakePath: string;
  mode: WorkerHostMode;
  expectedSessionId?: string;
}

export async function runRunClaudeWorkerCommand(
  repoRoot: string,
  json: boolean,
  args: RunClaudeWorkerCommandArgs,
): Promise<number> {
  return runCommandWithEnvelope(json, async () => {
    await runClaudeWorkerHost({
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
      message: `Claude worker host ${args.workerId} finished for dispatch ${args.dispatchId}.`,
      data: {
        dispatch_id: args.dispatchId,
        worker_id: args.workerId,
        mode: args.mode,
      },
    };
  });
}
