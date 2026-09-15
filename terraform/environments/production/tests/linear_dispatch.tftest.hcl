mock_provider "cloudflare" {}
mock_provider "external" {
  mock_data "external" {
    defaults = {
      result = {
        hash = "test-source-hash"
      }
    }
  }
}
mock_provider "local" {}
mock_provider "null" {}
mock_provider "random" {}
mock_provider "vercel" {}

variables {
  cloudflare_api_token        = "test-cloudflare-token"
  cloudflare_account_id       = "test-account"
  cloudflare_worker_subdomain = "test-account"
  github_app_id               = "1"
  github_app_private_key      = "test-private-key"
  github_app_installation_id  = "1"
  anthropic_api_key           = "test-anthropic-key"
  token_encryption_key        = "test-token-key"
  repo_secrets_encryption_key = "test-repo-key"
  nextauth_secret             = "test-browser-auth-secret-with-32-characters"
  deployment_name             = "bot-default-model-test"

  modal_token_id     = "test-modal-token-id"
  modal_token_secret = "test-modal-token-secret"
  modal_workspace    = "test-workspace"
  modal_api_secret   = "test-modal-api-secret"

  web_platform = "cloudflare"
  project_root = "../../../"

  # All three bots are deployed so every DEFAULT_MODEL binding can be asserted.
  enable_github_bot     = true
  github_webhook_secret = "test-github-webhook-secret"
  github_bot_username   = "test-bot[bot]"

  enable_slack_bot     = true
  slack_bot_token      = "xoxb-test"
  slack_signing_secret = "test-signing-secret"

  enable_linear_bot     = true
  linear_client_id      = "test-linear-client-id"
  linear_client_secret  = "test-linear-client-secret"
  linear_webhook_secret = "test-linear-webhook-secret"
  linear_api_key        = "test-linear-api-key"

  github_client_id     = "github-id"
  github_client_secret = "github-secret"
  allowed_users        = "octocat"
}


run "default_task_mode" {
  command = plan
  assert {
    condition     = module.linear_bot_worker[0].plain_text_bindings["LINEAR_TASK_MODE"] == "implementation"
    error_message = "Existing coding launches must keep implementation mode."
  }
}
run "read_only_task_mode" {
  command = plan
  variables {
    linear_bot_task_mode           = "read-only"
    enable_linear_dispatch_binding = true
  }
  assert {
    condition     = module.linear_bot_worker[0].plain_text_bindings["LINEAR_TASK_MODE"] == "read-only"
    error_message = "The trusted task mode must reach the worker."
  }
}
run "invalid_task_mode" {
  command = plan
  variables { linear_bot_task_mode = "anything" }
  expect_failures = [var.linear_bot_task_mode]
}
