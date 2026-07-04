ALTER TABLE "project_file" ADD COLUMN IF NOT EXISTS "history" jsonb DEFAULT '[]'::jsonb;
