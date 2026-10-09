module "data_prod" {
  source     = "./modules/r2-data-bucket"
  account_id = var.account_id
  name       = "opendiagram-data-prod"
}
