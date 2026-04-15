import type { AdapterName } from "../../contracts/model.js";
import { ClaudeAdapter } from "./claude-adapter.js";
import { CodexAdapter } from "./codex-adapter.js";
import type { RuntimeAdapter } from "./types.js";

const registry: Record<AdapterName, RuntimeAdapter> = {
  codex: new CodexAdapter(),
  claude: new ClaudeAdapter()
};

export function getAdapter(adapter: AdapterName): RuntimeAdapter {
  return registry[adapter];
}

export function getAllAdapters(): RuntimeAdapter[] {
  return Object.values(registry);
}

export type { RuntimeAdapter, AdapterHealth, AdapterLaunchRequest, AdapterLaunchResponse } from "./types.js";
