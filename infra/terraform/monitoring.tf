# ── Notification channel ──────────────────────────────────────────────────────
# Create an email notification channel. Replace with PagerDuty/Slack as needed.

resource "google_monitoring_notification_channel" "email" {
  project      = var.project_id
  display_name = "Auto Recruit Alerts"
  type         = "email"

  labels = {
    email_address = var.alert_email
  }

  depends_on = [google_project_service.apis]
}

# ── Uptime checks ─────────────────────────────────────────────────────────────

resource "google_monitoring_uptime_check_config" "api_health" {
  project      = var.project_id
  display_name = "API Health Check"
  timeout      = "10s"
  period       = "60s"

  http_check {
    path         = "/health"
    port         = 443
    use_ssl      = true
    validate_ssl = true
  }

  monitored_resource {
    type = "uptime_url"
    labels = {
      project_id = var.project_id
      host       = replace(google_cloud_run_v2_service.api.uri, "https://", "")
    }
  }

  depends_on = [google_project_service.apis]
}

resource "google_monitoring_uptime_check_config" "web_health" {
  project      = var.project_id
  display_name = "Web App Health Check"
  timeout      = "10s"
  period       = "60s"

  http_check {
    path         = "/"
    port         = 443
    use_ssl      = true
    validate_ssl = true
  }

  monitored_resource {
    type = "uptime_url"
    labels = {
      project_id = var.project_id
      host       = replace(google_cloud_run_v2_service.web.uri, "https://", "")
    }
  }

  depends_on = [google_project_service.apis]
}

# ── Alert policies ────────────────────────────────────────────────────────────

# Alert when uptime check fails for > 2 consecutive periods
resource "google_monitoring_alert_policy" "uptime_api" {
  project      = var.project_id
  display_name = "API Uptime Failure"
  combiner     = "OR"

  conditions {
    display_name = "API health check failing"

    condition_threshold {
      filter          = "resource.type = \"uptime_url\" AND metric.type = \"monitoring.googleapis.com/uptime_check/check_passed\" AND metric.labels.check_id = \"${google_monitoring_uptime_check_config.api_health.uptime_check_id}\""
      comparison      = "COMPARISON_LT"
      threshold_value = 1
      duration        = "120s"

      aggregations {
        alignment_period   = "60s"
        per_series_aligner = "ALIGN_NEXT_OLDER"
      }

      trigger {
        count = 1
      }
    }
  }

  notification_channels = [google_monitoring_notification_channel.email.id]

  alert_strategy {
    auto_close = "1800s"
  }

  depends_on = [google_project_service.apis]
}

resource "google_monitoring_alert_policy" "uptime_web" {
  project      = var.project_id
  display_name = "Web App Uptime Failure"
  combiner     = "OR"

  conditions {
    display_name = "Web health check failing"

    condition_threshold {
      filter          = "resource.type = \"uptime_url\" AND metric.type = \"monitoring.googleapis.com/uptime_check/check_passed\" AND metric.labels.check_id = \"${google_monitoring_uptime_check_config.web_health.uptime_check_id}\""
      comparison      = "COMPARISON_LT"
      threshold_value = 1
      duration        = "120s"

      aggregations {
        alignment_period   = "60s"
        per_series_aligner = "ALIGN_NEXT_OLDER"
      }

      trigger {
        count = 1
      }
    }
  }

  notification_channels = [google_monitoring_notification_channel.email.id]

  alert_strategy {
    auto_close = "1800s"
  }

  depends_on = [google_project_service.apis]
}

# Cloud Run 5xx error rate > 5% for 5 minutes
resource "google_monitoring_alert_policy" "api_error_rate" {
  project      = var.project_id
  display_name = "API High Error Rate (5xx)"
  combiner     = "OR"

  conditions {
    display_name = "Cloud Run 5xx rate > 5%"

    condition_threshold {
      filter          = "resource.type = \"cloud_run_revision\" AND resource.labels.service_name = \"auto-recruit-api\" AND metric.type = \"run.googleapis.com/request_count\" AND metric.labels.response_code_class = \"5xx\""
      comparison      = "COMPARISON_GT"
      threshold_value = 5
      duration        = "300s"

      aggregations {
        alignment_period     = "60s"
        per_series_aligner   = "ALIGN_RATE"
        cross_series_reducer = "REDUCE_SUM"
      }

      trigger {
        count = 1
      }
    }
  }

  notification_channels = [google_monitoring_notification_channel.email.id]

  alert_strategy {
    auto_close = "1800s"
  }

  depends_on = [google_project_service.apis]
}

# Cloud Run request latency p99 > 5s for 5 minutes
resource "google_monitoring_alert_policy" "api_latency" {
  project      = var.project_id
  display_name = "API High Latency (p99 > 5s)"
  combiner     = "OR"

  conditions {
    display_name = "Cloud Run p99 latency > 5s"

    condition_threshold {
      filter          = "resource.type = \"cloud_run_revision\" AND resource.labels.service_name = \"auto-recruit-api\" AND metric.type = \"run.googleapis.com/request_latencies\""
      comparison      = "COMPARISON_GT"
      threshold_value = 5000
      duration        = "300s"

      aggregations {
        alignment_period     = "60s"
        per_series_aligner   = "ALIGN_PERCENTILE_99"
        cross_series_reducer = "REDUCE_MAX"
      }

      trigger {
        count = 1
      }
    }
  }

  notification_channels = [google_monitoring_notification_channel.email.id]

  alert_strategy {
    auto_close = "1800s"
  }

  depends_on = [google_project_service.apis]
}

# Cloud SQL high CPU > 80% for 10 minutes
resource "google_monitoring_alert_policy" "db_cpu" {
  project      = var.project_id
  display_name = "Cloud SQL High CPU (>80%)"
  combiner     = "OR"

  conditions {
    display_name = "Database CPU utilization > 80%"

    condition_threshold {
      filter          = "resource.type = \"cloudsql_database\" AND metric.type = \"cloudsql.googleapis.com/database/cpu/utilization\""
      comparison      = "COMPARISON_GT"
      threshold_value = 0.8
      duration        = "600s"

      aggregations {
        alignment_period   = "60s"
        per_series_aligner = "ALIGN_MEAN"
      }

      trigger {
        count = 1
      }
    }
  }

  notification_channels = [google_monitoring_notification_channel.email.id]

  alert_strategy {
    auto_close = "1800s"
  }

  depends_on = [google_project_service.apis]
}

# Redis memory usage > 80%
resource "google_monitoring_alert_policy" "redis_memory" {
  project      = var.project_id
  display_name = "Redis High Memory Usage (>80%)"
  combiner     = "OR"

  conditions {
    display_name = "Redis memory usage > 80%"

    condition_threshold {
      filter          = "resource.type = \"redis_instance\" AND metric.type = \"redis.googleapis.com/stats/memory/usage_ratio\""
      comparison      = "COMPARISON_GT"
      threshold_value = 0.8
      duration        = "300s"

      aggregations {
        alignment_period   = "60s"
        per_series_aligner = "ALIGN_MEAN"
      }

      trigger {
        count = 1
      }
    }
  }

  notification_channels = [google_monitoring_notification_channel.email.id]

  alert_strategy {
    auto_close = "1800s"
  }

  depends_on = [google_project_service.apis]
}

# Pub/Sub dead-letter messages appearing
resource "google_monitoring_alert_policy" "dead_letter" {
  project      = var.project_id
  display_name = "Pub/Sub Dead Letter Messages"
  combiner     = "OR"

  conditions {
    display_name = "Messages landing in dead-letter topic"

    condition_threshold {
      filter          = "resource.type = \"pubsub_topic\" AND resource.labels.topic_id = \"dead-letter\" AND metric.type = \"pubsub.googleapis.com/topic/send_message_operation_count\""
      comparison      = "COMPARISON_GT"
      threshold_value = 0
      duration        = "0s"

      aggregations {
        alignment_period     = "60s"
        per_series_aligner   = "ALIGN_RATE"
        cross_series_reducer = "REDUCE_SUM"
      }

      trigger {
        count = 1
      }
    }
  }

  notification_channels = [google_monitoring_notification_channel.email.id]

  alert_strategy {
    auto_close = "1800s"
  }

  depends_on = [google_project_service.apis]
}
