variable "account_id" {
  type        = string
  description = "Company Cloudflare account. Set on the HCP workspace."
}

variable "server_image" {
  type        = string
  description = "Full image ref for opendiagram-server. `just deploy` writes it to server.auto.tfvars."
}
