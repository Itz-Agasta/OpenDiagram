/** Per-user BYOK AI providers: an encrypted API key + chosen model, one default per user. */
import { relations, sql } from "drizzle-orm";
import { boolean, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

import { user } from "./auth";

export const userAiProviderKinds = ["openai", "anthropic", "google", "openrouter"] as const;
export type UserAiProviderKind = (typeof userAiProviderKinds)[number];

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
    encryptedApiKey: text("encrypted_api_key").notNull(),
    keyLast4: text("key_last4").notNull(),
    modelId: text("model_id").notNull(),
    isDefault: boolean("is_default").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    // One row per provider per user (reconnect updates it). Also serves as the
    // userId lookup index via its leftmost column.
    uniqueIndex("user_ai_provider_user_provider_idx").on(table.userId, table.provider),
    // At most one default provider per user.
    uniqueIndex("user_ai_provider_one_default_per_user_idx")
      .on(table.userId)
      .where(sql`${table.isDefault} = true`),
  ],
);

export const userAiProviderRelations = relations(userAiProvider, ({ one }) => ({
  user: one(user, {
    fields: [userAiProvider.userId],
    references: [user.id],
  }),
}));
