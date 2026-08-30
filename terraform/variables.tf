# ================================================================
# CloudForge — Terraform Variables
# ================================================================

variable "aws_region" {
  description = "AWS region (used by LocalStack, can be anything)"
  type        = string
  default     = "us-east-1"
}

variable "localstack_endpoint" {
  description = "LocalStack API endpoint"
  type        = string
  default     = "http://localhost:4566"
}

variable "project_name" {
  description = "Project name used for resource naming"
  type        = string
  default     = "cloudforge"
}

variable "environment" {
  description = "Environment (dev, staging, production)"
  type        = string
  default     = "dev"
}
