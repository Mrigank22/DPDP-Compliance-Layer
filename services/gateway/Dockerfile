# services/gateway/Dockerfile

FROM golang:1.22-alpine AS builder
RUN apk add --no-cache git ca-certificates tzdata
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 \
    go build -ldflags="-w -s" -o /bin/gateway ./cmd/server

FROM alpine:3.20 AS runtime
RUN apk add --no-cache ca-certificates tzdata curl && \
    addgroup -g 10001 -S appgroup && \
    adduser  -u 10001 -S appuser -G appgroup
WORKDIR /app
COPY --from=builder /bin/gateway /app/gateway
USER appuser
ENV HTTP_PORT=8080 ENV=production
EXPOSE 8080 8443
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8080/healthz || exit 1
ENTRYPOINT ["/app/gateway"]
