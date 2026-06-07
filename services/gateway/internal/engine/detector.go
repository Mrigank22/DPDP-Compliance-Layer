// services/gateway/internal/engine/detector.go

package engine

import (
	"encoding/json"
	"regexp"
	"strings"
	"sync"
	"unicode"
)

// DetectionResult holds a single PII match found in a payload.
type DetectionResult struct {
	PIIType    string  `json:"pii_type"`
	FieldName  string  `json:"field_name"`  // JSON key or positional descriptor
	MatchStart int     `json:"match_start"` // byte offset in source text
	MatchEnd   int     `json:"match_end"`
	Sample     string  `json:"sample"`      // first 4 + last 4 chars; rest masked
	Confidence float64 `json:"confidence"`  // 0.0–1.0
}

// Detector is a thread-safe PII detector that scans text and JSON payloads.
type Detector struct {
	patterns    map[string]*regexp.Regexp
	contextual  map[string]*regexp.Regexp
	threshold   float64
	workerCount int
	mu          sync.RWMutex
}

// NewDetector constructs a Detector with the compiled pattern sets.
func NewDetector(threshold float64, workerCount int) *Detector {
	if threshold <= 0 {
		threshold = 0.7
	}
	if workerCount <= 0 {
		workerCount = 8
	}
	return &Detector{
		patterns:    AllPatterns(),
		contextual:  ContextualPatterns(),
		threshold:   threshold,
		workerCount: workerCount,
	}
}

// ScanText scans a raw string for all PII types and returns matches above the
// confidence threshold. The field name is passed through for logging.
func (d *Detector) ScanText(text, fieldName string) []DetectionResult {
	if len(text) == 0 {
		return nil
	}

	d.mu.RLock()
	patterns := d.patterns
	contextual := d.contextual
	threshold := d.threshold
	d.mu.RUnlock()

	var results []DetectionResult

	for piiType, pattern := range patterns {
		matches := pattern.FindAllStringIndex(text, -1)
		for _, loc := range matches {
			raw := text[loc[0]:loc[1]]
			confidence := d.scoreMatch(piiType, raw, text, contextual)
			if confidence < threshold {
				continue
			}
			results = append(results, DetectionResult{
				PIIType:    piiType,
				FieldName:  fieldName,
				MatchStart: loc[0],
				MatchEnd:   loc[1],
				Sample:     safeSample(raw),
				Confidence: confidence,
			})
		}
	}
	return results
}

// ScanJSON deeply scans a JSON byte slice, visiting every string value and
// key name. Returns a flat list of all DetectionResults across the document.
func (d *Detector) ScanJSON(data []byte) []DetectionResult {
	if len(data) == 0 {
		return nil
	}

	// Fast pre-check: does the raw string contain any digits or @? If not,
	// skip PII scanning entirely (saves ~60% CPU on non-PII payloads).
	hasDigit := false
	hasAt := false
	for _, b := range data {
		if b >= '0' && b <= '9' {
			hasDigit = true
		}
		if b == '@' {
			hasAt = true
		}
		if hasDigit && hasAt {
			break
		}
	}
	if !hasDigit && !hasAt {
		return nil
	}

	// Walk the JSON tree, collecting all string values with their key paths.
	var root any
	if err := json.Unmarshal(data, &root); err != nil {
		// Not valid JSON — fall back to raw text scan
		return d.ScanText(string(data), "raw_body")
	}

	var results []DetectionResult
	d.walkJSON(root, "", &results)
	return results
}

// ScanJSONField scans only the value at a specific JSON key path, e.g. "user.address.phone".
// Used for targeted scanning when the gateway rule specifies field-level detection.
func (d *Detector) ScanJSONField(data []byte, fieldPath string) []DetectionResult {
	var root map[string]any
	if err := json.Unmarshal(data, &root); err != nil {
		return nil
	}
	val := extractField(root, strings.Split(fieldPath, "."))
	if val == nil {
		return nil
	}
	str, ok := val.(string)
	if !ok {
		b, _ := json.Marshal(val)
		str = string(b)
	}
	return d.ScanText(str, fieldPath)
}

// walkJSON recursively traverses a decoded JSON value, scanning all strings.
func (d *Detector) walkJSON(node any, path string, results *[]DetectionResult) {
	switch v := node.(type) {
	case map[string]any:
		for key, val := range v {
			childPath := path
			if childPath != "" {
				childPath += "."
			}
			childPath += key

			// Scan the key itself — sometimes PII appears in key names (rare but real)
			if len(key) > 8 {
				for _, r := range d.ScanText(key, childPath+"[key]") {
					*results = append(*results, r)
				}
			}
			d.walkJSON(val, childPath, results)
		}
	case []any:
		for i, item := range v {
			d.walkJSON(item, path, results)
			_ = i
		}
	case string:
		for _, r := range d.ScanText(v, path) {
			*results = append(*results, r)
		}
	case json.Number:
		// Scan numbers as strings — catches Aadhaar/PAN in numeric fields
		for _, r := range d.ScanText(v.String(), path) {
			*results = append(*results, r)
		}
	}
}

// scoreMatch computes a confidence score for a candidate PII match.
// Confidence is boosted when a contextual pattern also matches (proximity to keyword).
// It is reduced for very short strings or values containing only repeated digits.
func (d *Detector) scoreMatch(piiType, match, fullText string, contextual map[string]*regexp.Regexp) float64 {
	base := 0.75 // default base confidence for regex match

	switch piiType {
	case "AADHAAR":
		// Aadhaar numbers must start with 2-9 and pass Verhoeff checksum
		digits := stripNonDigits(match)
		if len(digits) != 12 {
			return 0
		}
		if !verhoeffCheck(digits) {
			base = 0.55 // likely valid but no checksum — lower confidence
		} else {
			base = 0.90
		}
	case "PAN":
		// PAN has well-defined structure; high precision pattern
		base = 0.92
	case "CREDIT_CARD":
		digits := stripNonDigits(match)
		if !luhnCheck(digits) {
			return 0 // fail Luhn → definitely not a card number
		}
		base = 0.88
	case "PHONE":
		digits := stripNonDigits(match)
		if len(digits) < 10 || isRepeating(digits) {
			return 0
		}
		base = 0.80
	case "GSTIN":
		// GSTIN first 2 digits are state code (01–37 valid)
		if !validGSTINStateCode(match) {
			base = 0.60
		} else {
			base = 0.93
		}
	case "VOTER_ID", "PASSPORT":
		// Short patterns — require contextual boost to reach threshold
		base = 0.55
	case "UPI":
		base = 0.88
	case "EMAIL":
		base = 0.85
	case "IFSC":
		base = 0.82
	case "EPFIC", "CIN":
		base = 0.91 // highly structured → high precision
	}

	// Contextual boost: if a keyword is nearby in the full text, +0.15
	if cp, ok := contextual[piiType]; ok {
		if cp.MatchString(fullText) {
			base = min64(base+0.15, 1.0)
		}
	}

	return base
}

// ---- Masking ----------------------------------------------------------------

// MaskingStrategy controls how matched values are obscured.
type MaskingStrategy string

const (
	MaskPartial  MaskingStrategy = "partial"   // preserve first N + last N chars
	MaskFull     MaskingStrategy = "full"       // replace entire value with asterisks
	MaskRedact   MaskingStrategy = "redact"     // replace with [REDACTED]
	MaskTokenize MaskingStrategy = "tokenize"   // replace with a reversible token
)

// MaskingConfig parameterises the masking strategy.
type MaskingConfig struct {
	Strategy    MaskingStrategy `json:"strategy"`
	MaskChar    string          `json:"mask_char"`     // default: *
	PreserveFirst int           `json:"preserve_first"` // chars to keep at start
	PreserveLast  int           `json:"preserve_last"`  // chars to keep at end
	RedactLabel   string        `json:"redact_label"`   // default: [REDACTED]
}

// DefaultMaskingConfig returns sensible masking defaults.
func DefaultMaskingConfig() MaskingConfig {
	return MaskingConfig{
		Strategy:     MaskPartial,
		MaskChar:     "*",
		PreserveFirst: 0,
		PreserveLast:  4,
	}
}

// MaskValue applies the masking config to a single matched value string.
func MaskValue(value string, cfg MaskingConfig) string {
	if cfg.MaskChar == "" {
		cfg.MaskChar = "*"
	}

	runes := []rune(value)
	n := len(runes)

	switch cfg.Strategy {
	case MaskFull:
		return strings.Repeat(cfg.MaskChar, n)

	case MaskRedact:
		label := cfg.RedactLabel
		if label == "" {
			label = "[REDACTED]"
		}
		return label

	case MaskTokenize:
		// Tokenization handled by TokenVault — return placeholder for inline masking
		return "[TOKEN]"

	default: // MaskPartial
		first := cfg.PreserveFirst
		last := cfg.PreserveLast

		// Validate bounds
		if first < 0 { first = 0 }
		if last < 0 { last = 0 }
		if first+last >= n {
			// Not enough characters to preserve both ends — mask all
			return strings.Repeat(cfg.MaskChar, n)
		}

		var sb strings.Builder
		// Write preserved prefix
		sb.WriteString(string(runes[:first]))
		// Write mask characters for the middle
		maskLen := n - first - last
		sb.WriteString(strings.Repeat(cfg.MaskChar, maskLen))
		// Write preserved suffix
		sb.WriteString(string(runes[n-last:]))
		return sb.String()
	}
}

// MaskJSON applies masking to all detected PII fields within a JSON document.
// Returns the modified JSON bytes and a list of field paths that were masked.
func MaskJSON(data []byte, detections []DetectionResult, cfg MaskingConfig) ([]byte, []string, error) {
	if len(detections) == 0 {
		return data, nil, nil
	}

	var root any
	if err := json.Unmarshal(data, &root); err != nil {
		// Non-JSON: apply regex-level text masking
		masked, fields := maskText(string(data), detections, cfg)
		return []byte(masked), fields, nil
	}

	maskedFields := make([]string, 0, len(detections))
	// Build a set of field paths to mask for fast lookup
	pathSet := make(map[string]MaskingConfig)
	for _, d := range detections {
		pathSet[d.FieldName] = cfg
		maskedFields = append(maskedFields, d.FieldName)
	}

	maskJSONNode(root, "", pathSet)

	out, err := json.Marshal(root)
	return out, maskedFields, err
}

// maskJSONNode recursively masks string values at matching field paths.
func maskJSONNode(node any, path string, pathSet map[string]MaskingConfig) {
	switch v := node.(type) {
	case map[string]any:
		for key := range v {
			childPath := path
			if childPath != "" {
				childPath += "."
			}
			childPath += key

			if cfg, ok := pathSet[childPath]; ok {
				if strVal, isStr := v[key].(string); isStr {
					v[key] = MaskValue(strVal, cfg)
				}
			} else {
				maskJSONNode(v[key], childPath, pathSet)
			}
		}
	case []any:
		for i := range v {
			maskJSONNode(v[i], path, pathSet)
		}
	}
}

// maskText applies regex-based text masking for non-JSON payloads.
func maskText(text string, detections []DetectionResult, cfg MaskingConfig) (string, []string) {
	// Sort detections by offset descending so we can replace without shifting indices
	sorted := make([]DetectionResult, len(detections))
	copy(sorted, detections)
	for i := 0; i < len(sorted)-1; i++ {
		for j := i + 1; j < len(sorted); j++ {
			if sorted[j].MatchStart > sorted[i].MatchStart {
				sorted[i], sorted[j] = sorted[j], sorted[i]
			}
		}
	}

	runes := []rune(text)
	fields := make([]string, 0, len(sorted))
	for _, d := range sorted {
		if d.MatchStart >= len(runes) || d.MatchEnd > len(runes) {
			continue
		}
		original := string(runes[d.MatchStart:d.MatchEnd])
		masked := MaskValue(original, cfg)
		replacement := []rune(masked)
		runes = append(runes[:d.MatchStart], append(replacement, runes[d.MatchEnd:]...)...)
		fields = append(fields, d.FieldName)
	}
	return string(runes), fields
}

// RedactJSON replaces all detected PII fields with [REDACTED] labels.
func RedactJSON(data []byte, detections []DetectionResult) ([]byte, []string, error) {
	return MaskJSON(data, detections, MaskingConfig{
		Strategy:    MaskRedact,
		RedactLabel: "[REDACTED]",
	})
}

// ---- Helpers ----------------------------------------------------------------

// safeSample returns a safe loggable representation: first 4 + "****" + last 4.
func safeSample(s string) string {
	r := []rune(s)
	n := len(r)
	if n <= 8 {
		return strings.Repeat("*", n)
	}
	return string(r[:4]) + "****" + string(r[n-4:])
}

func stripNonDigits(s string) string {
	var b strings.Builder
	for _, c := range s {
		if c >= '0' && c <= '9' {
			b.WriteRune(c)
		}
	}
	return b.String()
}

func isRepeating(digits string) bool {
	if len(digits) == 0 {
		return true
	}
	first := digits[0]
	for i := 1; i < len(digits); i++ {
		if digits[i] != first {
			return false
		}
	}
	return true
}

func validGSTINStateCode(gstin string) bool {
	if len(gstin) < 2 {
		return false
	}
	code := gstin[:2]
	validCodes := map[string]bool{
		"01": true, "02": true, "03": true, "04": true, "05": true,
		"06": true, "07": true, "08": true, "09": true, "10": true,
		"11": true, "12": true, "13": true, "14": true, "15": true,
		"16": true, "17": true, "18": true, "19": true, "20": true,
		"21": true, "22": true, "23": true, "24": true, "25": true,
		"26": true, "27": true, "28": true, "29": true, "30": true,
		"31": true, "32": true, "33": true, "34": true, "35": true,
		"36": true, "37": true,
	}
	return validCodes[code]
}

func extractField(m map[string]any, parts []string) any {
	if len(parts) == 0 {
		return nil
	}
	val, ok := m[parts[0]]
	if !ok {
		return nil
	}
	if len(parts) == 1 {
		return val
	}
	if nested, ok := val.(map[string]any); ok {
		return extractField(nested, parts[1:])
	}
	return nil
}

func min64(a, b float64) float64 {
	if a < b {
		return a
	}
	return b
}

// isLetter checks if a rune is a Unicode letter.
func isLetter(r rune) bool { return unicode.IsLetter(r) }

// ---- Luhn checksum ----------------------------------------------------------

func luhnCheck(digits string) bool {
	sum := 0
	nDigits := len(digits)
	parity := nDigits % 2
	for i, d := range digits {
		n := int(d - '0')
		if i%2 == parity {
			n *= 2
			if n > 9 {
				n -= 9
			}
		}
		sum += n
	}
	return sum%10 == 0
}

// ---- Verhoeff checksum for Aadhaar -----------------------------------------

var (
	verhoeffD = [10][10]int{
		{0, 1, 2, 3, 4, 5, 6, 7, 8, 9},
		{1, 2, 3, 4, 0, 6, 7, 8, 9, 5},
		{2, 3, 4, 0, 1, 7, 8, 9, 5, 6},
		{3, 4, 0, 1, 2, 8, 9, 5, 6, 7},
		{4, 0, 1, 2, 3, 9, 5, 6, 7, 8},
		{5, 9, 8, 7, 6, 0, 4, 3, 2, 1},
		{6, 5, 9, 8, 7, 1, 0, 4, 3, 2},
		{7, 6, 5, 9, 8, 2, 1, 0, 4, 3},
		{8, 7, 6, 5, 9, 3, 2, 1, 0, 4},
		{9, 8, 7, 6, 5, 4, 3, 2, 1, 0},
	}
	verhoeffP = [8][10]int{
		{0, 1, 2, 3, 4, 5, 6, 7, 8, 9},
		{1, 5, 7, 6, 2, 8, 3, 0, 9, 4},
		{5, 8, 0, 3, 7, 9, 6, 1, 4, 2},
		{8, 9, 1, 6, 0, 4, 3, 5, 2, 7},
		{9, 4, 5, 3, 1, 2, 6, 8, 7, 0},
		{4, 2, 8, 6, 5, 7, 3, 9, 0, 1},
		{2, 7, 9, 3, 8, 0, 6, 4, 1, 5},
		{7, 0, 4, 6, 9, 1, 3, 2, 5, 8},
	}
)

func verhoeffCheck(digits string) bool {
	c := 0
	runes := []rune(digits)
	for i := len(runes) - 1; i >= 0; i-- {
		d := int(runes[i] - '0')
		p := verhoeffP[(len(runes)-1-i)%8][d]
		c = verhoeffD[c][p]
	}
	return c == 0
}
