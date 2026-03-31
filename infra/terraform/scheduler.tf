resource "google_cloud_scheduler_job" "poll_responses" {
  project     = var.project_id
  name        = "poll-responses"
  description = "Trigger Gmail response + bounce polling every 10 minutes"
  schedule    = "*/10 * * * *"
  time_zone   = "UTC"
  region      = var.region
  depends_on  = [google_project_service.apis]

  http_target {
    uri         = "${google_cloud_run_v2_service.workers.uri}/jobs/poll-responses"
    http_method = "POST"
    body        = base64encode("{}")
    headers = {
      "Content-Type" = "application/json"
    }

    oidc_token {
      service_account_email = google_service_account.workers.email
      audience              = google_cloud_run_v2_service.workers.uri
    }
  }

  retry_config {
    retry_count          = 3
    max_retry_duration   = "120s"
    min_backoff_duration = "5s"
    max_backoff_duration = "60s"
    max_doublings        = 3
  }
}
