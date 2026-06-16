// services/gateway/internal/metrics/metrics.go
//
// A dependency-free Prometheus exposition for the gateway. Counters are bounded
// in cardinality (action names and PII types are a small fixed set), so plain
// maps under a mutex are more than sufficient and avoid pulling in a metrics SDK.

package metrics

import (
	"fmt"
	"io"
	"net/http"
	"sort"
	"sync"
	"time"
)

// Metrics aggregates gateway counters for Prometheus scraping.
type Metrics struct {
	mu               sync.Mutex
	start            time.Time
	requestsByAction map[string]uint64
	piiByType        map[string]uint64
	blocks           uint64
	llmCalls         uint64
	latencySumMs     uint64
	latencyCount     uint64
	policyCacheAge   func() float64 // optional gauge provider
}

// New creates a Metrics registry.
func New() *Metrics {
	return &Metrics{
		start:            time.Now(),
		requestsByAction: make(map[string]uint64),
		piiByType:        make(map[string]uint64),
	}
}

// SetPolicyCacheAgeFunc installs a provider for the policy cache age gauge.
func (m *Metrics) SetPolicyCacheAgeFunc(f func() float64) {
	m.mu.Lock()
	m.policyCacheAge = f
	m.mu.Unlock()
}

// RecordRequest records one processed request.
func (m *Metrics) RecordRequest(action string, latencyMs uint64, piiTypes []string, blocked, wasLLM bool) {
	if action == "" {
		action = "allow"
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	m.requestsByAction[action]++
	m.latencySumMs += latencyMs
	m.latencyCount++
	if blocked {
		m.blocks++
	}
	if wasLLM {
		m.llmCalls++
	}
	for _, t := range piiTypes {
		m.piiByType[t]++
	}
}

// Handler returns an http.Handler that writes the Prometheus exposition.
func (m *Metrics) Handler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "text/plain; version=0.0.4; charset=utf-8")
		m.write(w)
	})
}

func (m *Metrics) write(w io.Writer) {
	m.mu.Lock()
	defer m.mu.Unlock()

	fmt.Fprintln(w, "# HELP gateway_requests_total Total proxied requests by action taken.")
	fmt.Fprintln(w, "# TYPE gateway_requests_total counter")
	for _, action := range sortedKeys(m.requestsByAction) {
		fmt.Fprintf(w, "gateway_requests_total{action=%q} %d\n", action, m.requestsByAction[action])
	}

	fmt.Fprintln(w, "# HELP gateway_pii_detections_total PII detections by type.")
	fmt.Fprintln(w, "# TYPE gateway_pii_detections_total counter")
	for _, t := range sortedKeys(m.piiByType) {
		fmt.Fprintf(w, "gateway_pii_detections_total{type=%q} %d\n", t, m.piiByType[t])
	}

	fmt.Fprintln(w, "# HELP gateway_blocks_total Requests/responses blocked by policy.")
	fmt.Fprintln(w, "# TYPE gateway_blocks_total counter")
	fmt.Fprintf(w, "gateway_blocks_total %d\n", m.blocks)

	fmt.Fprintln(w, "# HELP gateway_llm_calls_total LLM-destined requests processed.")
	fmt.Fprintln(w, "# TYPE gateway_llm_calls_total counter")
	fmt.Fprintf(w, "gateway_llm_calls_total %d\n", m.llmCalls)

	fmt.Fprintln(w, "# HELP gateway_processing_latency_ms Summed and counted processing latency.")
	fmt.Fprintln(w, "# TYPE gateway_processing_latency_ms summary")
	fmt.Fprintf(w, "gateway_processing_latency_ms_sum %d\n", m.latencySumMs)
	fmt.Fprintf(w, "gateway_processing_latency_ms_count %d\n", m.latencyCount)

	if m.policyCacheAge != nil {
		fmt.Fprintln(w, "# HELP gateway_policy_cache_age_seconds Age of the cached policy set.")
		fmt.Fprintln(w, "# TYPE gateway_policy_cache_age_seconds gauge")
		fmt.Fprintf(w, "gateway_policy_cache_age_seconds %.1f\n", m.policyCacheAge())
	}

	fmt.Fprintln(w, "# HELP gateway_uptime_seconds Process uptime.")
	fmt.Fprintln(w, "# TYPE gateway_uptime_seconds gauge")
	fmt.Fprintf(w, "gateway_uptime_seconds %.0f\n", time.Since(m.start).Seconds())
}

func sortedKeys(m map[string]uint64) []string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	return keys
}
