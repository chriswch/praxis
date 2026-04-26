import type { PraxisConfig } from "./schema.js";

/**
 * Stub default workflow. The full 3-stage configuration lands in a later
 * slice once stage execution and validators are wired.
 */
export const defaultWorkflow: PraxisConfig = {
  version: 1,
  workflow: [],
};
