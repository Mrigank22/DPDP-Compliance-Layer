// services/control-plane/internal/models/pagination.go

package models

// Pagination holds page metadata returned in every list response.
type Pagination struct {
	Page       int   `json:"page"`
	PageSize   int   `json:"page_size"`
	TotalItems int64 `json:"total_items"`
	TotalPages int   `json:"total_pages"`
	HasNext    bool  `json:"has_next"`
	HasPrev    bool  `json:"has_prev"`
}

// NewPagination constructs a Pagination struct from raw values.
func NewPagination(page, pageSize int, total int64) Pagination {
	if page < 1 {
		page = 1
	}
	if pageSize < 1 {
		pageSize = 20
	}
	totalPages := int(total) / pageSize
	if int(total)%pageSize != 0 {
		totalPages++
	}
	return Pagination{
		Page:       page,
		PageSize:   pageSize,
		TotalItems: total,
		TotalPages: totalPages,
		HasNext:    page < totalPages,
		HasPrev:    page > 1,
	}
}

// Offset returns the SQL OFFSET for the current page.
func (p *Pagination) Offset() int {
	return (p.Page - 1) * p.PageSize
}

// ---- API envelope -----------------------------------------------------------

// APIResponse is the standard JSON envelope for all control-plane responses.
type APIResponse struct {
	Data       any         `json:"data"`
	Meta       *MetaBlock  `json:"meta,omitempty"`
	Error      *APIError   `json:"error,omitempty"`
	RequestID  string      `json:"request_id"`
}

// MetaBlock carries pagination and any supplementary metadata.
type MetaBlock struct {
	Pagination *Pagination    `json:"pagination,omitempty"`
	Extra      map[string]any `json:"extra,omitempty"`
}

// APIError is the structured error payload returned on non-2xx responses.
type APIError struct {
	Code    string         `json:"code"`    // machine-readable error code, e.g. "invalid_input"
	Message string         `json:"message"` // human-readable; safe to expose to clients
	Details map[string]any `json:"details,omitempty"` // validation field errors, etc.
}

// Standard error codes
const (
	ErrCodeInvalidInput      = "invalid_input"
	ErrCodeUnauthorized      = "unauthorized"
	ErrCodeForbidden         = "forbidden"
	ErrCodeNotFound          = "not_found"
	ErrCodeConflict          = "conflict"
	ErrCodeInternalError     = "internal_error"
	ErrCodeRateLimited       = "rate_limited"
	ErrCodeAccountLocked     = "account_locked"
	ErrCodeMFARequired       = "mfa_required"
	ErrCodeTokenExpired      = "token_expired"
	ErrCodeInvalidToken      = "invalid_token"
)
