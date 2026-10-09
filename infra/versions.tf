terraform {
  required_version = ">= 1.15"

  cloud {
    organization = "opendiagram"
    workspaces {
      name = "opendiagram-infra"
    }
  }

  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.27"
    }
  }
}

# Token comes from our HCP workspace.
provider "cloudflare" {}
