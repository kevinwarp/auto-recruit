resource "google_storage_bucket" "exports" {
  project                     = var.project_id
  name                        = "${var.project_id}-exports"
  location                    = var.region
  uniform_bucket_level_access = true
  force_destroy               = var.environment != "production"
  depends_on                  = [google_project_service.apis]

  lifecycle_rule {
    condition {
      age = 7 # delete export files after 7 days
    }
    action {
      type = "Delete"
    }
  }

  cors {
    origin          = ["*"]
    method          = ["GET", "HEAD"]
    response_header = ["Content-Type", "Content-Disposition"]
    max_age_seconds = 3600
  }
}

# Signed URL generation requires the SA to have this on itself
resource "google_service_account_iam_member" "api_token_creator" {
  service_account_id = google_service_account.api.name
  role               = "roles/iam.serviceAccountTokenCreator"
  member             = "serviceAccount:${google_service_account.api.email}"
}

resource "google_service_account_iam_member" "workers_token_creator" {
  service_account_id = google_service_account.workers.name
  role               = "roles/iam.serviceAccountTokenCreator"
  member             = "serviceAccount:${google_service_account.workers.email}"
}
