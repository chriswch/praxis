import { EXIT_CODE } from "../exit-codes.js";
import { printEnvelope, type CommandEnvelope } from "../output.js";

export async function runCommandWithEnvelope<T>(
  json: boolean,
  operation: () => Promise<CommandEnvelope<T>>
): Promise<number> {
  try {
    const envelope = await operation();
    printEnvelope(envelope, json);
    return envelope.code;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    const envelope: CommandEnvelope<Record<string, never>> = {
      ok: false,
      code: EXIT_CODE.FAILED,
      message
    };
    printEnvelope(envelope, json);
    return EXIT_CODE.FAILED;
  }
}
