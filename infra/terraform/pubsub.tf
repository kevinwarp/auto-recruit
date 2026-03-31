locals {
  pubsub_topics = [
    "candidate-search",
    "candidate-enrichment",
    "candidate-directory-refresh",
    "csv-export",
    "outreach-send",
  ]
}

resource "google_pubsub_topic" "topics" {
  for_each   = toset(local.pubsub_topics)
  project    = var.project_id
  name       = each.value
  depends_on = [google_project_service.apis]

  message_retention_duration = "604800s" # 7 days
}

# Dead-letter topic
resource "google_pubsub_topic" "dead_letter" {
  project    = var.project_id
  name       = "dead-letter"
  depends_on = [google_project_service.apis]
}

# ── Push subscriptions → workers Cloud Run ────────────────────────────────────
# We use push subscriptions so the workers service is HTTP-triggered.
# The workers URL is known after Cloud Run is deployed; set it via terraform.tfvars.

variable "workers_url" {
  description = "HTTPS URL of the workers Cloud Run service (set after first deploy)"
  type        = string
  default     = ""
}

resource "google_pubsub_subscription" "candidate_search" {
  project = var.project_id
  name    = "candidate-search-sub"
  topic   = google_pubsub_topic.topics["candidate-search"].name

  push_config {
    push_endpoint = "${var.workers_url}/pubsub/push"
    oidc_token {
      service_account_email = google_service_account.workers.email
    }
  }

  ack_deadline_seconds       = 300
  message_retention_duration = "604800s"

  dead_letter_policy {
    dead_letter_topic     = google_pubsub_topic.dead_letter.id
    max_delivery_attempts = 5
  }

  retry_policy {
    minimum_backoff = "10s"
    maximum_backoff = "300s"
  }
}

resource "google_pubsub_subscription" "candidate_enrichment" {
  project = var.project_id
  name    = "candidate-enrichment-sub"
  topic   = google_pubsub_topic.topics["candidate-enrichment"].name

  push_config {
    push_endpoint = "${var.workers_url}/pubsub/push"
    oidc_token {
      service_account_email = google_service_account.workers.email
    }
  }

  ack_deadline_seconds       = 300
  message_retention_duration = "604800s"

  dead_letter_policy {
    dead_letter_topic     = google_pubsub_topic.dead_letter.id
    max_delivery_attempts = 5
  }
}

resource "google_pubsub_subscription" "candidate_directory_refresh" {
  project = var.project_id
  name    = "candidate-directory-refresh-sub"
  topic   = google_pubsub_topic.topics["candidate-directory-refresh"].name

  push_config {
    push_endpoint = "${var.workers_url}/pubsub/push"
    oidc_token {
      service_account_email = google_service_account.workers.email
    }
  }

  ack_deadline_seconds = 60
}

resource "google_pubsub_subscription" "csv_export" {
  project = var.project_id
  name    = "csv-export-sub"
  topic   = google_pubsub_topic.topics["csv-export"].name

  push_config {
    push_endpoint = "${var.workers_url}/pubsub/push"
    oidc_token {
      service_account_email = google_service_account.workers.email
    }
  }

  ack_deadline_seconds = 120
}

resource "google_pubsub_subscription" "outreach_send" {
  project = var.project_id
  name    = "outreach-send-sub"
  topic   = google_pubsub_topic.topics["outreach-send"].name

  push_config {
    push_endpoint = "${var.workers_url}/pubsub/push"
    oidc_token {
      service_account_email = google_service_account.workers.email
    }
  }

  ack_deadline_seconds = 120
}
