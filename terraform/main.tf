# ================================================================
# CloudForge — Infrastructure Resources (via LocalStack)
# ================================================================
# These resources simulate real AWS infrastructure locally:
#   1. S3 Bucket — stores build artifacts and deployment logs
#   2. DynamoDB Table — tracks deployment state and history
#   3. IAM Role — service identity for the application
#
# In a real production setup, you'd point the provider at actual
# AWS endpoints. The Terraform code stays exactly the same.
# ================================================================

# ---------- S3 Bucket: Build Artifacts & Logs ----------
resource "aws_s3_bucket" "artifacts" {
  bucket = "${var.project_name}-artifacts-${var.environment}"

  tags = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

# Enable versioning on the artifacts bucket
resource "aws_s3_bucket_versioning" "artifacts_versioning" {
  bucket = aws_s3_bucket.artifacts.id

  versioning_configuration {
    status = "Enabled"
  }
}

# Block all public access to the bucket
resource "aws_s3_bucket_public_access_block" "artifacts_access" {
  bucket = aws_s3_bucket.artifacts.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# ---------- DynamoDB Table: Deployment State ----------
resource "aws_dynamodb_table" "deployment_state" {
  name         = "${var.project_name}-deployments-${var.environment}"
  billing_mode = "PAY_PER_REQUEST" # No capacity planning needed
  hash_key     = "deployment_id"
  range_key    = "timestamp"

  attribute {
    name = "deployment_id"
    type = "S"
  }

  attribute {
    name = "timestamp"
    type = "S"
  }

  attribute {
    name = "environment"
    type = "S"
  }

  # GSI: query deployments by environment
  global_secondary_index {
    name            = "environment-index"
    hash_key        = "environment"
    range_key       = "timestamp"
    projection_type = "ALL"
  }

  tags = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

# ---------- IAM Role: Application Service Identity ----------
resource "aws_iam_role" "app_role" {
  name = "${var.project_name}-app-role-${var.environment}"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ec2.amazonaws.com"
        }
      }
    ]
  })

  tags = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

# IAM Policy: Allow app to read/write to S3 and DynamoDB
resource "aws_iam_role_policy" "app_policy" {
  name = "${var.project_name}-app-policy-${var.environment}"
  role = aws_iam_role.app_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:ListBucket"
        ]
        Resource = [
          aws_s3_bucket.artifacts.arn,
          "${aws_s3_bucket.artifacts.arn}/*"
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:Query",
          "dynamodb:UpdateItem"
        ]
        Resource = [
          aws_dynamodb_table.deployment_state.arn,
          "${aws_dynamodb_table.deployment_state.arn}/index/*"
        ]
      }
    ]
  })
}
