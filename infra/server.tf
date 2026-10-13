locals {
  server_env = {
    NODE_ENV         = "production"
    BETTER_AUTH_URL  = "https://apix4k9.opendiagram.ink"
    CORS_ORIGIN      = "https://opendiagram.ink"
    COOKIE_DOMAIN    = "opendiagram.ink"
    RESEND_FROM      = "OpenDiagram <hello@opendiagram.ink>"
    DODO_ENVIRONMENT = "live_mode"
    POSTHOG_HOST     = "https://us.i.posthog.com"
    S3_ENDPOINT      = module.data_prod.endpoint
    S3_BUCKET        = module.data_prod.bucket_name
  }
}

# The provider sends the whole service on every update (no updateMask), so a
# change made outside Terraform is reverted by the next apply: deploy only with
# `just deploy`. https://github.com/hashicorp/terraform-provider-google/issues/25464
resource "google_cloud_run_v2_service" "server" {
  name                 = "opendiagram-server"
  location             = "us-central1"
  ingress              = "INGRESS_TRAFFIC_ALL"
  invoker_iam_disabled = true
  deletion_protection  = true

  # 3 on purpose: burst/concurrency limiters live in process memory, so their real
  # limit is plan limit x instance count, and this cap is what keeps us under
  # Gemini's rate limits. Spend is bounded separately by the DB credit counter.
  scaling {
    max_instance_count = 3
  }

  template {
    service_account                  = "opendiagram-server@agasta.iam.gserviceaccount.com"
    timeout                          = "300s"
    max_instance_request_concurrency = 80

    scaling {
      min_instance_count = 0
      max_instance_count = 3
    }

    volumes {
      name = "server-env"
      secret {
        secret = google_secret_manager_secret.server_env.secret_id
        items {
          version = google_secret_manager_secret_version.server_env.version
          path    = "server.env"
        }
      }
    }

    containers {
      name  = "opendiagram-server-1"
      image = var.server_image
      # The Dockerfile CMD plus --env-file; keep the two in step.
      args = ["bun", "run", "--env-file", "/secrets/server.env", "--preload", "@sentry/node/preload", "dist/index.mjs"]

      ports {
        name           = "http1"
        container_port = 3000
      }

      resources {
        limits = {
          cpu    = "1000m"
          memory = "512Mi"
        }
        cpu_idle          = true
        startup_cpu_boost = true
      }

      volume_mounts {
        name       = "server-env"
        mount_path = "/secrets"
      }

      startup_probe {
        tcp_socket {
          port = 3000
        }
        period_seconds    = 240
        timeout_seconds   = 240
        failure_threshold = 1
      }

      # FIXME(upstream): success_threshold left at the default (1). The v2 API omits
      # readinessProbe.successThreshold on read, so any other value is a diff on
      # every plan. Set it again once the v2 GET returns it.
      # https://issuetracker.google.com/issues/573056668
      readiness_probe {
        http_get {
          path = "/health/ready"
          port = 3000
        }
        period_seconds    = 30
        timeout_seconds   = 8
        failure_threshold = 2
      }

      dynamic "env" {
        for_each = local.server_env
        content {
          name  = env.key
          value = env.value
        }
      }
    }
  }

  traffic {
    type    = "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST"
    percent = 100
  }

  depends_on = [google_secret_manager_secret_iam_member.server_runtime]

  lifecycle {
    prevent_destroy = true
  }
}
