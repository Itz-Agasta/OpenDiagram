/** Defines encrypted per-user AI providers and their runtime source preference. */
import { relations, sql } from "drizzle-orm";
import { boolean, index, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

import { user } from "./auth";

export const userAiProviderKinds = [
  "openai",
  "google",
  "anthropic",
  "openrouter",
  "openai_compatible",
] as const;
export type UserAiProviderKind = (typeof userAiProviderKinds)[number];

export const preferredAiSources = ["auto", "byok", "platform"] as const;
export type PreferredAiSource = (typeof preferredAiSources)[number];

export const userAiProvider = pgTable(
  "user_ai_provider",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    provider: text("provider", { enum: userAiProviderKinds }).notNull(),
    label: text("label"),
    baseUrl: text("base_url"),
    modelId: text("model_id").notNull(),
    encryptedApiKey: text("encrypted_api_key").notNull(),
    keyLast4: text("key_last4").notNull(),
    isDefault: boolean("is_default").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index("user_ai_provider_userId_idx").on(table.userId),
    uniqueIndex("user_ai_provider_one_default_per_user_idx")
      .on(table.userId)
      .where(sql`${table.isDefault} = true`),
  ],
);

export const userAiPreference = pgTable("user_ai_preference", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  preferredSource: text("preferred_source", { enum: preferredAiSources })
    .default("platform")
    .notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
});

export const userAiProviderRelations = relations(userAiProvider, ({ one }) => ({
  user: one(user, {
    fields: [userAiProvider.userId],
    references: [user.id],
  }),
}));

export const userAiPreferenceRelations = relations(userAiPreference, ({ one }) => ({
  user: one(user, {
    fields: [userAiPreference.userId],
    references: [user.id],
  }),
}));
