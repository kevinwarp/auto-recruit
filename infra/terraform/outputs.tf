output "api_url" {
  description = "Cloud Run URL for the API service"
  value       = google_cloud_run_v2_service.api.uri
}

output "workers_url" {
  description = "Cloud Run URL for the workers service"
  value       = google_cloud_run_v2_service.workers.uri
}

output "web_url" {
  description = "Cloud Run URL for the web (Next.js) service"
  value       = google_cloud_run_v2_service.web.uri
}

output "db_connection_name" {
  description = "Cloud SQL connection name (for Cloud SQL Auth Proxy)"
  value       = google_sql_database_instance.main.connection_name
}

output "db_private_ip" {
  description = "Cloud SQL private IP (reachable via VPC)"
  value       = google_sql_database_instance.main.private_ip_address
  sensitive   = true
}

output "redis_host" {
  description = "Memorystore Redis host"
  value       = google_redis_instance.cache.host
  sensitive   = true
}

output "image_registry" {
  description = "Artifact Registry path — use as image prefix when pushing"
  value       = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.images.repository_id}"
}

output "export_bucket" {
  description = "Cloud Storage bucket name for CSV exports"
  value       = google_storage_bucket.exports.name
}

output "api_service_account" {
  description = "Email of the API Cloud Run service account"
  value       = google_service_account.api.email
}

output "workers_service_account" {
  description = "Email of the workers Cloud Run service account"
  value       = google_service_account.workers.email
}

output "cloudbuild_trigger_api" {
  description = "Cloud Build trigger ID for API service"
  value       = google_cloudbuild_trigger.api.trigger_id
}

output "cloudbuild_trigger_workers" {
  description = "Cloud Build trigger ID for workers service"
  value       = google_cloudbuild_trigger.workers.trigger_id
}

output "cloudbuild_trigger_web" {
  description = "Cloud Build trigger ID for web service"
  value       = google_cloudbuild_trigger.web.trigger_id
}
