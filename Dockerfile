# ================================================================
# CloudForge — Multi-Stage Dockerfile
# ================================================================
# WHY MULTI-STAGE?
#   Stage 1 (build):  Install ALL deps (including devDependencies)
#   Stage 2 (prod):   Copy only production deps + source
#   Result:           ~80MB image instead of ~900MB
#
# SECURITY:
#   - Uses Alpine (minimal attack surface)
#   - Runs as non-root user "cloudforge"
#   - No secrets baked into the image
# ================================================================

# ---------- Stage 1: Build ----------
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files first (Docker cache optimization)
# If package.json hasn't changed, Docker reuses the cached npm install
COPY app/backend/package*.json ./

# Install ALL dependencies (including devDependencies for testing)
RUN npm ci --only=production

# ---------- Stage 2: Production ----------
FROM node:20-alpine AS production

# Security: create a non-root user
RUN addgroup -g 1001 -S cloudforge && \
    adduser -S cloudforge -u 1001 -G cloudforge

WORKDIR /app

# Copy production dependencies from builder stage
COPY --from=builder /app/node_modules ./node_modules

# Copy backend source
COPY app/backend/src ./src
COPY app/backend/package.json ./

# Copy frontend static files
COPY app/frontend ../frontend

# Create data directory for SQLite (writable by cloudforge user)
RUN mkdir -p /app/data && chown -R cloudforge:cloudforge /app/data

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000
ENV DB_PATH=/app/data/cloudforge.db

# Expose port
EXPOSE 3000

# Switch to non-root user
USER cloudforge

# Health check — Kubernetes also has its own, but this is for Docker
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

# Start the app
CMD ["node", "src/server.js"]
