# ── API key secrets ───────────────────────────────────────────────────────────
# Values are set out-of-band (CI/CD or manually) — Terraform only creates the
# secret resource so services can reference it.  Use:
#   gcloud secrets versions add APOLLO_API_KEY --data-file=<(echo -n "value")

locals {
  app_secret_ids = [
    "APOLLO_API_KEY",
    "PDL_API_KEY",
    "FULL_ENRICH_API_KEY",
    "CONTACTOUT_API_KEY",
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    "FIREBASE_SERVICE_ACCOUNT_JSON",
  ]
}

resource "google_secret_manager_secret" "app_secrets" {
  for_each  = toset(local.app_secret_ids)
  project   = var.project_id
  secret_id = each.value
  replication {
    auto {}
  }
  depends_on = [google_project_service.apis]

  lifecycle {
    # Don't destroy secrets on re-apply — values are managed separately
    prevent_destroy = false
  }
}
