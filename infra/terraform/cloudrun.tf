# ── Shared env helper ─────────────────────────────────────────────────────────

locals {
  # Secret reference helper: pulls latest version at deploy time
  secret_ref = {
    database_url            = google_secret_manager_secret.database_url.secret_id
    redis_url               = google_secret_manager_secret.redis_url.secret_id
    apollo_api_key          = google_secret_manager_secret.app_secrets["APOLLO_API_KEY"].secret_id
    pdl_api_key             = google_secret_manager_secret.app_secrets["PDL_API_KEY"].secret_id
    full_enrich_api_key     = google_secret_manager_secret.app_secrets["FULL_ENRICH_API_KEY"].secret_id
    contactout_api_key      = google_secret_manager_secret.app_secrets["CONTACTOUT_API_KEY"].secret_id
    google_client_id        = google_secret_manager_secret.app_secrets["GOOGLE_CLIENT_ID"].secret_id
    google_client_secret    = google_secret_manager_secret.app_secrets["GOOGLE_CLIENT_SECRET"].secret_id
    firebase_sa_json        = google_secret_manager_secret.app_secrets["FIREBASE_SERVICE_ACCOUNT_JSON"].secret_id
  }
}

# ── API service ───────────────────────────────────────────────────────────────

resource "google_cloud_run_v2_service" "api" {
  project  = var.project_id
  name     = "auto-recruit-api"
  location = var.region
  ingress  = "INGRESS_TRAFFIC_ALL"

  depends_on = [
    google_project_service.apis,
    google_artifact_registry_repository.images,
    google_sql_database_instance.main,
  ]

  template {
    service_account = google_service_account.api.email

    vpc_access {
      connector = google_vpc_access_connector.connector.id
      egress    = "PRIVATE_RANGES_ONLY"
    }

    scaling {
      min_instance_count = var.environment == "production" ? 1 : 0
      max_instance_count = 10
    }

    containers {
      image = var.api_image

      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
        cpu_idle = true
      }

      # Plain env vars
      env {
        name  = "NODE_ENV"
        value = var.environment == "production" ? "production" : "development"
      }
      env {
        name  = "GCP_PROJECT_ID"
        value = var.project_id
      }
      env {
        name  = "GCP_REGION"
        value = var.region
      }
      env {
        name  = "FIREBASE_PROJECT_ID"
        value = var.firebase_project_id
      }
      env {
        name  = "STORAGE_BUCKET"
        value = google_storage_bucket.exports.name
      }
      env {
        name  = "API_PORT"
        value = "8080"
      }

      # Secrets from Secret Manager
      env {
        name = "DATABASE_URL"
        value_source {
          secret_key_ref {
            secret  = local.secret_ref.database_url
            version = "latest"
          }
        }
      }
      env {
        name = "REDIS_URL"
        value_source {
          secret_key_ref {
            secret  = local.secret_ref.redis_url
            version = "latest"
          }
        }
      }
      env {
        name = "APOLLO_API_KEY"
        value_source {
          secret_key_ref {
            secret  = local.secret_ref.apollo_api_key
            version = "latest"
          }
        }
      }
      env {
        name = "PDL_API_KEY"
        value_source {
          secret_key_ref {
            secret  = local.secret_ref.pdl_api_key
            version = "latest"
          }
        }
      }
      env {
        name = "FULL_ENRICH_API_KEY"
        value_source {
          secret_key_ref {
            secret  = local.secret_ref.full_enrich_api_key
            version = "latest"
          }
        }
      }
      env {
        name = "GOOGLE_CLIENT_ID"
        value_source {
          secret_key_ref {
            secret  = local.secret_ref.google_client_id
            version = "latest"
          }
        }
      }
      env {
        name = "GOOGLE_CLIENT_SECRET"
        value_source {
          secret_key_ref {
            secret  = local.secret_ref.google_client_secret
            version = "latest"
          }
        }
      }
      env {
        name = "FIREBASE_SERVICE_ACCOUNT_JSON"
        value_source {
          secret_key_ref {
            secret  = local.secret_ref.firebase_sa_json
            version = "latest"
          }
        }
      }

      ports {
        container_port = 8080
      }

      liveness_probe {
        http_get {
          path = "/health"
        }
        initial_delay_seconds = 10
        period_seconds        = 30
        failure_threshold     = 3
      }

      startup_probe {
        http_get {
          path = "/ready"
        }
        initial_delay_seconds = 5
        period_seconds        = 5
        failure_threshold     = 10
      }
    }
  }

  lifecycle {
    ignore_changes = [template]
  }
}

# Allow unauthenticated traffic (Firebase JWT auth handled in app code)
resource "google_cloud_run_v2_service_iam_member" "api_public" {
  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_service.api.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

# ── Workers service ───────────────────────────────────────────────────────────

resource "google_cloud_run_v2_service" "workers" {
  project  = var.project_id
  name     = "auto-recruit-workers"
  location = var.region
  # Workers only accept traffic from Pub/Sub and Cloud Scheduler (internal)
  ingress = "INGRESS_TRAFFIC_INTERNAL_ONLY"

  depends_on = [
    google_project_service.apis,
    google_artifact_registry_repository.images,
    google_sql_database_instance.main,
  ]

  template {
    service_account = google_service_account.workers.email

    vpc_access {
      connector = google_vpc_access_connector.connector.id
      egress    = "PRIVATE_RANGES_ONLY"
    }

    scaling {
      min_instance_count = var.environment == "production" ? 1 : 0
      max_instance_count = 5
    }

    containers {
      image = var.workers_image

      resources {
        limits = {
          cpu    = "1"
          memory = "1Gi"
        }
        cpu_idle = false # workers do sustained processing
      }

      env {
        name  = "NODE_ENV"
        value = var.environment == "production" ? "production" : "development"
      }
      env {
        name  = "GCP_PROJECT_ID"
        value = var.project_id
      }
      env {
        name  = "GCP_REGION"
        value = var.region
      }
      env {
        name  = "FIREBASE_PROJECT_ID"
        value = var.firebase_project_id
      }
      env {
        name  = "STORAGE_BUCKET"
        value = google_storage_bucket.exports.name
      }
      env {
        name  = "WORKERS_PORT"
        value = "8081"
      }

      env {
        name = "DATABASE_URL"
        value_source {
          secret_key_ref {
            secret  = local.secret_ref.database_url
            version = "latest"
          }
        }
      }
      env {
        name = "REDIS_URL"
        value_source {
          secret_key_ref {
            secret  = local.secret_ref.redis_url
            version = "latest"
          }
        }
      }
      env {
        name = "APOLLO_API_KEY"
        value_source {
          secret_key_ref {
            secret  = local.secret_ref.apollo_api_key
            version = "latest"
          }
        }
      }
      env {
        name = "PDL_API_KEY"
        value_source {
          secret_key_ref {
            secret  = local.secret_ref.pdl_api_key
            version = "latest"
          }
        }
      }
      env {
        name = "FULL_ENRICH_API_KEY"
        value_source {
          secret_key_ref {
            secret  = local.secret_ref.full_enrich_api_key
            version = "latest"
          }
        }
      }
      env {
        name = "CONTACTOUT_API_KEY"
        value_source {
          secret_key_ref {
            secret  = local.secret_ref.contactout_api_key
            version = "latest"
          }
        }
      }
      env {
        name = "GOOGLE_CLIENT_ID"
        value_source {
          secret_key_ref {
            secret  = local.secret_ref.google_client_id
            version = "latest"
          }
        }
      }
      env {
        name = "GOOGLE_CLIENT_SECRET"
        value_source {
          secret_key_ref {
            secret  = local.secret_ref.google_client_secret
            version = "latest"
          }
        }
      }
      env {
        name = "FIREBASE_SERVICE_ACCOUNT_JSON"
        value_source {
          secret_key_ref {
            secret  = local.secret_ref.firebase_sa_json
            version = "latest"
          }
        }
      }

      ports {
        container_port = 8081
      }

      liveness_probe {
        http_get {
          path = "/health"
        }
        initial_delay_seconds = 10
        period_seconds        = 30
      }
    }
  }

  lifecycle {
    ignore_changes = [template]
  }
}

# Pub/Sub
resource "google_cloud_run_v2_service_iam_member" "workers_pubsub_invoker" {
  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_service.workers.name
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.workers.email}"
}

# ── Web (Next.js) service ─────────────────────────────────────────────────────

resource "google_cloud_run_v2_service" "web" {
  project  = var.project_id
  name     = "auto-recruit-web"
  location = var.region
  ingress  = "INGRESS_TRAFFIC_ALL"

  depends_on = [
    google_project_service.apis,
    google_artifact_registry_repository.images,
  ]

  template {
    scaling {
      min_instance_count = var.environment == "production" ? 1 : 0
      max_instance_count = 5
    }

    containers {
      image = var.web_image

      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
        cpu_idle = true
      }

      env {
        name  = "NODE_ENV"
        value = "production"
      }
      env {
        name  = "PORT"
        value = "3000"
      }
      env {
        name  = "NEXT_PUBLIC_API_URL"
        value = google_cloud_run_v2_service.api.uri
      }

      ports {
        container_port = 3000
      }
    }
  }

  lifecycle {
    ignore_changes = [template]
  }
}

resource "google_cloud_run_v2_service_iam_member" "web_public" {
  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_service.web.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}
