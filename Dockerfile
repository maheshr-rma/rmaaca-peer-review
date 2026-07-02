# =============================================================================
# rmaaca.in — Multi-Model AI Peer Review
# Production Dockerfile (multi-stage, standalone Next.js 16 output)
# =============================================================================
#
# Build:
#   docker build -t rmaaca-in:latest .
#
# Run (mount your Z.ai config at runtime):
#   docker run -d \
#     --name rmaaca-in \
#     -p 3000:3000 \
#     -v "$(pwd)/.z-ai-config:/etc/.z-ai-config:ro" \
#     --restart unless-stopped \
#     rmaaca-in:latest
#
# Or build the config INTO the image (less secure, but simple for demos):
#   docker build -t rmaaca-in:latest --build-arg ZAI_CONFIG="$(cat .z-ai-config)" .
#
# Healthcheck:
#   curl http://localhost:3000/api/health
# =============================================================================

# ---------- Stage 1: deps ----------
FROM node:22-alpine AS deps
WORKDIR /app

# Install bun for fast, reproducible installs (matches the lockfile)
RUN npm install -g bun

COPY package.json bun.lock* ./
COPY prisma ./prisma

# Install with frozen lockfile for reproducibility
RUN bun install --frozen-lockfile


# ---------- Stage 2: builder ----------
FROM node:22-alpine AS builder
WORKDIR /app

RUN npm install -g bun

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Next.js picks up NEXT_TELEMETRY_DISABLED=1 to skip telemetry
ENV NEXT_TELEMETRY_DISABLED=1

# Build the standalone production bundle
# (next.config.ts already has output: 'standalone')
RUN bun run build


# ---------- Stage 3: runner ----------
FROM node:22-alpine AS runner
WORKDIR /app

# Run as non-root for security
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Create a non-root user
RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 nextjs

# Copy the standalone server bundle (includes only needed node_modules)
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
# Static assets must be served alongside the standalone server
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Optional: bake the Z.ai config in at build time.
# PREFER mounting at runtime (see docker run example above) — this is a fallback.
ARG ZAI_CONFIG=""
RUN if [ -n "$ZAI_CONFIG" ]; then \
      echo "$ZAI_CONFIG" > /etc/.z-ai-config \
      && chmod 644 /etc/.z-ai-config \
      && chown nextjs:nodejs /etc/.z-ai-config; \
    fi

# Healthcheck: the standalone server responds on / with 200
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

USER nextjs

EXPOSE 3000

CMD ["node", "server.js"]
