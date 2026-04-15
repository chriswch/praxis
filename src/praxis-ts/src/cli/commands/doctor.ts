import { EXIT_CODE } from "../exit-codes.js";
import { buildDoctorReport } from "../../runtime/control/index.js";
import { runCommandWithEnvelope } from "./shared.js";

export async function runDoctorCommand(repoRoot: string, json: boolean): Promise<number> {
  return runCommandWithEnvelope(json, async () => {
    const report = await buildDoctorReport(repoRoot);
    const healthyAdapters = report.adapters.filter((adapter) => adapter.healthy).length;
    const message = report.summary.healthy
      ? `Doctor completed. ${healthyAdapters}/${report.adapters.length} adapters healthy.`
      : `Doctor found health failures. ${healthyAdapters}/${report.adapters.length} adapters healthy.`;

    return {
      ok: report.summary.healthy,
      code: report.summary.healthy ? EXIT_CODE.OK : EXIT_CODE.HEALTH_FAILED,
      message,
      data: report
    };
  });
}
