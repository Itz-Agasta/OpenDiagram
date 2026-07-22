UPDATE "user_ai_preference"
SET "preferred_source" = 'auto', "updated_at" = NOW()
WHERE "preferred_source" = 'chatgpt';
--> statement-breakpoint
DROP TABLE "chatgpt_store" CASCADE;
