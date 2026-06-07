// services/control-plane/internal/models/password_reset_token.go

package models

import (
	"time"

	"github.com/uptrace/bun"
)

// PasswordResetToken stores a one-time-use hashed password-reset or invite token.
// The same table is reused for invite acceptance tokens.
type PasswordResetToken struct {
	bun.BaseModel `bun:"table:password_reset_tokens,alias:prt"`

	ID        string     `bun:"id,pk,type:uuid,default:uuid_generate_v4()" json:"id"`
	UserID    string     `bun:"user_id,notnull,type:uuid"                  json:"user_id"`
	TokenHash string     `bun:"token_hash,notnull,unique"                  json:"-"`
	ExpiresAt time.Time  `bun:"expires_at,notnull"                         json:"expires_at"`
	Used      bool       `bun:"used,notnull,default:false"                 json:"-"`
	UsedAt    *time.Time `bun:"used_at"                                    json:"-"`
	CreatedAt time.Time  `bun:"created_at,notnull,default:now()"           json:"created_at"`
}
