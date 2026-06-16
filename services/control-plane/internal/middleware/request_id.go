// services/control-plane/internal/middleware/request_id.go

package middleware

import (
	"fmt"
	"net/http"
	"runtime"
	"runtime/debug"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"go.uber.org/zap"

	"github.com/datasentinel/control-plane/internal/models"
)

// RequestID injects a UUID request ID into every request context and response header.
func RequestID() gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.GetHeader("X-Request-ID")
		if id == "" {
			id = uuid.New().String()
		}
		c.Set(CtxRequestID, id)
		c.Header("X-Request-ID", id)
		c.Next()
	}
}

// Logger logs every request with structured fields and comprehensive context.
func Logger(log *zap.Logger) gin.HandlerFunc {
	return func(c *gin.Context) {
		// Make the logger available to downstream handlers/helpers so they can
		// emit correlated, structured error logs.
		c.Set(CtxLogger, log)

		start := time.Now()
		path := c.Request.URL.Path
		query := c.Request.URL.RawQuery
		method := c.Request.Method

		c.Next()

		latency := time.Since(start)
		status := c.Writer.Status()
		requestID, _ := c.Get(CtxRequestID)
		userID, _ := c.Get(CtxUserID)
		tenantID, _ := c.Get(CtxTenantID)
		ridStr, _ := requestID.(string)

		fields := []zap.Field{
			zap.String("request_id", ridStr),
			zap.Int("status", status),
			zap.String("method", method),
			zap.String("path", path),
			zap.Duration("latency", latency),
			zap.Int64("latency_ms", latency.Milliseconds()),
			zap.String("ip", c.ClientIP()),
			zap.String("user_agent", c.Request.UserAgent()),
		}

		// Add user/tenant context if available
		if userID != nil {
			fields = append(fields, zap.String("user_id", fmt.Sprintf("%v", userID)))
		}
		if tenantID != nil {
			fields = append(fields, zap.String("tenant_id", fmt.Sprintf("%v", tenantID)))
		}

		if query != "" {
			fields = append(fields, zap.String("query", query))
		}

		// Log response size
		if c.Writer.Size() > 0 {
			fields = append(fields, zap.Int("response_size_bytes", c.Writer.Size()))
		}

		// Log any errors attached to context
		if len(c.Errors) > 0 {
			var errorMsgs []string
			for _, err := range c.Errors {
				errorMsgs = append(errorMsgs, err.Error())
			}
			fields = append(fields, zap.Strings("errors", errorMsgs))
		}

		// Log at appropriate level based on status code
		if status >= 500 {
			log.Error("request", fields...)
		} else if status >= 400 {
			log.Warn("request", fields...)
		} else {
			log.Info("request", fields...)
		}
	}
}

// Recovery recovers from panics and returns a 500 response with detailed logging.
func Recovery(log *zap.Logger) gin.HandlerFunc {
	return func(c *gin.Context) {
		defer func() {
			if r := recover(); r != nil {
				requestID, _ := c.Get(CtxRequestID)
				userID, _ := c.Get(CtxUserID)
				tenantID, _ := c.Get(CtxTenantID)
				ridStr, _ := requestID.(string)

				// Get stack trace
				stackTrace := string(debug.Stack())

				// Get caller information
				pc, file, line, ok := runtime.Caller(3)
				var funcName string
				if ok {
					funcName = runtime.FuncForPC(pc).Name()
				}

				// Log error with full context
				log.Error("panic recovered",
					zap.Any("panic", r),
					zap.String("request_id", ridStr),
					zap.String("method", c.Request.Method),
					zap.String("path", c.Request.URL.Path),
					zap.String("query", c.Request.URL.RawQuery),
					zap.String("user_id", fmt.Sprintf("%v", userID)),
					zap.String("tenant_id", fmt.Sprintf("%v", tenantID)),
					zap.String("caller_file", file),
					zap.Int("caller_line", line),
					zap.String("caller_func", funcName),
					zap.String("stack_trace", stackTrace),
					zap.String("ip", c.ClientIP()),
					zap.String("user_agent", c.Request.UserAgent()),
				)

				c.AbortWithStatusJSON(http.StatusInternalServerError, models.APIResponse{
					RequestID: ridStr,
					Error: &models.APIError{
						Code:    models.ErrCodeInternalError,
						Message: "an unexpected error occurred",
					},
				})
			}
		}()
		c.Next()
	}
}
