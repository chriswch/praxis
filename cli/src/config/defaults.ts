import type { PraxisConfig } from "./schema.js";

/**
 * Stub default workflow. The full 3-stage configuration lands in a later
 * slice once stage execution and validators are wired.
 *
 * NOTE (S-002): the empty `workflow` array is logically invalid once stages
 * actually run. Replace with the real 3-stage default (clarify / implement /
 * commit) when stage execution is wired in S-002.
 */
export const defaultWorkflow: PraxisConfig = {
  version: 1,
  workflow: [],
};
