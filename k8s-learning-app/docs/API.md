# API reference

Base URL: `/api`. All responses are JSON. Session cookies are httpOnly; the
endpoints also accept `Authorization: Bearer <token>` so they work from curl.

`BASE=http://localhost:8080` for docker compose, or your Ingress host.

## Auth

### `POST /api/auth/register`
```bash
curl -c jar -X POST $BASE/api/auth/register -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com","displayName":"Your Name","password":"at-least-ten-chars"}'
```
`201` with `{ user, accessToken }`. `409` if the email exists, `400` with
per-field `details` on validation failure.

### `POST /api/auth/login`
```bash
curl -c jar -X POST $BASE/api/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com","password":"at-least-ten-chars"}'
```
`200` with `{ user, accessToken }`. `401` on bad credentials — deliberately the
same message whether the email exists or not. Rate limited to 20 attempts per 15
minutes.

### `POST /api/auth/refresh`
Rotates the refresh cookie and issues a new access token. `401` if expired or
already used.

### `GET /api/auth/me` · `POST /api/auth/logout` · `POST /api/auth/logout-all`
Current user; end this session; end every session for the user.

## Content (public)

| Endpoint | Notes |
|---|---|
| `GET /api/content/objects` | `?category=Workloads` · `?search=rollback` (full-text) |
| `GET /api/content/objects/:id` | Returns the object **plus hydrated `related`** |
| `GET /api/content/objects/categories` | Category names with counts |
| `GET /api/content/commands` | `?category=` · `?search=` · `?danger=true` |
| `GET /api/content/commands/categories` | Category names with counts |
| `GET /api/content/search?q=` | Ranked across both, min 2 characters |
| `GET /api/content/stats` | `{ objects, commands }` totals |

```bash
curl "$BASE/api/content/objects/deployment" | jq '.object.kind, .related[].kind'
curl "$BASE/api/content/search?q=rollback" | jq
```

## Progress (requires auth)

| Endpoint | Notes |
|---|---|
| `GET /api/progress` | `{ items, summary }` |
| `PUT /api/progress` | `{ itemType, itemId, status }` — upsert |
| `DELETE /api/progress/:itemType/:itemId` | `204` |
| `GET /api/progress/notes` | All notes for the user |
| `PUT /api/progress/notes` | `{ itemType, itemId, body }`; empty body deletes |

```bash
curl -b jar -X PUT $BASE/api/progress -H 'Content-Type: application/json' \
  -d '{"itemType":"object","itemId":"deployment","status":"learned"}'
```

## Operational (not under /api — keep these off the Ingress)

| Endpoint | Purpose |
|---|---|
| `GET /healthz` | Liveness. Never touches the database. |
| `GET /readyz` | Readiness. `503` when Postgres is unreachable. |
| `GET /startupz` | Startup. `503` until the server is listening. |
| `GET /metrics` | Prometheus exposition format. |

## Errors

```json
{ "error": "validation failed",
  "details": [{ "field": "password", "message": "password must be at least 10 characters" }] }
```

`400` validation · `401` unauthenticated · `404` missing · `409` conflict ·
`429` rate limited · `500` internal (never includes a stack trace in production).
