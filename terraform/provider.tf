# ================================================================
# CloudForge — Terraform Provider Configuration
# ================================================================
# Points the AWS provider at LocalStack (http://localhost:4566)
# so we can use real Terraform against simulated AWS services
# without ever touching actual AWS or entering a credit card.
# ================================================================

terraform {
  required_version = ">= 1.0.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

# AWS provider pointed at LocalStack
provider "aws" {
  region                      = var.aws_region
  access_key                  = "test"           # LocalStack accepts any value
  secret_key                  = "test"           # LocalStack accepts any value
  skip_credentials_validation = true
  skip_metadata_api_check     = true
  skip_requesting_account_id  = true

  endpoints {
    s3       = var.localstack_endpoint
    dynamodb = var.localstack_endpoint
    iam      = var.localstack_endpoint
    sts      = var.localstack_endpoint
  }
}
