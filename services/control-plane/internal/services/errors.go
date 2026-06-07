// services/control-plane/internal/services/errors.go

package services

import "fmt"

// AppError is a typed domain error that carries a machine-readable code
// and a user-safe message. Handlers unwrap this to produce structured API errors.
type AppError struct {
	Code    string
	Message string
	Cause   error
}

func (e *AppError) Error() string {
	if e.Cause != nil {
		return fmt.Sprintf("%s: %s: %v", e.Code, e.Message, e.Cause)
	}
	return fmt.Sprintf("%s: %s", e.Code, e.Message)
}

func (e *AppError) Unwrap() error { return e.Cause }

// IsNotFound returns true when the error is a not-found AppError.
func IsNotFound(err error) bool {
	ae, ok := err.(*AppError)
	return ok && ae.Code == "not_found"
}

// ErrNotFound constructs a not-found AppError with a contextual message.
func ErrNotFound(resource string) *AppError {
	return &AppError{Code: "not_found", Message: resource + " not found"}
}

// ErrForbidden constructs a forbidden AppError.
func ErrForbidden(msg string) *AppError {
	return &AppError{Code: "forbidden", Message: msg}
}

// ErrConflict constructs a conflict AppError.
func ErrConflict(msg string) *AppError {
	return &AppError{Code: "conflict", Message: msg}
}

// ErrInvalidInput constructs a validation AppError.
func ErrInvalidInput(msg string) *AppError {
	return &AppError{Code: "invalid_input", Message: msg}
}
