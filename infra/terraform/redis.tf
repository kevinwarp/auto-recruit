resource "google_redis_instance" "cache" {
  project            = var.project_id
  name               = "auto-recruit-cache"
  tier               = var.environment == "production" ? "STANDARD_HA" : "BASIC"
  memory_size_gb     = var.redis_memory_size_gb
  region             = var.region
  authorized_network = google_compute_network.vpc.id
  redis_version      = "REDIS_7_0"
  display_name       = "Auto Recruit Cache"
  depends_on         = [google_project_service.apis]

  redis_configs = {
    maxmemory-policy = "allkeys-lru"
  }
}

# Secret: REDIS_URL
resource "google_secret_manager_secret" "redis_url" {
  project   = var.project_id
  secret_id = "REDIS_URL"
  replication {
    auto {}
  }
  depends_on = [google_project_service.apis]
}

resource "google_secret_manager_secret_version" "redis_url" {
  secret      = google_secret_manager_secret.redis_url.id
  secret_data = "redis://${google_redis_instance.cache.host}:${google_redis_instance.cache.port}"
}
