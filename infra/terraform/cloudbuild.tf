# ── Cloud Build service account ───────────────────────────────────────────────

resource "google_project_iam_member" "cloudbuild_run_admin" {
  project = var.project_id
  role    = "roles/run.admin"
  member  = "serviceAccount:${data.google_project.project.number}@cloudbuild.gserviceaccount.com"

  depends_on = [google_project_service.apis]
}

resource "google_project_iam_member" "cloudbuild_sa_user" {
  project = var.project_id
  role    = "roles/iam.serviceAccountUser"
  member  = "serviceAccount:${data.google_project.project.number}@cloudbuild.gserviceaccount.com"

  depends_on = [google_project_service.apis]
}

resource "google_project_iam_member" "cloudbuild_artifact_writer" {
  project = var.project_id
  role    = "roles/artifactregistry.writer"
  member  = "serviceAccount:${data.google_project.project.number}@cloudbuild.gserviceaccount.com"

  depends_on = [google_project_service.apis]
}

resource "google_project_iam_member" "cloudbuild_secret_accessor" {
  project = var.project_id
  role    = "roles/secretmanager.secretAccessor"
  member  = "serviceAccount:${data.google_project.project.number}@cloudbuild.gserviceaccount.com"

  depends_on = [google_project_service.apis]
}

# ── Project data source (needed for Cloud Build SA number) ────────────────────

data "google_project" "project" {
  project_id = var.project_id
}

# ── Cloud Build triggers ──────────────────────────────────────────────────────

resource "google_cloudbuild_trigger" "api" {
  project     = var.project_id
  name        = "auto-recruit-api-deploy"
  description = "Build and deploy API on push to main"
  location    = var.region

  depends_on = [google_project_service.apis]

  github {
    owner = var.github_owner
    name  = var.github_repo

    push {
      branch = "^main$"
    }
  }

  included_files = [
    "apps/api/**",
    "packages/**",
    "pnpm-lock.yaml",
  ]

  build {
    step {
      name = "gcr.io/cloud-builders/docker"
      args = [
        "build",
        "-t", "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.images.repository_id}/api:$COMMIT_SHA",
        "-t", "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.images.repository_id}/api:latest",
        "-f", "apps/api/Dockerfile",
        ".",
      ]
    }

    step {
      name = "gcr.io/cloud-builders/docker"
      args = [
        "push",
        "--all-tags",
        "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.images.repository_id}/api",
      ]
    }

    step {
      name       = "gcr.io/google.com/cloudsdktool/cloud-sdk"
      entrypoint = "gcloud"
      args = [
        "run", "services", "update", "auto-recruit-api",
        "--region", var.region,
        "--image", "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.images.repository_id}/api:$COMMIT_SHA",
      ]
    }

    options {
      logging = "CLOUD_LOGGING_ONLY"
    }

    timeout = "1200s"
  }
}

resource "google_cloudbuild_trigger" "workers" {
  project     = var.project_id
  name        = "auto-recruit-workers-deploy"
  description = "Build and deploy workers on push to main"
  location    = var.region

  depends_on = [google_project_service.apis]

  github {
    owner = var.github_owner
    name  = var.github_repo

    push {
      branch = "^main$"
    }
  }

  included_files = [
    "apps/workers/**",
    "packages/**",
    "pnpm-lock.yaml",
  ]

  build {
    step {
      name = "gcr.io/cloud-builders/docker"
      args = [
        "build",
        "-t", "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.images.repository_id}/workers:$COMMIT_SHA",
        "-t", "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.images.repository_id}/workers:latest",
        "-f", "apps/workers/Dockerfile",
        ".",
      ]
    }

    step {
      name = "gcr.io/cloud-builders/docker"
      args = [
        "push",
        "--all-tags",
        "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.images.repository_id}/workers",
      ]
    }

    step {
      name       = "gcr.io/google.com/cloudsdktool/cloud-sdk"
      entrypoint = "gcloud"
      args = [
        "run", "services", "update", "auto-recruit-workers",
        "--region", var.region,
        "--image", "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.images.repository_id}/workers:$COMMIT_SHA",
      ]
    }

    options {
      logging = "CLOUD_LOGGING_ONLY"
    }

    timeout = "1200s"
  }
}

resource "google_cloudbuild_trigger" "web" {
  project     = var.project_id
  name        = "auto-recruit-web-deploy"
  description = "Build and deploy web frontend on push to main"
  location    = var.region

  depends_on = [google_project_service.apis]

  github {
    owner = var.github_owner
    name  = var.github_repo

    push {
      branch = "^main$"
    }
  }

  included_files = [
    "apps/web/**",
    "packages/**",
    "pnpm-lock.yaml",
  ]

  build {
    step {
      name = "gcr.io/cloud-builders/docker"
      args = [
        "build",
        "-t", "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.images.repository_id}/web:$COMMIT_SHA",
        "-t", "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.images.repository_id}/web:latest",
        "-f", "apps/web/Dockerfile",
        "--build-arg", "NEXT_PUBLIC_API_URL=${google_cloud_run_v2_service.api.uri}",
        "--build-arg", "NEXT_PUBLIC_FIREBASE_API_KEY=$_FIREBASE_API_KEY",
        "--build-arg", "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=${var.firebase_project_id}.firebaseapp.com",
        "--build-arg", "NEXT_PUBLIC_FIREBASE_PROJECT_ID=${var.firebase_project_id}",
        "--build-arg", "NEXT_PUBLIC_FIREBASE_APP_ID=$_FIREBASE_APP_ID",
        ".",
      ]
    }

    step {
      name = "gcr.io/cloud-builders/docker"
      args = [
        "push",
        "--all-tags",
        "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.images.repository_id}/web",
      ]
    }

    step {
      name       = "gcr.io/google.com/cloudsdktool/cloud-sdk"
      entrypoint = "gcloud"
      args = [
        "run", "services", "update", "auto-recruit-web",
        "--region", var.region,
        "--image", "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.images.repository_id}/web:$COMMIT_SHA",
      ]
    }

    options {
      logging = "CLOUD_LOGGING_ONLY"
    }

    timeout = "1200s"

    substitutions = {
      _FIREBASE_API_KEY = var.firebase_api_key
      _FIREBASE_APP_ID  = var.firebase_app_id
    }
  }
}

# ── DB migration trigger (runs on schema changes) ────────────────────────────

resource "google_cloudbuild_trigger" "db_migrate" {
  project     = var.project_id
  name        = "auto-recruit-db-migrate"
  description = "Run Prisma DB migrations on schema changes"
  location    = var.region

  depends_on = [google_project_service.apis]

  github {
    owner = var.github_owner
    name  = var.github_repo

    push {
      branch = "^main$"
    }
  }

  included_files = [
    "packages/db/prisma/**",
  ]

  build {
    step {
      name = "gcr.io/cloud-builders/docker"
      args = [
        "build",
        "-t", "migrate-runner",
        "-f", "apps/api/Dockerfile",
        "--target", "build",
        ".",
      ]
    }

    step {
      name       = "gcr.io/cloud-builders/docker"
      entrypoint = "docker"
      args = [
        "run",
        "--rm",
        "-e", "DATABASE_URL=$$DATABASE_URL",
        "migrate-runner",
        "pnpm", "--filter", "@auto-recruit/db", "exec", "prisma", "migrate", "deploy",
      ]
      secret_env = ["DATABASE_URL"]
    }

    available_secrets {
      secret_manager {
        env          = "DATABASE_URL"
        version_name = "${google_secret_manager_secret.database_url.id}/versions/latest"
      }
    }

    options {
      logging = "CLOUD_LOGGING_ONLY"
    }

    timeout = "300s"
  }
}
