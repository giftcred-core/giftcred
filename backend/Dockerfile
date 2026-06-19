# Use Node.js Alpine image for a small, secure production footprint
FROM node:20-alpine

# Set the working directory inside the container
WORKDIR /app

# Add dumb-init to handle process signals properly
RUN apk add --no-cache dumb-init

# Copy package files (Note: this expects the build context to be the project root)
COPY package.json package-lock.json ./

# Install only production dependencies
RUN npm ci --omit=dev && npm cache clean --force

# Copy the backend source code directory
COPY backend ./backend

# Set environment variables (these can be overridden via docker run --env-file)
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=8000

# Expose the port the app runs on
EXPOSE 8000

# Use dumb-init as the entrypoint
ENTRYPOINT ["dumb-init", "--"]

# Run the backend server
CMD ["npx", "tsx", "backend/server.ts"]
