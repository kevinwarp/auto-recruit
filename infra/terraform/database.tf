# ── VPC for private networking ────────────────────────────────────────────────

resource "google_compute_network" "vpc" {
  project                 = var.project_id
  name                    = "auto-recruit-vpc"
  auto_create_subnetworks = false
  depends_on              = [google_project_service.apis]
}

resource "google_compute_subnetwork" "subnet" {
  project       = var.project_id
  name          = "auto-recruit-subnet"
  ip_cidr_range = "10.8.0.0/24"
  region        = var.region
  network       = google_compute_network.vpc.id
}

# VPC Access Connector — lets Cloud Run reach private IP resources
resource "google_vpc_access_connector" "connector" {
  project       = var.project_id
  name          = "auto-recruit-connector"
  region        = var.region
  ip_cidr_range = "10.8.1.0/28"
  network       = google_compute_network.vpc.name
  depends_on    = [google_project_service.apis]
}

# Private services access (for Cloud SQL private IP)
resource "google_compute_global_address" "private_ip_range" {
  project       = var.project_id
  name          = "auto-recruit-sql-ip-range"
  purpose       = "VPC_PEERING"
  address_type  = "INTERNAL"
  prefix_length = 16
  network       = google_compute_network.vpc.id
}

resource "google_service_networking_connection" "private_vpc_connection" {
  network                 = google_compute_network.vpc.id
  service                 = "servicenetworking.googleapis.com"
  reserved_peering_ranges = [google_compute_global_address.private_ip_range.name]
  depends_on              = [google_project_service.apis]
}

# ── Cloud SQL (Postgres 15) ───────────────────────────────────────────────────

resource "google_sql_database_instance" "main" {
  project          = var.project_id
  name             = "auto-recruit-pg-${var.environment}"
  database_version = "POSTGRES_15"
  region           = var.region

  settings {
    tier              = var.db_tier
    availability_type = var.environment == "production" ? "REGIONAL" : "ZONAL"
    disk_autoresize   = true
    disk_size         = 20
    disk_type         = "PD_SSD"

    ip_configuration {
      ipv4_enabled    = false
      private_network = google_compute_network.vpc.id
    }

    backup_configuration {
      enabled                        = true
      point_in_time_recovery_enabled = var.environment == "production"
      start_time                     = "02:00"
      backup_retention_settings {
        retained_backups = 7
      }
    }

    database_flags {
      name  = "max_connections"
      value = "100"
    }
  }

  deletion_protection = var.environment == "production"
  depends_on          = [google_service_networking_connection.private_vpc_connection]
}

resource "google_sql_database" "db" {
  project  = var.project_id
  instance = google_sql_database_instance.main.name
  name     = var.db_name
}

resource "google_sql_user" "user" {
  project  = var.project_id
  instance = google_sql_database_instance.main.name
  name     = var.db_user
  password = var.db_password
}

# ── Secret: DATABASE_URL ──────────────────────────────────────────────────────

resource "google_secret_manager_secret" "database_url" {
  project   = var.project_id
  secret_id = "DATABASE_URL"
  replication {
    auto {}
  }
  depends_on = [google_project_service.apis]
}

resource "google_secret_manager_secret_version" "database_url" {
  secret      = google_secret_manager_secret.database_url.id
  secret_data = "postgresql://${var.db_user}:${var.db_password}@${google_sql_database_instance.main.private_ip_address}:5432/${var.db_name}"
}
