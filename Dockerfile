# ── SVCE Admission Database — Production Dockerfile ──────────────────────────
FROM node:20-alpine

# Install sharp native dependencies (needed for image processing)
RUN apk add --no-cache python3 make g++ vips-dev

WORKDIR /app

# Copy package files first (for Docker layer caching)
COPY package.json package-lock.json ./

# Install production dependencies
RUN npm ci --omit=dev

# Copy application source
COPY . .

# Create uploads directory
RUN mkdir -p /app/uploads/admissions

# Expose the app port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/test-db || exit 1

# Start the server
CMD ["node", "server.js"]
