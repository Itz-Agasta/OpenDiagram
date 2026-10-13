locals {
  infisical_project_id = "bc7e2422-3367-414c-a029-435f38f54b00"

  # Read from Infisical prod /server. some are not secret (browsers see them)
  # but stay out; so forks cannot send events or traffic to our accounts.
  server_secret_names = toset([
    "BETTER_AUTH_SECRET",
    "BYOK_ENCRYPTION_KEY",
    "DATABASE_URL",
    "DODO_PAYMENTS_API_KEY",
    "DODO_PRO_PRODUCT_ID",
    "DODO_WEBHOOK_SECRET",
    "GITHUB_CLIENT_ID",
    "GITHUB_CLIENT_SECRET",
    "GOOGLE_GENERATIVE_AI_API_KEY",
    "POSTHOG_PROJECT_TOKEN",
    "RESEND_API_KEY",
    "S3_ACCESS_KEY_ID",
    "S3_SECRET_ACCESS_KEY",
    "SENTRY_DSN",
  ])

  # secret_data_wo is never stored, so Terraform cannot see a changed value on
  # its own. This number changes whenever any Infisical version or the name list
  # does, which makes the next apply write a new version and roll a revision.
  server_env_version = parseint(substr(sha256(join(",", [
    for name in sort(local.server_secret_names) :
    "${name}:${data.infisical_secret_metadata.server[name].secret_version}"
  ])), 0, 12), 16)
}

# Versions only, never values: a plain data source is safe in state.
data "infisical_secret_metadata" "server" {
  for_each         = local.server_secret_names
  name             = each.key
  environment_slug = "prod"
  project_id       = local.infisical_project_id
  folder_path      = "/server"
}

# Ephemeral + secret_data_wo keeps every value out of state; Cloud Run env values
# have no write-only form.
ephemeral "infisical_secret" "server" {
  for_each     = local.server_secret_names
  name         = each.key
  env_slug     = "prod"
  workspace_id = local.infisical_project_id
  folder_path  = "/server"

  lifecycle {
    postcondition {
      condition     = !strcontains(self.value, "'") && !strcontains(self.value, "\n")
      error_message = "${each.key} contains ' or a newline, which the single-quoted .env below cannot hold."
    }
  }
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

# Single quotes are literal in Bun's dotenv parser; the postcondition above
# rejects the two characters that would break the file.
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
