import type { AdapterName } from "../../contracts/model.js";
import { InvalidInputError } from "../../contracts/errors.js";
import { ClaudeAdapter, CLAUDE_ADAPTER_NOT_IMPLEMENTED_REASON } from "./claude-adapter.js";
import { CodexAdapter } from "./codex-adapter.js";
import type { RuntimeAdapter } from "./types.js";

const registry: Record<AdapterName, RuntimeAdapter> = {
  codex: new CodexAdapter(),
  claude: new ClaudeAdapter(),
};

export function getAdapter(adapter: AdapterName): RuntimeAdapter {
  if (adapter === "claude") {
    throw new InvalidInputError(CLAUDE_ADAPTER_NOT_IMPLEMENTED_REASON);
  }
  return registry[adapter];
}

export function getAllAdapters(): RuntimeAdapter[] {
  return Object.values(registry);
}

export type {
  RuntimeAdapter,
  AdapterHealth,
  AdapterLaunchRequest,
  AdapterLaunchResponse,
} from "./types.js";
