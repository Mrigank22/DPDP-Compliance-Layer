// services/control-plane/internal/services/notification_service.go

package services

import (
	"context"
	"fmt"

	"github.com/wneessen/go-mail"
	"go.uber.org/zap"

	"github.com/datasentinel/control-plane/internal/config"
)

// NotificationService sends transactional emails and (optionally) Slack / webhook alerts.
type NotificationService struct {
	cfg *config.Config
	log *zap.Logger
}

// NewNotificationService creates a NotificationService.
func NewNotificationService(cfg *config.Config, log *zap.Logger) *NotificationService {
	return &NotificationService{cfg: cfg, log: log}
}

// SendPasswordResetEmail sends a password-reset link to the user.
func (n *NotificationService) SendPasswordResetEmail(ctx context.Context, email, name, rawToken string) {
	resetURL := fmt.Sprintf("%s/auth/reset-password?token=%s", n.cfg.BaseURL, rawToken)
	subject := "Reset your DataSentinel password"
	body := fmt.Sprintf(`
<p>Hi %s,</p>
<p>You requested a password reset for your DataSentinel account.</p>
<p><a href="%s">Click here to reset your password</a></p>
<p>This link expires in 1 hour. If you did not request this, you can safely ignore this email.</p>
<p>— The DataSentinel Team</p>
`, name, resetURL)

	if err := n.sendEmail(email, subject, body); err != nil {
		n.log.Error("failed to send password reset email", zap.String("email", email), zap.Error(err))
	}
}

// SendInviteEmail sends a team invitation link.
func (n *NotificationService) SendInviteEmail(ctx context.Context, email, name, rawToken string) {
	inviteURL := fmt.Sprintf("%s/auth/accept-invite/%s", n.cfg.BaseURL, rawToken)
	subject := "You've been invited to DataSentinel"
	body := fmt.Sprintf(`
<p>Hi %s,</p>
<p>You've been invited to join your team on DataSentinel — India's data privacy compliance platform.</p>
<p><a href="%s">Accept your invitation</a></p>
<p>This invitation expires in 72 hours.</p>
<p>— The DataSentinel Team</p>
`, name, inviteURL)

	if err := n.sendEmail(email, subject, body); err != nil {
		n.log.Error("failed to send invite email", zap.String("email", email), zap.Error(err))
	}
}

// SendAlertEmail sends a compliance alert notification.
func (n *NotificationService) SendAlertEmail(ctx context.Context, toEmail, subject, body string) {
	if err := n.sendEmail(toEmail, subject, body); err != nil {
		n.log.Error("failed to send alert email", zap.String("email", toEmail), zap.Error(err))
	}
}

func (n *NotificationService) sendEmail(to, subject, htmlBody string) error {
	if n.cfg.SMTPHost == "" {
		n.log.Debug("SMTP not configured — skipping email", zap.String("to", to), zap.String("subject", subject))
		return nil
	}

	m := mail.NewMsg()
	if err := m.From(n.cfg.SMTPFrom); err != nil {
		return fmt.Errorf("invalid from address: %w", err)
	}
	if err := m.To(to); err != nil {
		return fmt.Errorf("invalid to address: %w", err)
	}
	m.Subject(subject)
	m.SetBodyString(mail.TypeTextHTML, htmlBody)

	c, err := mail.NewClient(
		n.cfg.SMTPHost,
		mail.WithPort(n.cfg.SMTPPort),
		mail.WithSMTPAuth(mail.SMTPAuthPlain),
		mail.WithUsername(n.cfg.SMTPUser),
		mail.WithPassword(n.cfg.SMTPPassword),
	)
	if err != nil {
		return fmt.Errorf("failed to create mail client: %w", err)
	}
	return c.DialAndSend(m)
}
