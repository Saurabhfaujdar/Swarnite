# ── Stage 1: Install Dependencies ───────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ── Stage 2: Build ──────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ARG APP_VERSION=1.0.0
ENV APP_VERSION=${APP_VERSION}
RUN npx prisma generate
RUN npm run build

# ── Stage 3: Production Runtime ─────────────────────────────
FROM node:20-alpine AS production
RUN apk add --no-cache tini
RUN addgroup -S jewelerp && adduser -S jewelerp -G jewelerp
WORKDIR /app

# Production dependencies only
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Prisma schema + generated client
COPY prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

# Compiled server
COPY --from=builder /app/dist-server ./dist-server

# Built frontend (Vite output)
COPY --from=builder /app/dist ./dist

# Runtime frontend config (can be overridden via volume mount)
# COPY deploy/config.production.js ./dist/config.js

RUN chown -R jewelerp:jewelerp /app
USER jewelerp

EXPOSE 3001

ARG APP_VERSION=1.0.0
ENV NODE_ENV=production \
    APP_VERSION=${APP_VERSION} \
    SERVE_STATIC=true \
    STATIC_DIR=dist

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3001/api/health || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["sh", "-c", "npx prisma migrate deploy && node dist-server/index.js"]
