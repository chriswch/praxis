import type { AdapterName, DispatchRecord } from "../../contracts/model.js";
import type { WorkerLaunchPayload } from "../control/types.js";

export type AdapterHealth = {
  adapter: AdapterName;
  healthy: boolean;
  supports_resume: boolean;
  reason: string;
  binary: string | null;
  version: string | null;
};

export type AdapterLaunchRequest = {
  dispatch: DispatchRecord;
  launch: WorkerLaunchPayload;
  repoRoot: string;
};

export type AdapterLaunchResponse = {
  worker_id: string;
  session_id: string | null;
  started_at: string;
  locator: string | null;
  details?: Record<string, unknown>;
};

export type AdapterCancellationHandle = {
  session_id: string | null;
  locator: string | null;
};

export interface RuntimeAdapter {
  readonly name: AdapterName;
  health(): Promise<AdapterHealth>;
  launch(request: AdapterLaunchRequest): Promise<AdapterLaunchResponse>;
  resume(sessionId: string, request: AdapterLaunchRequest): Promise<AdapterLaunchResponse>;
  cancel(handle: AdapterCancellationHandle): Promise<{ cancelled: boolean; reason: string }>;
}
