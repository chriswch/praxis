import { randomUUID } from "node:crypto";

export function buildRunId(): string {
  return `run_${randomUUID()}`;
}

export function buildDispatchId(): string {
  return `dsp_${randomUUID()}`;
}

export function buildWorkerId(scope: string, stage: string): string {
  return `wrk_${scope}_${stage}_${randomUUID()}`;
}
