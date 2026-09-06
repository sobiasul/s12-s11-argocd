# Architecture

## Request flow

```
browser → Ingress → Service(web)  → nginx Pod        → static files
                  → Service(api)  → node Pod         → Postgres StatefulSet
```

Both paths share **one hostname**. That single decision removes CORS entirely and
lets the session live in an httpOnly cookie, which is the safer place for it.

## Authentication

Two tokens, on purpose.

| | Access token | Refresh token |
|---|---|---|
| Format | JWT, signed HS256 | opaque 48 random bytes |
| Lifetime | 15 minutes | 30 days |
| Stored | httpOnly cookie, path `/` | httpOnly cookie, path `/api/auth` |
| Server state | none | a row in `refresh_tokens`, **SHA-256 hashed** |
| Revocable | no | yes |

A JWT cannot be revoked before it expires — that is the trade for being
stateless. Keeping it short-lived limits the damage. The refresh token *is*
revocable because it is a row that can be deleted, and it **rotates**: using it
marks it revoked and issues a new one, so a stolen token that gets replayed after
the real user has refreshed is already dead.

Only the hash of the refresh token is stored, so a database dump does not hand
over live sessions.

Passwords use **scrypt** from Node's own `crypto`. Not bcrypt or argon2 — both
are native addons needing a compiler in the build image. Format:
`scrypt$N$r$p$salt$hash`, so the parameters travel with the hash and can be
raised later without invalidating existing passwords. Verification uses
`timingSafeEqual`.

Two subtler defences:

- **Login is a constant-time-ish operation.** An unknown email still runs a hash,
  because returning early would make the response measurably faster and turn
  login into an account-enumeration oracle.
- **One error message** for both "no such user" and "wrong password".

## Data model

```
users ──┬── refresh_tokens     (hashed, rotating, revocable)
        ├── user_progress      (user, item_type, item_id, status)
        └── user_notes         (user, item_type, item_id, body)

k8s_objects       57 rows, seeded from content/objects.json
kubectl_commands  216 rows, seeded from content/commands.json
```

Both content tables carry a **generated `tsvector` column**:

```sql
search_vec TSVECTOR GENERATED ALWAYS AS (
  setweight(to_tsvector('english', kind), 'A') || ...
) STORED
```

Postgres maintains it on every write, so the search index can never drift out of
sync with the row it describes. A GIN index on it makes ranked full-text search
fast without a separate search service.

Content is **seeded, not imported at request time** — the API is a real
database-backed service, which is what makes progress tracking and search
straightforward.

## Configuration

Everything comes from the environment, validated by zod at boot. If anything is
missing the process **exits immediately**. That is correct in Kubernetes: the Pod
crash-loops, `kubectl describe` shows why, and no traffic is ever routed to a
half-configured process.

## Logging

Structured JSON to stdout, via pino. Nothing writes to a file and nothing
rotates, because the kubelet captures stdout and `kubectl logs` reads it back. A
container writing its own log files is writing to a filesystem that disappears on
restart and that nothing is watching.

Every request gets an `x-request-id` — taken from the ingress if present,
otherwise generated — and every log line for that request carries it. That is how
you follow one request across replicas:

```bash
kubectl -n k8s-learn logs -l app.kubernetes.io/name=api --all-containers | grep <id>
```

Probe endpoints are excluded from access logs; they fire every few seconds and
would bury everything else. Authorization headers, cookies and anything named
`password` are redacted.

## Metrics

`prom-client` on `/metrics`: default process metrics plus request duration and
count, labelled by method, route and status. Unmatched paths collapse to
`"unmatched"` so a scanner hitting random URLs cannot explode metric cardinality.

## Scaling notes

The connection pool is **per Pod**. Cluster-wide connections are
`DB_POOL_MAX × replicas`, so scaling the Deployment to 10 puts 100 connections
against a default Postgres that allows 100 total. That interaction between a
stateless tier and a stateful one is worth internalising early.
