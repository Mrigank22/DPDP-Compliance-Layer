// services/control-plane/internal/services/ai_pricing.go

package services

import "strings"

// modelPrice is approximate public list pricing in USD per 1,000,000 tokens
// (input, output). Surfaced as "estimated" in the UI — update as providers
// change prices.
type modelPrice struct {
	match  string
	inUSD  float64
	outUSD float64
}

// Ordered most-specific-first; the first substring match on the (lowercased)
// model name wins.
var modelPrices = []modelPrice{
	{"gpt-4o-mini", 0.15, 0.60},
	{"gpt-4o", 2.50, 10.00},
	{"gpt-4.1-mini", 0.40, 1.60},
	{"gpt-4.1", 2.00, 8.00},
	{"gpt-4-turbo", 10.00, 30.00},
	{"gpt-4", 30.00, 60.00},
	{"gpt-3.5", 0.50, 1.50},
	{"o1-mini", 1.10, 4.40},
	{"o1", 15.00, 60.00},
	{"o3-mini", 1.10, 4.40},
	{"claude-3-5-haiku", 0.80, 4.00},
	{"claude-3-5-sonnet", 3.00, 15.00},
	{"claude-3-7-sonnet", 3.00, 15.00},
	{"claude-3-opus", 15.00, 75.00},
	{"claude-3-haiku", 0.25, 1.25},
	{"claude-3-sonnet", 3.00, 15.00},
	{"claude", 3.00, 15.00},
	{"gemini-1.5-flash", 0.075, 0.30},
	{"gemini-1.5-pro", 1.25, 5.00},
	{"gemini-2.0-flash", 0.10, 0.40},
	{"gemini", 0.50, 1.50},
	{"mistral-large", 2.00, 6.00},
	{"mistral", 0.25, 0.75},
	{"llama", 0.20, 0.20},
	{"command-r-plus", 2.50, 10.00},
	{"command", 0.50, 1.50},
}

const (
	defaultInUSDPer1M  = 0.50
	defaultOutUSDPer1M = 1.50
)

// estimateCostUSD returns the approximate cost for a model's token usage, plus
// whether a model-specific price was matched (vs the generic fallback).
func estimateCostUSD(model string, promptTokens, completionTokens int64) (float64, bool) {
	m := strings.ToLower(strings.TrimSpace(model))
	inP, outP, priced := defaultInUSDPer1M, defaultOutUSDPer1M, false
	if m != "" {
		for _, p := range modelPrices {
			if strings.Contains(m, p.match) {
				inP, outP, priced = p.inUSD, p.outUSD, true
				break
			}
		}
	}
	cost := float64(promptTokens)/1e6*inP + float64(completionTokens)/1e6*outP
	return cost, priced
}
