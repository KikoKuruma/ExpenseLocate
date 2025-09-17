# Multi-stage build for ExpenseLocator
FROM node:18-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies needed for building the application
# We install both production and development dependencies here because the
# build step relies on tooling such as Vite and TypeScript that are only
# present in devDependencies.
RUN npm ci

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Production stage
FROM node:18-alpine AS production

# Install required system dependencies
RUN apk add --no-cache \
    postgresql-client \
    curl \
    && rm -rf /var/cache/apk/*

# Create app user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S expenseapp -u 1001

# Set working directory
WORKDIR /app

# Copy package files and install production dependencies
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

# Copy built application from builder stage
COPY --from=builder --chown=expenseapp:nodejs /app/dist ./dist
COPY --from=builder --chown=expenseapp:nodejs /app/shared ./shared

# Copy additional required files
COPY --chown=expenseapp:nodejs drizzle.config.ts ./
COPY --chown=expenseapp:nodejs tsconfig.json ./

# Create uploads directory with proper permissions
RUN mkdir -p uploads && chown -R expenseapp:nodejs uploads

# Switch to non-root user
USER expenseapp

# Expose port
EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:5000/api/health || exit 1

# Start command
CMD ["npm", "start"]