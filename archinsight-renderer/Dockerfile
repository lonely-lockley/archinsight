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
    DEFAULT_PNG_DPI=200 \
    MAX_PNG_DPI=600 \
    MAX_PNG_BYTES=16777216 \
    RENDER_TIMEOUT_MS=5000 \
    MAX_CONCURRENT_RENDERS=2 \
    MAX_QUEUED_RENDERS=16
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
