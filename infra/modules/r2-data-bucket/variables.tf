variable "account_id" {
  type        = string
  description = "Cloudflare account that owns the bucket and the token."
}

variable "name" {
  type        = string
  description = "Bucket name. Also names the token."
}
