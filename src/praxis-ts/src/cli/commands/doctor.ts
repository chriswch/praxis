import { EXIT_CODE } from "../exit-codes.js";
import { buildDoctorReport } from "../../runtime/control/index.js";
import { runCommandWithEnvelope } from "./shared.js";

export async function runDoctorCommand(repoRoot: string, json: boolean): Promise<number> {
  return runCommandWithEnvelope(json, async () => {
    const report = await buildDoctorReport(repoRoot);
    const healthyAdapters = report.adapters.filter((adapter) => adapter.healthy).length;

    return {
      ok: true,
      code: EXIT_CODE.OK,
      message: `Doctor completed. ${healthyAdapters}/${report.adapters.length} adapters healthy.`,
      data: report
    };
  });
}
