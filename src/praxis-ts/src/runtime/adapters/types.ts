import type { AdapterName, DispatchRecord } from "../../contracts/model.js";

export type AdapterHealth = {
  adapter: AdapterName;
  healthy: boolean;
  supports_resume: boolean;
  reason: string;
};

export type AdapterLaunchRequest = {
  dispatch: DispatchRecord;
  repoRoot: string;
  entrypoint: string;
};

export type AdapterLaunchResponse = {
  worker_id: string;
  session_id: string | null;
  started_at: string;
  locator: string | null;
};

export interface RuntimeAdapter {
  readonly name: AdapterName;
  health(): Promise<AdapterHealth>;
  launch(request: AdapterLaunchRequest): Promise<AdapterLaunchResponse>;
  resume(sessionId: string, request: AdapterLaunchRequest): Promise<AdapterLaunchResponse>;
  cancel(sessionId: string): Promise<{ cancelled: boolean; reason: string }>;
}
