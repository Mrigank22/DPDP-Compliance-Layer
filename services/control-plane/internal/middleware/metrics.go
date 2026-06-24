// services/control-plane/internal/middleware/metrics.go
//
// Prometheus instrumentation for the control-plane HTTP API. We expose only the
// metrics that matter for an API service — request rate, error rate and latency
// — keyed by the matched route template (bounded cardinality) plus the Go
// runtime/process metrics the client registers by default.

package middleware

import (
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

var (
	httpRequestsTotal = promauto.NewCounterVec(
		prometheus.CounterOpts{
			Name: "http_requests_total",
			Help: "Total HTTP requests by method, route and status code.",
		},
		[]string{"method", "route", "status"},
	)

	httpRequestDuration = promauto.NewHistogramVec(
		prometheus.HistogramOpts{
			Name:    "http_request_duration_seconds",
			Help:    "HTTP request latency in seconds by method and route.",
			Buckets: prometheus.DefBuckets,
		},
		[]string{"method", "route"},
	)
)

// Metrics records request count and latency for every matched route.
func Metrics() gin.HandlerFunc {
	return func(c *gin.Context) {
		route := c.FullPath()
		if route == "/metrics" {
			c.Next()
			return
		}
		start := time.Now()
		c.Next()
		if route == "" {
			route = "unmatched"
		}
		httpRequestsTotal.WithLabelValues(c.Request.Method, route, strconv.Itoa(c.Writer.Status())).Inc()
		httpRequestDuration.WithLabelValues(c.Request.Method, route).Observe(time.Since(start).Seconds())
	}
}

// PrometheusHandler serves the Prometheus exposition at /metrics.
func PrometheusHandler() gin.HandlerFunc {
	return gin.WrapH(promhttp.Handler())
}
