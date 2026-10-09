output "prod_bucket" {
  value = module.data_prod.bucket_name
}

output "prod_endpoint" {
  value = module.data_prod.endpoint
}

output "prod_access_key_id" {
  value = module.data_prod.access_key_id
}

output "prod_secret_access_key" {
  value     = module.data_prod.secret_access_key
  sensitive = true
}
