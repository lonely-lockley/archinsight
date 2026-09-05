FROM node:22-alpine AS dependencies

WORKDIR /workspace
COPY packages/insight-language/package*.json ./packages/insight-language/
COPY packages/insight-language/src ./packages/insight-language/src
COPY packages/archinsight-contracts/package*.json ./packages/archinsight-contracts/
COPY packages/archinsight-contracts/src ./packages/archinsight-contracts/src
COPY packages/archinsight-editor-support/package*.json ./packages/archinsight-editor-support/
COPY packages/archinsight-editor-support/src ./packages/archinsight-editor-support/src
COPY packages/archinsight-graphviz/package*.json ./packages/archinsight-graphviz/
COPY packages/archinsight-graphviz/src ./packages/archinsight-graphviz/src
COPY packages/archinsight-workbench/package*.json ./packages/archinsight-workbench/
COPY packages/archinsight-workbench/src ./packages/archinsight-workbench/src
COPY archinsight-web/package*.json ./archinsight-web/
RUN cd archinsight-web \
    && npm ci --omit=dev --prefer-offline --no-audit --no-fund \
    && npm cache clean --force

FROM node:22-alpine

ARG ARCHINSIGHT_CONTEXT_ROOT=/app

LABEL org.opencontainers.image.title="archinsight-web" \
      org.opencontainers.image.description="Archinsight editor and playground" \
      org.opencontainers.image.source="https://github.com/lonelylockley/insight"

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    ARCHINSIGHT_CONTEXT_ROOT=${ARCHINSIGHT_CONTEXT_ROOT}

WORKDIR /workspace/archinsight-web
COPY --from=dependencies --chown=node:node /workspace/archinsight-web/node_modules ./node_modules
COPY --from=dependencies --chown=node:node /workspace/packages/insight-language ../packages/insight-language
COPY --from=dependencies --chown=node:node /workspace/packages/archinsight-contracts ../packages/archinsight-contracts
COPY --from=dependencies --chown=node:node /workspace/packages/archinsight-editor-support ../packages/archinsight-editor-support
COPY --from=dependencies --chown=node:node /workspace/packages/archinsight-graphviz ../packages/archinsight-graphviz
COPY --from=dependencies --chown=node:node /workspace/packages/archinsight-workbench ../packages/archinsight-workbench
COPY --chown=node:node archinsight-web/package.json ./package.json
COPY --chown=node:node archinsight-web/build ./build

USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "let root=(process.env.ARCHINSIGHT_CONTEXT_ROOT||'').replace(/^\/+|\/+$/g,'');root=root?'/'+root:'';fetch('http://127.0.0.1:'+(process.env.PORT||3000)+root+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
STOPSIGNAL SIGTERM
CMD ["node", "build"]
