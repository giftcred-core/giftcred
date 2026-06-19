# Giftcred Node.js backend — production image
FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache dumb-init wget

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=8000

# Install production dependencies only (tsx is in dependencies)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY tsconfig.json ./
COPY backend ./backend

RUN chown -R node:node /app
USER node

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD-SHELL wget -qO- "http://127.0.0.1:$${PORT:-8000}/api/health" >/dev/null 2>&1 || exit 1

ENTRYPOINT ["dumb-init", "--"]
CMD ["npm", "start"]
