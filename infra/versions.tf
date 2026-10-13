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
    google = {
      source  = "hashicorp/google"
      version = "~> 8.6"
    }
    infisical = {
      source  = "infisical/infisical"
      version = "~> 0.20"
    }
  }
}

# Token comes from our HCP workspace.
provider "cloudflare" {}

# HCP dynamic credentials (TFC_GCP_* workspace env vars), no key file.
# https://developer.hashicorp.com/terraform/cloud-docs/dynamic-provider-credentials/gcp-configuration
provider "google" {
  project = "agasta"
  region  = "us-central1"
}

# Universal auth from the INFISICAL_* workspace env vars.
provider "infisical" {}
