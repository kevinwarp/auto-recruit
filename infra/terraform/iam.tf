# ── Service Accounts ──────────────────────────────────────────────────────────

resource "google_service_account" "api" {
  project      = var.project_id
  account_id   = "auto-recruit-api"
  display_name = "Auto Recruit API Service Account"
}

resource "google_service_account" "workers" {
  project      = var.project_id
  account_id   = "auto-recruit-workers"
  display_name = "Auto Recruit Workers Service Account"
}

# ── API service account roles ─────────────────────────────────────────────────

resource "google_project_iam_member" "api_cloudsql" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.api.email}"
}

resource "google_project_iam_member" "api_pubsub_publisher" {
  project = var.project_id
  role    = "roles/pubsub.publisher"
  member  = "serviceAccount:${google_service_account.api.email}"
}

resource "google_project_iam_member" "api_storage" {
  project = var.project_id
  role    = "roles/storage.objectAdmin"
  member  = "serviceAccount:${google_service_account.api.email}"
}

resource "google_project_iam_member" "api_secret_accessor" {
  project = var.project_id
  role    = "roles/secretmanager.secretAccessor"
  member  = "serviceAccount:${google_service_account.api.email}"
}

# ── Workers service account roles ─────────────────────────────────────────────

resource "google_project_iam_member" "workers_cloudsql" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.workers.email}"
}

resource "google_project_iam_member" "workers_pubsub_subscriber" {
  project = var.project_id
  role    = "roles/pubsub.subscriber"
  member  = "serviceAccount:${google_service_account.workers.email}"
}

resource "google_project_iam_member" "workers_pubsub_publisher" {
  project = var.project_id
  role    = "roles/pubsub.publisher"
  member  = "serviceAccount:${google_service_account.workers.email}"
}

resource "google_project_iam_member" "workers_storage" {
  project = var.project_id
  role    = "roles/storage.objectAdmin"
  member  = "serviceAccount:${google_service_account.workers.email}"
}

resource "google_project_iam_member" "workers_secret_accessor" {
  project = var.project_id
  role    = "roles/secretmanager.secretAccessor"
  member  = "serviceAccount:${google_service_account.workers.email}"
}
