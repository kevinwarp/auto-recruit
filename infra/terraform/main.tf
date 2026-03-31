terraform {
  required_version = ">= 1.5"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }

  # Uncomment after creating the GCS bucket for state:
  # backend "gcs" {
  #   bucket = "auto-recruit-tfstate"
  #   prefix = "terraform/state"
  # }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

locals {
  project_id = var.project_id
  region     = var.region
  env        = var.environment

  # Service accounts
  api_sa_email     = google_service_account.api.email
  workers_sa_email = google_service_account.workers.email
}
