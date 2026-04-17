import { InvalidInputError } from "../../contracts/errors.js";
import type {
  AdapterHealth,
  AdapterLaunchResponse,
  RuntimeAdapter,
} from "./types.js";

export const CLAUDE_ADAPTER_NOT_IMPLEMENTED_REASON =
  "Claude adapter is not implemented. Use --adapter codex until a real Claude worker host lands.";

// The Claude adapter is intentionally a hard fail-close stub. A previous preview returned
// synthetic session IDs from launch/resume and success from cancel, which let runs be
// silently launched against a non-existent worker or falsely marked cancelled. Every
// reachable method now rejects so no control flow can proceed against Claude. Replace this
// module wholesale when a real process host is added.
export class ClaudeAdapter implements RuntimeAdapter {
  readonly name = "claude" as const;

  health(): Promise<AdapterHealth> {
    return Promise.resolve({
      adapter: this.name,
      healthy: false,
      supports_resume: false,
      reason: CLAUDE_ADAPTER_NOT_IMPLEMENTED_REASON,
      binary: null,
      version: null,
    });
  }

  launch(): Promise<AdapterLaunchResponse> {
    return Promise.reject(new InvalidInputError(CLAUDE_ADAPTER_NOT_IMPLEMENTED_REASON));
  }

  resume(): Promise<AdapterLaunchResponse> {
    return Promise.reject(new InvalidInputError(CLAUDE_ADAPTER_NOT_IMPLEMENTED_REASON));
  }

  cancel(): Promise<{ cancelled: boolean; reason: string }> {
    return Promise.resolve({ cancelled: false, reason: CLAUDE_ADAPTER_NOT_IMPLEMENTED_REASON });
  }
}
