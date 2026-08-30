# ================================================================
# CloudForge — Terraform Outputs
# ================================================================
# After `terraform apply`, these values are printed to the console.
# They confirm what resources were created.
# ================================================================

output "s3_bucket_name" {
  description = "Name of the S3 bucket for build artifacts"
  value       = aws_s3_bucket.artifacts.id
}

output "s3_bucket_arn" {
  description = "ARN of the S3 bucket"
  value       = aws_s3_bucket.artifacts.arn
}

output "dynamodb_table_name" {
  description = "Name of the DynamoDB deployment state table"
  value       = aws_dynamodb_table.deployment_state.name
}

output "dynamodb_table_arn" {
  description = "ARN of the DynamoDB table"
  value       = aws_dynamodb_table.deployment_state.arn
}

output "iam_role_name" {
  description = "Name of the IAM role for the application"
  value       = aws_iam_role.app_role.name
}

output "iam_role_arn" {
  description = "ARN of the IAM role"
  value       = aws_iam_role.app_role.arn
}
