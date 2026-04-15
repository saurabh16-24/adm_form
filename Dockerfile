FROM node:20-bookworm-slim

# Install dependencies needed for native modules (sharp)
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ libvips-dev && rm -rf /var/lib/apt/lists/*

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
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/next-token || exit 1

# Start the server
CMD ["node", "server.js"]
