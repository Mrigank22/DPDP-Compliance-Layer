# DataSentinel Helm Chart

Deploys the four DataSentinel services to Kubernetes:

| Component       | Type            | Port(s)        | Notes                                            |
| --------------- | --------------- | -------------- | ------------------------------------------------ |
| `control-plane` | Deployment      | 3001           | Go API. Runs DB migrations on startup.           |
| `gateway`       | Deployment      | 8080 (+8443)   | Inline PII proxy. `/metrics` on 8080.            |
| `workers`       | Deployments     | —              | One Celery Deployment per queue + beat (+flower) |
| `frontend`      | Deployment      | 3000           | Next.js dashboard.                               |

> **Data stores are external.** PostgreSQL, Redis and ClickHouse are **not**
> deployed by this chart. Point the `database`, `redis` and `clickhouse` values
> at managed services (AWS RDS, ElastiCache, ClickHouse Cloud) or your own
> in-cluster instances. For local development use
> `services/workers/docker-compose.yml`.

---

## Prerequisites

- Kubernetes ≥ 1.23
- Helm ≥ 3.8
- Reachable PostgreSQL 16, Redis 7 and ClickHouse 24
- Container images for all four services pushed to a registry your cluster can pull
- (Production) [cert-manager](https://cert-manager.io), an ingress controller
  (e.g. ingress-nginx), and optionally
  [External Secrets Operator](https://external-secrets.io) +
  [Prometheus Operator](https://prometheus-operator.dev)

> **Note:** the repository does not yet contain a `frontend/Dockerfile`. Build a
> Next.js production image (ideally `output: "standalone"`) listening on port
> 3000 before deploying the frontend, or set `frontend.enabled=false`.

---

## Quick start (development)

```bash
# 1. Generate RS256 JWT keys
openssl genrsa -out jwt_private.pem 2048
openssl rsa -in jwt_private.pem -pubout -out jwt_public.pem

# 2. Install, supplying secrets at the CLI
helm upgrade --install datasentinel ./helm/datasentinel \
  -n datasentinel --create-namespace \
  --set-file jwt.privateKey=jwt_private.pem \
  --set-file jwt.publicKey=jwt_public.pem \
  --set secrets.masterEncryptionKey=$(openssl rand -hex 32) \
  --set secrets.internalApiKey=$(openssl rand -hex 24) \
  --set database.host=my-postgres,database.password=secret \
  --set redis.host=my-redis \
  --set clickhouse.host=my-clickhouse \
  --set ingress.enabled=false
```

Then port-forward:

```bash
kubectl -n datasentinel port-forward svc/datasentinel-frontend 3000:3000
kubectl -n datasentinel port-forward svc/datasentinel-control-plane 3001:3001
```

---

## Production install

```bash
helm upgrade --install datasentinel ./helm/datasentinel \
  -n datasentinel --create-namespace \
  -f helm/datasentinel/values.yaml \
  -f helm/datasentinel/values.prod.yaml \
  --set-string image.tag=$GIT_SHA
```

`values.prod.yaml` enables External Secrets, autoscaling, PodDisruptionBudgets,
NetworkPolicies, ServiceMonitors and cert-manager TLS. Review and edit the
hostnames, registry, RDS/ElastiCache endpoints and IRSA role ARN first.

### Secrets in production

Set `secrets.create=false` and `externalSecrets.enabled=true`. Store these keys
in each remote secret (AWS Secrets Manager / Vault / …):

| Remote key (`externalSecrets.*RemoteKey`) | Must contain                                                                                              |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| control-plane                             | `DATABASE_URL`, `REDIS_URL`, `WORKER_REDIS_URL`, `CLICKHOUSE_PASSWORD`, `MASTER_ENCRYPTION_KEY`, `INTERNAL_API_KEY`, `SMTP_*`, `AWS_*` |
| gateway                                   | `DATABASE_URL`, `REDIS_URL`, `CLICKHOUSE_PASSWORD`, `MASTER_ENCRYPTION_KEY`, `CONTROL_PLANE_API_KEY`       |
| workers                                   | `DATABASE_URL`, `REDIS_URL`, `CLICKHOUSE_PASSWORD`, `MASTER_ENCRYPTION_KEY`, `CONTROL_PLANE_API_KEY`, `AWS_*`, `AZURE_STORAGE_CONNECTION_STRING` |
| jwt (optional)                            | `jwt_private.pem`, `jwt_public.pem`                                                                        |

> `MASTER_ENCRYPTION_KEY` **must be identical** across all three services and
> **must stay stable** — rotating it makes previously-encrypted asset
> credentials unrecoverable. `control-plane.INTERNAL_API_KEY` must equal
> `gateway`/`workers` `CONTROL_PLANE_API_KEY`.

---

## Key configuration

| Value                          | Default                          | Description                                              |
| ------------------------------ | -------------------------------- | -------------------------------------------------------- |
| `image.registry`               | `ghcr.io/datasentinel`           | Registry/namespace for all images                        |
| `image.tag`                    | `""` (→ `appVersion`)            | Global image tag                                         |
| `database.*`                   | in-cluster placeholder           | PostgreSQL connection (or set `database.url`)            |
| `redis.*`                      | in-cluster placeholder           | Redis host + per-service logical DBs                     |
| `clickhouse.*`                 | in-cluster placeholder           | Native (cp) + HTTP (gw/workers) endpoints                |
| `secrets.create`               | `true`                           | Create chart-managed Secrets                             |
| `externalSecrets.enabled`      | `false`                          | Use External Secrets Operator instead                   |
| `jwt.create` / `jwt.privateKey`| `true` / `""`                    | RS256 signing material                                   |
| `controlPlane.autoscaling`     | disabled                         | HPA for the API                                          |
| `gateway.autoscaling`          | disabled                         | HPA for the proxy                                        |
| `workers.queues`               | 5 queues                         | One Deployment per Celery queue                          |
| `workers.beat.enabled`         | `true`                           | Single beat scheduler                                    |
| `ingress.enabled`              | `true`                           | Dashboard ingress (`/` → frontend, `/api` → control-plane)|
| `metrics.serviceMonitor.enabled` | `false`                        | Prometheus Operator scraping (gateway `/metrics`)        |
| `networkPolicy.enabled`        | `false`                          | Default-deny ingress + explicit allows                   |

See [`values.yaml`](./values.yaml) for the full, commented list.

---

## Redis logical databases

A single Redis instance is namespaced by DB index so services don't collide:

| DB | Used by                              | Value                  |
| -- | ------------------------------------ | ---------------------- |
| 0  | control-plane cache / rate limiting  | `redis.controlPlaneDB` |
| 1  | Celery broker (control-plane ⇄ workers) | `redis.workerQueueDB` |
| 2  | gateway policy cache + token vault   | `redis.gatewayDB`      |

The workers' broker is wired to `redis.workerQueueDB` so task hand-off from the
control-plane works end to end.

---

## Operations

```bash
# Render manifests without installing
helm template datasentinel ./helm/datasentinel -f values.prod.yaml | less

# Lint
helm lint ./helm/datasentinel

# Smoke test a release (curls /healthz, /readyz)
helm test datasentinel -n datasentinel

# Roll a config change (checksums trigger automatic restarts)
helm upgrade datasentinel ./helm/datasentinel -n datasentinel -f values.prod.yaml

# Uninstall
helm uninstall datasentinel -n datasentinel
```

### Migrations

The control-plane applies SQL migrations automatically at startup using an
advisory lock, so concurrent replicas are safe. No separate migration Job is
required.

---

## Notes & limitations

- Only the **gateway** currently exposes Prometheus metrics (`/metrics` on its
  HTTP port). `metrics.serviceMonitor.controlPlane` is provided for when the
  control-plane gains a `/metrics` endpoint.
- `NEXT_PUBLIC_*` values are baked into the frontend bundle **at image build
  time**. Build the frontend image with the correct `apiUrl`; the runtime
  ConfigMap value only helps if your image reads it at runtime.
- Flower (`workers.flower.enabled`) is unauthenticated — protect it via the
  ingress (basic auth annotations are shown in `values.prod.yaml`).
