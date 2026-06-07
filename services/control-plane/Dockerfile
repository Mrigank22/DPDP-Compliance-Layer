# services/control-plane/Dockerfile

# ── Build stage ──────────────────────────────────────────────────────────────
FROM golang:1.22-alpine AS builder

RUN apk add --no-cache git ca-certificates tzdata

WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY . .

RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 \
    go build -ldflags="-w -s -X main.version=$(git describe --tags --always --dirty 2>/dev/null || echo dev)" \
    -o /bin/control-plane ./cmd/server

# ── Runtime stage ────────────────────────────────────────────────────────────
FROM alpine:3.20 AS runtime

RUN apk add --no-cache ca-certificates tzdata curl && \
    addgroup -g 10001 -S appgroup && \
    adduser  -u 10001 -S appuser -G appgroup

WORKDIR /app

COPY --from=builder /bin/control-plane /app/control-plane
COPY --from=builder /app/migrations    /app/migrations

USER appuser

ENV PORT=3001 \
    ENV=production \
    MIGRATIONS_PATH=/app/migrations

EXPOSE 3001

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:3001/healthz || exit 1

ENTRYPOINT ["/app/control-plane"]
