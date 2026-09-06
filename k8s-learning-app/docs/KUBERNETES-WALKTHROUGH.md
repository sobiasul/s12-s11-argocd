# A guided tour of the manifests

Read this with `k8s/` open beside it. Every section ends with something to
**try** — mostly breaking things on purpose, because a failure you caused is the
fastest way to understand a mechanism.

---

## The shape of it

```
                 Internet
                    │
              ┌─────▼─────┐
              │  Ingress  │   one host, path-based routing
              └──┬─────┬──┘
          /      │     │   /api
      ┌──────────▼┐   ┌▼───────────┐
      │ Service   │   │ Service    │
      │   web     │   │   api      │
      └─────┬─────┘   └─────┬──────┘
            │               │
      ┌─────▼─────┐   ┌─────▼──────┐
      │ Deployment│   │ Deployment │   2 replicas each
      │   web     │   │    api     │
      │  (nginx)  │   │  (node)    │
      └───────────┘   └─────┬──────┘
                            │ NetworkPolicy allows only this
                      ┌─────▼──────┐
                      │StatefulSet │
                      │ postgres-0 │──── PVC (survives everything)
                      └────────────┘
```

Because the Ingress serves both from **one host**, the browser sees a single
origin. That is why the session cookie works with no CORS configuration at all.
It is a design decision, not an accident — see `40-ingress.yaml`.

---

## 1. Namespace — `00-namespace.yaml`

A namespace is a boundary for names, RBAC, quotas and NetworkPolicies. It is
*not* a security boundary on its own.

The interesting part is Pod Security Admission:

```yaml
pod-security.kubernetes.io/enforce: restricted
```

`restricted` is the strictest built-in profile. A Pod that runs as root, or
requests privilege escalation, or keeps Linux capabilities, is **rejected at
admission** — it never gets scheduled.

**Try it:** add `securityContext: {runAsUser: 0}` to the api container and apply.
Read the rejection message. That message is the whole lesson.

---

## 2. ConfigMap and Secret — `01-config.yaml`

Same idea, different intent: ConfigMap for things you would happily print, Secret
for things you would not.

**A Secret is base64, not encryption.** Prove it to yourself:

```bash
kubectl -n k8s-learn get secret api-secrets -o jsonpath='{.data.JWT_SECRET}' | base64 -d
```

Real protection comes from three things: RBAC restricting who can read Secrets,
encryption-at-rest for etcd, and never committing them to git. You already run
External Secrets Operator in your other repo — replacing this Secret with an
`ExternalSecret` is the natural next exercise.

Both are consumed with `envFrom`, which injects every key as an environment
variable. **Note:** changing a ConfigMap does *not* restart Pods. Environment
variables are read once at process start.

**Try it:** edit the ConfigMap's `LOG_LEVEL` and watch nothing happen. Then
`kubectl -n k8s-learn rollout restart deploy/api` and watch it take effect.

---

## 3. Postgres — `10-postgres.yaml`

A **StatefulSet**, not a Deployment. Three differences matter:

1. **Stable identity.** The Pod is always `postgres-0`, never a random suffix.
2. **Stable storage.** `volumeClaimTemplates` gives each replica its own PVC,
   which survives the Pod being deleted or moved to another node.
3. **Ordered operations.** Pods start 0, 1, 2 and terminate in reverse.

The Service is **headless** (`clusterIP: None`). That is required: it makes DNS
return Pod IPs directly, which is what gives each Pod a stable DNS name.

Two details that bite everyone once:

- `PGDATA` points at a *subdirectory*. The Postgres image refuses to initialise
  into a non-empty directory, and a freshly mounted volume often contains
  `lost+found`.
- `fsGroup: 999` makes the mounted volume group-writable by the postgres user.
  Without it the container starts as non-root and cannot write to its own data
  directory.

**Try it:** delete the Pod — `kubectl -n k8s-learn delete pod postgres-0` — and
watch it come back with the same name and the same data. Then check the PVC is
untouched: `kubectl -n k8s-learn get pvc`.

---

## 4. The API — `20-backend.yaml`

The densest file. Work through it in this order.

### initContainers

Two of them, both solving ordering problems that would otherwise look like bugs:

- **`wait-for-postgres`** blocks until the database answers. Without it the API
  crash-loops for the 20–30 seconds Postgres takes to initialise, which looks
  like a broken image.
- **`migrate`** runs the schema migrations, using the **same image** as the app
  with `RUN_MIGRATIONS_ONLY=true`. One image, two jobs — so the migration tool
  can never drift from the code that depends on it.

This is also *why* migrations do not run in the app container: with 2 replicas,
both Pods would race to alter the same schema.

### The three probes

This is the part people get wrong most often.

| Probe | Question | On failure | Checks the DB? |
|---|---|---|---|
| `startupProbe` → `/startupz` | Has it finished booting? | keeps waiting | no |
| `readinessProbe` → `/readyz` | Should it get traffic? | removed from Service endpoints | **yes** |
| `livenessProbe` → `/healthz` | Is the process wedged? | **container killed** | **no** |

Liveness deliberately does *not* touch the database. If it did, a Postgres blip
would restart every API Pod at once — turning a small outage into a large one.

**Try it:** scale Postgres to zero (`kubectl -n k8s-learn scale statefulset
postgres --replicas=0`). Watch `kubectl -n k8s-learn get pods -w`: the API Pods
go **not-ready but keep running**. Scale it back and they recover without a
restart. Now imagine if liveness had checked the DB.

### resources

`requests` are what the scheduler reserves; `limits` are the ceiling.

Note there is **no CPU limit**. CPU is compressible — exceeding it just means
throttling — and a low limit causes latency spikes for no benefit. Memory *is*
limited, because memory is not compressible: exceeding it means the container is
OOMKilled.

**Try it:** set `limits.memory: 32Mi` and redeploy. Watch the Pod get OOMKilled
and check `kubectl -n k8s-learn describe pod ...` for `Reason: OOMKilled`.

### Graceful shutdown

Three things cooperate:

1. `preStop: sleep 5` — pause before SIGTERM so in-flight requests finish.
   Kubernetes removes the Pod from endpoints and signals it at the *same moment*,
   so without this a few requests land on a dying Pod.
2. `terminationGracePeriodSeconds: 30` — how long before SIGKILL.
3. The app's own SIGTERM handler (`src/index.ts`) closes the HTTP server, then
   the database pool.

**Try it:** run `kubectl -n k8s-learn rollout restart deploy/api` while hitting
the site. It should not drop a request.

### maxUnavailable: 0

The rollout adds a new Pod before removing an old one. Capacity never dips.

---

## 5. The web tier — `30-frontend.yaml`

Note it listens on **8080, not 80**. Ports below 1024 need `NET_BIND_SERVICE`,
and the securityContext drops every capability.

`readOnlyRootFilesystem: true` is why there are three `emptyDir` mounts — nginx
needs somewhere writable for its cache, pid and temp files. A read-only root
filesystem means a compromised process cannot modify the running application.

---

## 6. Ingress — `40-ingress.yaml`

One host, two paths. The controller matches the **longest prefix**, so `/api`
wins over `/` for API calls.

`ingressClassName: nginx` must match an IngressClass that exists in your cluster:

```bash
kubectl get ingressclass
```

If nothing is listed, you have no ingress controller and the Ingress will do
nothing at all. Use `make port-forward` instead.

---

## 7. NetworkPolicies — `50-networkpolicy.yaml`

**These only work if your CNI enforces them.** Flannel ignores them completely;
Calico and Cilium enforce them. If they appear to do nothing, that is why.

The pattern is deny-by-default plus explicit exceptions. The rule worth
understanding is the last one: Postgres accepts connections **only** from Pods
labelled as the API. Even if something else in the namespace is compromised, it
cannot reach the database.

Note it selects by **label**, not IP. Pod IPs change constantly; labels do not.

**Try it:**

```bash
kubectl -n k8s-learn run probe --rm -it --image=postgres:16-alpine -- \
  psql postgres://k8slearn:PASSWORD@postgres:5432/k8slearn
```

It should hang and time out. Now delete `postgres-from-api` and try again — it
connects. Re-apply it.

---

## 8. HPA, PDB, Quota — `20-backend.yaml`, `60-quota.yaml`

- **HPA** scales on CPU as a percentage of the *request*, not the limit. Needs
  metrics-server: `kubectl top pods` must work first.
- **PodDisruptionBudget** protects against *voluntary* disruption — a node drain
  or cluster upgrade. It cannot protect against a node crashing.
- **ResourceQuota** caps the namespace. Once it sets `requests.cpu`, every Pod
  *must* declare requests — and the **LimitRange** is what supplies defaults so
  that requirement doesn't block everything.

**Try it:** `kubectl -n k8s-learn drain <node> --ignore-daemonsets` on a
multi-node cluster and watch the PDB refuse to let both replicas go at once.

---

## Debugging drills

Break it, then find it. In rough order of difficulty:

1. Set the api image tag to something nonexistent → find `ImagePullBackOff`.
2. Point `DATABASE_URL` at the wrong host → find the Pod stuck not-ready, and
   read `/readyz` with `kubectl exec`.
3. Change the Deployment's selector labels but not the template's → read the
   rejection; selectors are immutable for a reason.
4. Delete the `api` Service → watch the Ingress 503 while the Pods stay healthy.
5. Set `replicas: 0` on postgres → watch the API go not-ready but *not* restart.

Commands that answer most questions:

```bash
kubectl -n k8s-learn get pods -w
kubectl -n k8s-learn describe pod <name>          # Events at the bottom are the answer
kubectl -n k8s-learn logs <pod> -c migrate        # initContainer logs need -c
kubectl -n k8s-learn logs <pod> --previous        # the crashed one, not the new one
kubectl -n k8s-learn get events --sort-by=.lastTimestamp
kubectl -n k8s-learn exec -it deploy/api -- sh
```

All of these are in the cheat sheet inside the app — which is the point.
