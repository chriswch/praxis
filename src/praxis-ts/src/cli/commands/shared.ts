import { EXIT_CODE } from "../exit-codes.js";
import { printEnvelope, type CommandEnvelope } from "../output.js";
import {
  BlockedStateError,
  InvalidInputError,
  RejectedProgressionError
} from "../../contracts/errors.js";
import { ContractError } from "../../contracts/validators.js";

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
    const code =
      error instanceof InvalidInputError
        || error instanceof ContractError
        ? EXIT_CODE.INVALID_INPUT
        : error instanceof BlockedStateError
          ? EXIT_CODE.BLOCKED
          : error instanceof RejectedProgressionError
            ? EXIT_CODE.REJECTED
            : EXIT_CODE.FAILED;
    const envelope: CommandEnvelope<Record<string, never>> = {
      ok: false,
      code,
      message
    };
    printEnvelope(envelope, json);
    return code;
  }
}
