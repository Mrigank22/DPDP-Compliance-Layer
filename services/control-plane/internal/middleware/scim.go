// services/control-plane/internal/middleware/scim.go

package middleware

import (
	"database/sql"
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"

	"github.com/datasentinel/control-plane/internal/models"
	"github.com/datasentinel/control-plane/internal/services"
)

// Context keys for SCIM-authenticated requests.
const (
	CtxSCIMTenantID = "scim_tenant_id"
	CtxSCIMConn     = "scim_conn"
)

// RequireSCIMAuth authenticates a SCIM bearer token against a tenant's SSO
// connection and stashes the resolved connection (tenant id + default role)
// for the handler. All failures use the SCIM error schema.
func RequireSCIMAuth(scim *services.SCIMService) gin.HandlerFunc {
	return func(c *gin.Context) {
		parts := strings.SplitN(c.GetHeader("Authorization"), " ", 2)
		if len(parts) != 2 || !strings.EqualFold(parts[0], "bearer") || strings.TrimSpace(parts[1]) == "" {
			WriteSCIMError(c, http.StatusUnauthorized, "missing or malformed bearer token", "")
			c.Abort()
			return
		}

		conn, err := scim.ConnectionForToken(c.Request.Context(), parts[1])
		if err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				WriteSCIMError(c, http.StatusUnauthorized, "invalid SCIM token", "")
			} else {
				WriteSCIMError(c, http.StatusInternalServerError, "authentication error", "")
			}
			c.Abort()
			return
		}

		c.Set(CtxSCIMTenantID, conn.TenantID)
		c.Set(CtxSCIMConn, conn)
		c.Next()
	}
}

// WriteSCIMError writes a SCIM 2.0 error response (application/scim+json).
func WriteSCIMError(c *gin.Context, status int, detail, scimType string) {
	c.Header("Content-Type", "application/scim+json")
	c.JSON(status, &models.SCIMError{
		Schemas:  []string{models.SCIMErrorSchema},
		Detail:   detail,
		Status:   strconv.Itoa(status),
		ScimType: scimType,
	})
}
