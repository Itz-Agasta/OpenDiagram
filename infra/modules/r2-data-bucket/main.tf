resource "cloudflare_r2_bucket" "this" {
  account_id = var.account_id
  name       = var.name
  # Hint only, honoured the first time a bucket name is created.
  location = "enam"

  # Holds user diagrams. Fails `terraform destroy` and any plan that would
  # recreate the bucket. Deleting this block bypasses it; R2 then still refuses
  # while the bucket has objects (BucketNotEmpty). Not on the token: rotation
  # uses -replace.
  # https://developer.hashicorp.com/terraform/language/meta-arguments/lifecycle
  lifecycle {
    prevent_destroy = true
  }
}

# Origin "*" is safe: every request still needs a presigned signature scoped to
# one key, and an origin allowlist on the media bucket broke Vercel previews.
resource "cloudflare_r2_bucket_cors" "this" {
  account_id  = var.account_id
  bucket_name = cloudflare_r2_bucket.this.name
  rules = [{
    id = "presigned-browser"
    allowed = {
      methods = ["GET", "PUT", "HEAD"]
      origins = ["*"]
      headers = ["content-type"]
    }
    max_age_seconds = 3600
  }]
}

# Replaces R2's default 7 day multipart abort rule. Scene saves are single PUTs,
# so a multipart upload still open after a day is abandoned.
resource "cloudflare_r2_bucket_lifecycle" "this" {
  account_id  = var.account_id
  bucket_name = cloudflare_r2_bucket.this.name
  rules = [{
    id         = "abort-multipart-1d"
    enabled    = true
    conditions = { prefix = "" }
    abort_multipart_uploads_transition = {
      condition = { type = "Age", max_age = 86400 }
    }
  }]
}

# Filtered by scope because names repeat across scopes ("Logs Read" exists at
# several), so a name to id map over the unfiltered list has duplicate keys.
data "cloudflare_account_api_token_permission_groups_list" "bucket" {
  account_id = var.account_id
  scope      = "com.cloudflare.edge.r2.bucket"
}

locals {
  permission_ids = {
    for group in data.cloudflare_account_api_token_permission_groups_list.bucket.result :
    group.name => group.id
  }
}

# Account-owned, not a user token: a user token stops working when its creator
# leaves the account. Object read/write on this one bucket only.
# https://developers.cloudflare.com/r2/api/tokens/
resource "cloudflare_account_token" "app" {
  account_id = var.account_id
  name       = "${var.name}-app"
  policies = [{
    effect = "allow"
    permission_groups = [
      { id = local.permission_ids["Workers R2 Storage Bucket Item Read"] },
      { id = local.permission_ids["Workers R2 Storage Bucket Item Write"] },
    ]
    resources = jsonencode({
      "com.cloudflare.edge.r2.bucket.${var.account_id}_default_${cloudflare_r2_bucket.this.name}" = "*"
    })
  }]
}
