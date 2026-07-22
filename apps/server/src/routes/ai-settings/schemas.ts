/** Defines typed JSON contracts accepted by BYOK settings endpoints. */
import { preferredAiSources } from "@OpenDiagram/db/schema/user-ai-provider";
import { z } from "zod";
import { enabledByokProviderKinds } from "../../lib/ai-provider/provider-catalog";

const providerKindSchema = z.enum(enabledByokProviderKinds);
const rejectUnsupportedBaseUrl = (
  value: { provider: string; baseUrl?: string | null },
  ctx: z.RefinementCtx,
) => {
  if (value.baseUrl && value.provider !== "openai_compatible") {
    ctx.addIssue({
      code: "custom",
      path: ["baseUrl"],
      message: "Base URL is only supported for OpenAI-compatible providers.",
    });
  }
};

export const createProviderSchema = z
  .object({
    provider: providerKindSchema,
    label: z.string().trim().min(1).max(80).optional(),
    apiKey: z.string().trim().min(8).max(512),
    modelId: z.string().trim().min(1).max(120).optional(),
    baseUrl: z.string().trim().url().optional(),
    isDefault: z.boolean().optional(),
  })
  .strict()
  .superRefine(rejectUnsupportedBaseUrl);

export const updateProviderSchema = z
  .object({
    label: z.string().trim().min(1).max(80).nullable().optional(),
    apiKey: z.string().trim().min(8).max(512).optional(),
    modelId: z.string().trim().min(1).max(120).optional(),
    baseUrl: z.string().trim().url().nullable().optional(),
    isDefault: z.literal(true).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, { message: "No fields to update" });

export const validateProviderSchema = z
  .object({
    provider: providerKindSchema,
    apiKey: z.string().trim().min(8).max(512),
    modelId: z.string().trim().min(1).max(120).optional(),
    baseUrl: z.string().trim().url().optional(),
  })
  .strict()
  .superRefine(rejectUnsupportedBaseUrl);

export const listModelsSchema = z
  .object({
    provider: providerKindSchema,
    apiKey: z.string().trim().min(8).max(512),
    baseUrl: z.string().trim().url().optional(),
  })
  .strict()
  .superRefine(rejectUnsupportedBaseUrl);

export const preferenceSchema = z.object({ preferredSource: z.enum(preferredAiSources) }).strict();

export type CreateProviderInput = z.infer<typeof createProviderSchema>;
export type UpdateProviderInput = z.infer<typeof updateProviderSchema>;
