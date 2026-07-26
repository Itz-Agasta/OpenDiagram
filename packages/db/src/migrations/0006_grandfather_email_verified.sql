-- Grandfathers every account that existed before email verification shipped.
--
-- Verification has never been wired until now, so `email_verified` is false for
-- the entire existing user base. The quota resolver treats an unverified account
-- as a guest (3 lifetime credits), which would silently demote real users from 5
-- diagrams a month to almost nothing on deploy. They signed up under no such
-- promise, so they keep their allowance; the gate applies to new signups only.
--
-- Hand-written: there is no schema change here for drizzle-kit to generate from.
-- Idempotent, and scoped by `created_at` so re-running it can never verify an
-- account created after the cutoff.
UPDATE "user"
SET "email_verified" = true, "updated_at" = now()
WHERE "email_verified" = false
  AND "created_at" < '2026-07-27T00:00:00Z';
