/**
 * Hand-written interfaces for S-001. Replaced with zod-derived schemas in
 * S-002 when validation lands.
 */

export type PermissionMode =
  | "default"
  | "acceptEdits"
  | "bypassPermissions"
  | "plan";

export interface StageConfig {
  id: string;
  systemPrompt: { file: string };
  userPromptTemplate: string;
  allowedTools?: string[];
  permissionMode?: PermissionMode;
  model?: string;
  maxTurns?: number;
  timeoutMs?: number;
  outputArtifact: string;
  validate?: (text: string) => { ok: true } | { ok: false; reason: string };
  pauseAfter?: boolean;
}

export interface PraxisConfig {
  version: 1;
  workflow: StageConfig[];
}
