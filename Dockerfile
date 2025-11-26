# Multi-stage build for optimal image size
FROM node:20-alpine AS builder

# Set working directory
WORKDIR /app

# Accept build arguments for Vite environment variables
# Render needs to pass this as a build argument
ARG VITE_GCS_API_URL
ENV VITE_GCS_API_URL=${VITE_GCS_API_URL}

# Copy package files
COPY package.json yarn.lock ./

# Install dependencies
RUN yarn install --frozen-lockfile

# Copy source code
COPY . .

# Create .env.production file for Vite if VITE_GCS_API_URL is provided
# Vite automatically loads .env.production during build
RUN if [ -n "$VITE_GCS_API_URL" ]; then \
      echo "VITE_GCS_API_URL=$VITE_GCS_API_URL" > .env.production && \
      echo "Created .env.production with VITE_GCS_API_URL=$VITE_GCS_API_URL"; \
    else \
      echo "Warning: VITE_GCS_API_URL not set - frontend may use default localhost URL"; \
    fi

# Build the client (Vite will use VITE_GCS_API_URL from .env.production or env var)
RUN yarn build

# Production stage
FROM node:20-alpine AS production

# Install git (required by some npm packages)
RUN apk add --no-cache git

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json yarn.lock ./

# Install only production dependencies
RUN yarn install --frozen-lockfile --production

# Copy built client from builder stage
COPY --from=builder /app/dist ./dist

# Copy server files
COPY server ./server

# Copy any other necessary files (like circuit files if needed at runtime)
COPY src/circuit ./src/circuit

# Expose port (Render uses 10000 by default, but PORT env var will override)
EXPOSE 10000

# Set NODE_ENV to production
ENV NODE_ENV=production

# Start the server
CMD ["node", "server/index.js"]

