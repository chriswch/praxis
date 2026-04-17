import { EXIT_CODE } from "../exit-codes.js";
import { printEnvelope } from "../output.js";

export function runStubCommand(commandName: string, json: boolean): number {
  printEnvelope(
    {
      ok: true,
      code: EXIT_CODE.OK,
      message: `${commandName} command is wired and ready for runtime implementation.`,
      data: { command: commandName },
    },
    json,
  );

  return EXIT_CODE.OK;
}
