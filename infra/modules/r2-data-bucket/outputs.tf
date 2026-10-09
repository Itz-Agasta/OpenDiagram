output "bucket_name" {
  value = cloudflare_r2_bucket.this.name
}

output "endpoint" {
  value = "https://${var.account_id}.r2.cloudflarestorage.com"
}

output "access_key_id" {
  value = cloudflare_account_token.app.id
}

# R2 derives the S3 secret as the SHA-256 of the token value, not the value itself.
output "secret_access_key" {
  value     = sha256(cloudflare_account_token.app.value)
  sensitive = true
}
