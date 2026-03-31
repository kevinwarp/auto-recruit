resource "google_artifact_registry_repository" "images" {
  project       = var.project_id
  location      = var.region
  repository_id = "auto-recruit"
  description   = "Docker images for Auto Recruit services"
  format        = "DOCKER"
  depends_on    = [google_project_service.apis]
}

# Allow Cloud Run service accounts to pull images
resource "google_artifact_registry_repository_iam_member" "api_reader" {
  project    = var.project_id
  location   = var.region
  repository = google_artifact_registry_repository.images.name
  role       = "roles/artifactregistry.reader"
  member     = "serviceAccount:${google_service_account.api.email}"
}

resource "google_artifact_registry_repository_iam_member" "workers_reader" {
  project    = var.project_id
  location   = var.region
  repository = google_artifact_registry_repository.images.name
  role       = "roles/artifactregistry.reader"
  member     = "serviceAccount:${google_service_account.workers.email}"
}
