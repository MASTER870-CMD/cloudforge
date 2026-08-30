# ================================================================
# CloudForge — Local Deploy Script (PowerShell)
# ================================================================
# Deploys CloudForge to local Minikube cluster.
#
# USAGE:
#   .\scripts\deploy-local.ps1
#
# PREREQUISITES:
#   - Minikube running: minikube start
#   - Docker image built: docker build -t cloudforge:latest .
# ================================================================

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "=============================" -ForegroundColor Cyan
Write-Host "  CloudForge Local Deploy" -ForegroundColor Cyan
Write-Host "=============================" -ForegroundColor Cyan
Write-Host ""

# Check if minikube is running
Write-Host "[1/5] Checking Minikube status..." -ForegroundColor Yellow
$minikubeStatus = minikube status --format '{{.Host}}' 2>&1
if ($minikubeStatus -ne "Running") {
    Write-Host "Minikube is not running. Starting it..." -ForegroundColor Yellow
    minikube start --driver=docker
}
Write-Host "  Minikube is running." -ForegroundColor Green

# Load Docker image into Minikube
Write-Host "[2/5] Loading Docker image into Minikube..." -ForegroundColor Yellow
minikube image load cloudforge:latest
Write-Host "  Image loaded." -ForegroundColor Green

# Apply Kubernetes manifests
Write-Host "[3/5] Applying Kubernetes manifests..." -ForegroundColor Yellow
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/service.yaml
kubectl apply -f k8s/hpa.yaml
Write-Host "  Manifests applied." -ForegroundColor Green

# Wait for rollout
Write-Host "[4/5] Waiting for deployment rollout..." -ForegroundColor Yellow
kubectl rollout status deployment/cloudforge -n cloudforge --timeout=120s
Write-Host "  Deployment complete." -ForegroundColor Green

# Get access URL
Write-Host "[5/5] Getting access URL..." -ForegroundColor Yellow
$url = minikube service cloudforge -n cloudforge --url 2>&1
Write-Host ""
Write-Host "=============================" -ForegroundColor Green
Write-Host "  Deployment Successful!" -ForegroundColor Green
Write-Host "  URL: $url" -ForegroundColor Green
Write-Host "=============================" -ForegroundColor Green
Write-Host ""

# Show pod status
Write-Host "Pod Status:" -ForegroundColor Cyan
kubectl get pods -n cloudforge -o wide
Write-Host ""
