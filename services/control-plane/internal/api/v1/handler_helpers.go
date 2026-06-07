// services/control-plane/internal/api/v1/handler_helpers.go

package v1

import (
	"errors"
	"fmt"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/go-playground/validator/v10"
	"go.uber.org/zap"

	"github.com/datasentinel/control-plane/internal/middleware"
	"github.com/datasentinel/control-plane/internal/models"
	"github.com/datasentinel/control-plane/internal/services"
)

var validate = validator.New()

// ok sends a 200 JSON response.
func ok(c *gin.Context, data any) {
	respond(c, http.StatusOK, data, nil, nil)
}

// created sends a 201 JSON response.
func created(c *gin.Context, data any) {
	respond(c, http.StatusCreated, data, nil, nil)
}

// noContent sends 204 No Content.
func noContent(c *gin.Context) {
	c.Status(http.StatusNoContent)
}

// okPaginated sends a 200 response with pagination metadata.
func okPaginated(c *gin.Context, data any, pagination models.Pagination) {
	respond(c, http.StatusOK, data, &models.MetaBlock{Pagination: &pagination}, nil)
}

func respond(c *gin.Context, status int, data any, meta *models.MetaBlock, apiErr *models.APIError) {
	requestID, _ := c.Get(middleware.CtxRequestID)
	rid, _ := requestID.(string)
	c.JSON(status, models.APIResponse{
		Data:      data,
		Meta:      meta,
		Error:     apiErr,
		RequestID: rid,
	})
}

// handleError maps service/domain errors to HTTP responses with detailed logging.
func handleError(c *gin.Context, err error) {
	requestID, _ := c.Get(middleware.CtxRequestID)
	rid, _ := requestID.(string)

	var ae *services.AppError
	if errors.As(err, &ae) {
		status := appErrorToStatus(ae.Code)

		// Log business logic errors with context
		logErrorWithContext(c, fmt.Sprintf("business error: %s", ae.Code), err, status)

		c.AbortWithStatusJSON(status, models.APIResponse{
			RequestID: rid,
			Error:     &models.APIError{Code: ae.Code, Message: ae.Message},
		})
		return
	}

	// Validation errors from go-playground/validator
	var ve validator.ValidationErrors
	if errors.As(err, &ve) {
		details := make(map[string]any, len(ve))
		for _, fe := range ve {
			details[fe.Field()] = fe.Tag()
		}

		// Log validation errors
		logErrorWithContext(c, "validation error", err, http.StatusBadRequest)

		c.AbortWithStatusJSON(http.StatusBadRequest, models.APIResponse{
			RequestID: rid,
			Error: &models.APIError{
				Code:    models.ErrCodeInvalidInput,
				Message: "validation failed",
				Details: details,
			},
		})
		return
	}

	// Generic fallback
	logErrorWithContext(c, "unhandled error", err, http.StatusInternalServerError)

	c.AbortWithStatusJSON(http.StatusInternalServerError, models.APIResponse{
		RequestID: rid,
		Error:     &models.APIError{Code: models.ErrCodeInternalError, Message: "internal server error"},
	})
}

// logErrorWithContext logs an error with full request context.
func logErrorWithContext(c *gin.Context, message string, err error, status int) {
	requestID, _ := c.Get(middleware.CtxRequestID)
	userID, _ := c.Get(middleware.CtxUserID)
	tenantID, _ := c.Get(middleware.CtxTenantID)

	fields := []zap.Field{
		zap.String("request_id", requestID.(string)),
		zap.Int("status", status),
		zap.String("method", c.Request.Method),
		zap.String("path", c.Request.URL.Path),
		zap.String("query", c.Request.URL.RawQuery),
		zap.String("ip", c.ClientIP()),
		zap.Error(err),
	}

	if userID != nil {
		fields = append(fields, zap.String("user_id", fmt.Sprintf("%v", userID)))
	}
	if tenantID != nil {
		fields = append(fields, zap.String("tenant_id", fmt.Sprintf("%v", tenantID)))
	}

	// Use the logger from gin internal context if available, otherwise create a new one
	if log, ok := c.Get("_logger"); ok {
		if zapLog, ok := log.(*zap.Logger); ok {
			zapLog.Error(message, fields...)
			return
		}
	}

	// Fallback: use basic logging (in case zap logger not available)
	_ = fmt.Errorf("%s: %w", message, err)
}

func appErrorToStatus(code string) int {
	switch code {
	case models.ErrCodeNotFound:
		return http.StatusNotFound
	case models.ErrCodeUnauthorized, models.ErrCodeInvalidToken, models.ErrCodeTokenExpired,
		models.ErrCodeAccountLocked, models.ErrCodeMFARequired:
		return http.StatusUnauthorized
	case models.ErrCodeForbidden:
		return http.StatusForbidden
	case models.ErrCodeConflict:
		return http.StatusConflict
	case models.ErrCodeInvalidInput:
		return http.StatusBadRequest
	case models.ErrCodeRateLimited:
		return http.StatusTooManyRequests
	default:
		return http.StatusInternalServerError
	}
}

// bindAndValidate decodes the JSON body into dst and runs validation tags.
func bindAndValidate(c *gin.Context, dst any) bool {
	if err := c.ShouldBindJSON(dst); err != nil {
		handleError(c, services.ErrInvalidInput(err.Error()))
		return false
	}
	if err := validate.Struct(dst); err != nil {
		handleError(c, err)
		return false
	}
	return true
}

// pagination extracts page/page_size from query params with safe defaults.
func pagination(c *gin.Context) (int, int) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))
	if page < 1 { page = 1 }
	if pageSize < 1 || pageSize > 100 { pageSize = 20 }
	return page, pageSize
}
