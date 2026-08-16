# Archinsight Renderer

Node.js renderer service for the optional, isolated server-side rendering path.

The editor's preferred path is:

```text
Insight sources/query -> backend link -> DOT -> browser Graphviz WASM -> SVG
```

The fallback path is disabled by default. While disabled, the backend does not call
this service and does not execute Graphviz itself. When an installation explicitly
enables the fallback, rendering continues as follows after browser Graphviz fails:

```text
Insight sources/query -> backend link -> backend-owned DOT -> renderer service -> SVG/PNG
```

The renderer service is intentionally not a public API. It accepts DOT only from the
Archinsight backend after the backend has parsed, linked, queried, and generated the
DOT itself. Every render request requires a shared bearer token. Client-supplied
`DOT in -> image out` endpoints must not be exposed.

## API

```http
GET /health
```

SVG render:

```http
POST /render/svg
Authorization: Bearer <renderer-api-token>
Content-Type: application/json

{
  "renders": [
    {
      "sourceIdentity": "app.ai",
      "diagram": "query",
      "dot": "digraph app { ... }"
    }
  ]
}
```

Response:

```json
{
  "diagnostics": [],
  "svgs": [
    {
      "sourceIdentity": "app.ai",
      "diagram": "query",
      "svg": "<svg ...>"
    }
  ],
  "warnings": []
}
```

`POST /render` is kept as a compatibility alias for `POST /render/svg`.

PNG render:

```http
POST /render/png
Authorization: Bearer <renderer-api-token>
Content-Type: application/json

{
  "dpi": 200,
  "renders": [
    {
      "sourceIdentity": "app.ai",
      "diagram": "query",
      "dot": "digraph app { ... }"
    }
  ]
}
```

`dpi` is optional and defaults to `200`.

Response:

```json
{
  "diagnostics": [],
  "pngs": [
    {
      "sourceIdentity": "app.ai",
      "diagram": "query",
      "dpi": 200,
      "width": 1200,
      "height": 800,
      "contentType": "image/png",
      "png": "base64..."
    }
  ],
  "warnings": []
}
```

## Configuration

Environment variables:

- `PORT` - default `3000`.
- `HOST` - default `127.0.0.1`; set `0.0.0.0` explicitly only behind a private
  container network or equivalent ingress boundary.
- `RENDERER_API_TOKEN` - required shared secret, at least 16 characters. Use a
  random value delivered through secret management.
- `MAX_BODY_BYTES` - default `1048576`.
- `BODY_TIMEOUT_MS` - maximum time allowed for receiving a request body, default
  `5000`. Body parsing and validation do not occupy a render queue slot.
- `MAX_RENDER_COUNT` - default `16`.
- `MAX_DOT_BYTES` - maximum DOT size per render, default `1048576`.
- `MAX_TOTAL_DOT_BYTES` - maximum DOT size across one request, default `1048576`.
- `DEFAULT_PNG_DPI` - default `200`.
- `MAX_PNG_DPI` - default `600`.
- `MAX_PNG_BYTES` - maximum encoded PNG size per image, default `8388608`.
- `MAX_PNG_WIDTH` and `MAX_PNG_HEIGHT` - maximum raster dimensions, default
  `8192` each.
- `MAX_PNG_PIXELS` - maximum raster pixel count, default `16777216`. Dimensions
  are checked before Resvg allocates the raster.
- `MAX_SVG_BYTES` - maximum SVG size per image, default `2097152`.
- `MAX_TOTAL_OUTPUT_BYTES` - maximum image payload across one request, default
  `12582912`.
- `MAX_RESPONSE_BYTES` - maximum serialized JSON response size, default
  `16777216`.
- `MAX_WARNING_BYTES` - maximum aggregate Graphviz warning size, default `65536`.
- `RENDER_TIMEOUT_MS` - default `5000`.
- `MAX_CONCURRENT_RENDERS` - maximum active worker threads, default `2`.
- `MAX_QUEUED_RENDERS` - bounded waiting queue, default `16`; excess requests
  receive `503 Service Unavailable` with `Retry-After: 1`.
- `WORKER_MAX_OLD_GENERATION_MB`, `WORKER_MAX_YOUNG_GENERATION_MB`, and
  `WORKER_STACK_MB` - Node worker memory limits, default `64`, `16`, and `4`.

## Runtime Hardening

The Dockerfile sets a non-root user and production-only dependencies. The real
sandbox boundary is the runtime configuration. Production should run this
service with:

- no public ingress; only the backend may call it;
- no egress to Postgres, Ghost, internal services, or the internet;
- no mounted project/user volumes;
- read-only root filesystem;
- small tmpfs if the platform requires `/tmp`;
- CPU, memory, and PID limits;
- `no-new-privileges`;
- all Linux capabilities dropped.

Docker-style example:

```shell
docker run \
  --read-only \
  --tmpfs /tmp:rw,noexec,nosuid,size=16m \
  --user node \
  --cap-drop=ALL \
  --security-opt no-new-privileges \
  --pids-limit=64 \
  --memory=128m \
  --cpus=0.5 \
  -e RENDERER_API_TOKEN='<random-shared-token>' \
  archinsight-renderer:dev
```

Local Docker sandbox run:

```shell
docker compose -f archinsight-renderer/compose.debug.yaml up --build
```

In Kubernetes, enforce the same model with `securityContext`,
`resources.limits`, and a `NetworkPolicy` that allows ingress only from the
backend and denies egress. The Helm values keep this service disabled until an
operator explicitly enables it and supplies its token through a Kubernetes
Secret.

## License

Copyright 2021-2026 Alexey Zaytsev

Licensed under the Apache License, Version 2.0. See [LICENSE](../LICENSE).
