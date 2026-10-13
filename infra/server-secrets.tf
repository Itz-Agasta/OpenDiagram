locals {
  infisical_project_id = "bc7e2422-3367-414c-a029-435f38f54b00"

  # Read from Infisical prod /server.
  server_secret_names = toset([
    "BETTER_AUTH_SECRET",
    "BYOK_ENCRYPTION_KEY",
    "DATABASE_URL",
    "DODO_PAYMENTS_API_KEY",
    "DODO_WEBHOOK_SECRET",
    "GITHUB_CLIENT_SECRET",
    "GOOGLE_GENERATIVE_AI_API_KEY",
    "RESEND_API_KEY",
    "S3_ACCESS_KEY_ID",
    "S3_SECRET_ACCESS_KEY",
    "SENTRY_DSN",
  ])

  # Bump after changing any of the values above in Infisical: the apply writes
  # a new version and rolls a new revision.
  server_env_version = 1
}

# Ephemeral + secret_data_wo keeps every value out of state; Cloud Run env values
# have no write-only form.
ephemeral "infisical_secret" "server" {
  for_each     = local.server_secret_names
  name         = each.key
  env_slug     = "prod"
  workspace_id = local.infisical_project_id
  folder_path  = "/server"
}

# One secret holding a .env file instead of one secret per value: Secret Manager
# bills past 6 active versions per billing account, 11 secrets would not be free.
# https://cloud.google.com/secret-manager/pricing
resource "google_secret_manager_secret" "server_env" {
  secret_id = "opendiagram-server-env"
  replication {
    auto {}
  }
}

# Single quotes are literal in Bun's dotenv parser; a value containing ' or a
# newline would break the file (none did on 2026-10-13).
resource "google_secret_manager_secret_version" "server_env" {
  secret = google_secret_manager_secret.server_env.id
  secret_data_wo = join("\n", [
    for name in sort(local.server_secret_names) :
    "${name}='${ephemeral.infisical_secret.server[name].value}'"
  ])
  secret_data_wo_version = local.server_env_version

  # The live revision mounts the old version until the new revision is ready.
  lifecycle {
    create_before_destroy = true
  }
}

resource "google_secret_manager_secret_iam_member" "server_runtime" {
  secret_id = google_secret_manager_secret.server_env.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:opendiagram-server@agasta.iam.gserviceaccount.com"
}
