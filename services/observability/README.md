# Observability

Minimal Prometheus + Grafana stack for DataSentinel.

## What's exposed

Both Go services expose a Prometheus endpoint at `GET /metrics`:

| Service | Address | Key metrics |
| --- | --- | --- |
| Control plane | `localhost:3001/metrics` | `http_requests_total{method,route,status}`, `http_request_duration_seconds` (histogram), Go runtime/process metrics |
| Gateway | `localhost:8080/metrics` | `gateway_requests_total{action}`, `gateway_pii_detections_total{type}`, `gateway_blocks_total`, `gateway_llm_calls_total` |

The control-plane route label uses the matched **route template** (e.g. `/api/v1/assets/:id`), not the raw URL, so cardinality stays bounded.

## Run it

```bash
cd services/observability
docker compose up -d
```

- Prometheus → http://localhost:9090
- Grafana → http://localhost:3030 (admin / admin)

Grafana auto-provisions the Prometheus datasource and the **DataSentinel Overview** dashboard (request rate, p95 latency, 5xx rate, gateway activity).

## Notes

- Targets use `host.docker.internal` so Prometheus (in a container) can scrape services running on the host. On Linux this is enabled via `extra_hosts: host-gateway`.
- If you run the Go services in containers on the same Docker network, point `prometheus.yml` at their service names instead.
