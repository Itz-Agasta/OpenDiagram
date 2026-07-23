DROP INDEX "user_ai_provider_user_id_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "user_ai_provider_user_provider_idx" ON "user_ai_provider" USING btree ("user_id","provider");