// services/control-plane/internal/middleware/require_role_test.go

package middleware_test

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"

	"github.com/datasentinel/control-plane/internal/middleware"
	"github.com/datasentinel/control-plane/internal/models"
)

// TestRequireRole verifies the role hierarchy (owner > admin > analyst > viewer)
// is enforced: a caller must hold AT LEAST the required role.
func TestRequireRole(t *testing.T) {
	gin.SetMode(gin.TestMode)

	cases := []struct {
		name       string
		userRole   string
		minRole    string
		wantStatus int
	}{
		{"viewer→viewer ok", models.RoleViewer, models.RoleViewer, http.StatusOK},
		{"viewer→analyst denied", models.RoleViewer, models.RoleAnalyst, http.StatusForbidden},
		{"viewer→admin denied", models.RoleViewer, models.RoleAdmin, http.StatusForbidden},
		{"analyst→analyst ok", models.RoleAnalyst, models.RoleAnalyst, http.StatusOK},
		{"analyst→admin denied", models.RoleAnalyst, models.RoleAdmin, http.StatusForbidden},
		{"admin→analyst ok", models.RoleAdmin, models.RoleAnalyst, http.StatusOK},
		{"admin→admin ok", models.RoleAdmin, models.RoleAdmin, http.StatusOK},
		{"admin→owner denied", models.RoleAdmin, models.RoleOwner, http.StatusForbidden},
		{"owner→admin ok", models.RoleOwner, models.RoleAdmin, http.StatusOK},
		{"owner→owner ok", models.RoleOwner, models.RoleOwner, http.StatusOK},
		{"unknown role denied", "guest", models.RoleViewer, http.StatusForbidden},
		{"empty role denied", "", models.RoleViewer, http.StatusForbidden},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			r := gin.New()
			r.Use(func(ctx *gin.Context) {
				ctx.Set(middleware.CtxUserRole, c.userRole)
				ctx.Next()
			})
			r.GET("/x", middleware.RequireRole(c.minRole), func(ctx *gin.Context) {
				ctx.Status(http.StatusOK)
			})

			w := httptest.NewRecorder()
			req := httptest.NewRequest(http.MethodGet, "/x", nil)
			r.ServeHTTP(w, req)

			if w.Code != c.wantStatus {
				t.Errorf("status = %d, want %d", w.Code, c.wantStatus)
			}
		})
	}
}
