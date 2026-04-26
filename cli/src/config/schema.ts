import { z } from "zod";

/**
 * Stage / workflow schemas. Zod is the runtime source of truth; the public
 * TypeScript types are inferred from the schemas so that schema and types stay
 * in lockstep.
 */

export const permissionModeSchema = z.enum([
  "default",
  "acceptEdits",
  "bypassPermissions",
  "plan",
]);

export type PermissionMode = z.infer<typeof permissionModeSchema>;

const validateResultSchema = z.union([
  z.object({ ok: z.literal(true) }),
  z.object({ ok: z.literal(false), reason: z.string() }),
]);

const userPromptTemplateSchema = z.union([
  z.string(),
  z.object({ file: z.string() }),
]);

export type UserPromptTemplate = z.infer<typeof userPromptTemplateSchema>;

export const stageConfigSchema = z.object({
  id: z.string().min(1),
  systemPrompt: z.object({ file: z.string().min(1) }),
  userPromptTemplate: userPromptTemplateSchema,
  allowedTools: z.array(z.string().min(1)).optional(),
  permissionMode: permissionModeSchema.optional(),
  model: z.string().min(1).optional(),
  maxTurns: z.number().int().positive().optional(),
  timeoutMs: z.number().int().positive().optional(),
  outputArtifact: z.string().min(1),
  validate: z
    .function({
      input: [z.string()],
      output: validateResultSchema,
    })
    .optional(),
  pauseAfter: z.boolean().optional(),
});

export type StageConfig = z.infer<typeof stageConfigSchema>;

export const praxisConfigSchema = z.object({
  version: z.literal(1),
  workflow: z.array(stageConfigSchema).min(1),
});

export type PraxisConfig = z.infer<typeof praxisConfigSchema>;
