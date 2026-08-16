FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

FROM node:22-alpine
LABEL org.opencontainers.image.title="archinsight-renderer" \
      org.opencontainers.image.description="Internal hardened DOT to SVG/PNG renderer for Archinsight" \
      org.opencontainers.image.source="https://github.com/lonelylockley/insight"
ENV NODE_ENV=production \
    HOST=127.0.0.1 \
    PORT=3000 \
    MAX_BODY_BYTES=1048576 \
    MAX_RENDER_COUNT=16 \
    MAX_DOT_BYTES=1048576 \
    MAX_TOTAL_DOT_BYTES=1048576 \
    DEFAULT_PNG_DPI=200 \
    MAX_PNG_DPI=600 \
    MAX_PNG_BYTES=8388608 \
    MAX_PNG_WIDTH=8192 \
    MAX_PNG_HEIGHT=8192 \
    MAX_PNG_PIXELS=16777216 \
    MAX_SVG_BYTES=2097152 \
    MAX_TOTAL_OUTPUT_BYTES=12582912 \
    MAX_RESPONSE_BYTES=16777216 \
    MAX_WARNING_BYTES=65536 \
    BODY_TIMEOUT_MS=5000 \
    RENDER_TIMEOUT_MS=5000 \
    MAX_CONCURRENT_RENDERS=2 \
    MAX_QUEUED_RENDERS=16 \
    WORKER_MAX_OLD_GENERATION_MB=64 \
    WORKER_MAX_YOUNG_GENERATION_MB=16 \
    WORKER_STACK_MB=4
WORKDIR /app
COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node package.json ./
COPY --chown=node:node src ./src
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
STOPSIGNAL SIGTERM
CMD ["node", "src/server.mjs"]
