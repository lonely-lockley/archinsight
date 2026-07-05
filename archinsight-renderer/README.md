# Archinsight Renderer

Node.js renderer service for the hardened server-side rendering path.

The editor's preferred path is:

```text
Insight sources/query -> backend link -> DOT -> browser Graphviz WASM -> SVG
```

The fallback and external embedding path is:

```text
Insight sources/query -> backend link -> backend-owned DOT -> renderer service -> SVG/PNG
```

The renderer service is intentionally not a public API. It accepts DOT only from the
Archinsight backend after the backend has parsed, linked, queried, and generated the
DOT itself. Client-supplied `DOT in -> image out` endpoints must not be exposed.

## API

```http
GET /health
```

SVG render:

```http
POST /render/svg
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
- `HOST` - default `0.0.0.0`; local debug uses `127.0.0.1`.
- `MAX_BODY_BYTES` - default `1048576`.
- `MAX_RENDER_COUNT` - default `16`.
- `MAX_DOT_BYTES` - default `1048576`.
- `DEFAULT_PNG_DPI` - default `200`.
- `MAX_PNG_DPI` - default `600`.
- `MAX_PNG_BYTES` - default `16777216`.
- `RENDER_TIMEOUT_MS` - default `5000`.

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
  archinsight-renderer:dev
```

Local Docker sandbox run:

```shell
docker compose -f archinsight-renderer/compose.debug.yaml up --build
```

In Kubernetes, enforce the same model with `securityContext`,
`resources.limits`, and a `NetworkPolicy` that allows ingress only from the
backend and denies egress.
