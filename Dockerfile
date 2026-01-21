# Multi-stage build for optimal image size
FROM node:20-alpine AS builder

# Install git (required by some npm packages)
RUN apk add --no-cache git

# Configure git to use HTTPS instead of SSH for GitHub URLs
# This avoids SSH key requirements in Docker builds
RUN git config --global url."https://github.com/".insteadOf "ssh://git@github.com/"

# Set working directory
WORKDIR /app

# Accept build arguments for Vite environment variables
# Render exposes these as env vars; we also declare them as build args for clarity
ARG VITE_GCS_API_URL
ARG VITE_POSTHOG_KEY
ARG VITE_POSTHOG_HOST

# Ensure they are available as environment variables during the Vite build
ENV VITE_GCS_API_URL=${VITE_GCS_API_URL}
ENV VITE_POSTHOG_KEY=${VITE_POSTHOG_KEY}
ENV VITE_POSTHOG_HOST=${VITE_POSTHOG_HOST}

# Copy package files
COPY package.json yarn.lock ./

# Install dependencies
RUN yarn install --frozen-lockfile

# Copy source code
COPY . .

# Create .env.production file for Vite with any provided VITE_* variables
# Vite automatically loads .env.production during build
RUN rm -f .env.production && \
    touch .env.production && \
    if [ -n "$VITE_GCS_API_URL" ]; then \
      echo "VITE_GCS_API_URL=$VITE_GCS_API_URL" >> .env.production; \
    fi && \
    if [ -n "$VITE_POSTHOG_KEY" ]; then \
      echo "VITE_POSTHOG_KEY=$VITE_POSTHOG_KEY" >> .env.production; \
    fi && \
    if [ -n "$VITE_POSTHOG_HOST" ]; then \
      echo "VITE_POSTHOG_HOST=$VITE_POSTHOG_HOST" >> .env.production; \
    fi && \
    if [ -s .env.production ]; then \
      echo \"Created .env.production with the following contents:\" && cat .env.production; \
    else \
      echo \"Warning: no Vite env vars set - frontend will use defaults\"; \
    fi

# Build the client (Vite will use VITE_* values from .env.production or env vars)
RUN yarn build

# Production stage
FROM node:20-alpine AS production

# Install git (required by some npm packages)
RUN apk add --no-cache git

# Configure git to use HTTPS instead of SSH for GitHub URLs
# This avoids SSH key requirements in Docker builds
RUN git config --global url."https://github.com/".insteadOf "ssh://git@github.com/"

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

