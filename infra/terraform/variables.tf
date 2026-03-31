variable "project_id" {
  description = "GCP project ID"
  type        = string
  default     = "contact-search-489223"
}

variable "region" {
  description = "GCP region"
  type        = string
  default     = "us-central1"
}

variable "environment" {
  description = "Deployment environment (development | staging | production)"
  type        = string
  default     = "development"
}

variable "db_tier" {
  description = "Cloud SQL instance tier"
  type        = string
  default     = "db-f1-micro" # upgrade to db-g1-small or higher for prod
}

variable "db_name" {
  description = "Postgres database name"
  type        = string
  default     = "auto_recruit"
}

variable "db_user" {
  description = "Postgres user"
  type        = string
  default     = "auto_recruit"
}

variable "db_password" {
  description = "Postgres password (sensitive)"
  type        = string
  sensitive   = true
}

variable "redis_memory_size_gb" {
  description = "Memorystore Redis memory size in GB"
  type        = number
  default     = 1
}

variable "api_image" {
  description = "Full image URI for the API Cloud Run service"
  type        = string
  default     = "us-central1-docker.pkg.dev/contact-search-489223/auto-recruit/api:latest"
}

variable "workers_image" {
  description = "Full image URI for the workers Cloud Run service"
  type        = string
  default     = "us-central1-docker.pkg.dev/contact-search-489223/auto-recruit/workers:latest"
}

variable "web_image" {
  description = "Full image URI for the web Cloud Run service"
  type        = string
  default     = "us-central1-docker.pkg.dev/contact-search-489223/auto-recruit/web:latest"
}

variable "firebase_project_id" {
  description = "Firebase project ID for JWT verification"
  type        = string
  default     = "contact-search-489223"
}

# ── Firebase web app config (build-time args for Next.js) ─────────────────────

variable "firebase_api_key" {
  description = "Firebase web API key (public, used at build time)"
  type        = string
  default     = ""
}

variable "firebase_app_id" {
  description = "Firebase web app ID (public, used at build time)"
  type        = string
  default     = ""
}

# ── Cloud Build ───────────────────────────────────────────────────────────────

variable "github_owner" {
  description = "GitHub repository owner (user or org)"
  type        = string
  default     = ""
}

variable "github_repo" {
  description = "GitHub repository name"
  type        = string
  default     = "auto-recruit"
}

# ── Monitoring ────────────────────────────────────────────────────────────────

variable "alert_email" {
  description = "Email address for monitoring alert notifications"
  type        = string
  default     = ""
}
