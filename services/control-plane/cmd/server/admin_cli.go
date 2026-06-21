// services/control-plane/cmd/server/admin_cli.go

package main

import (
	"context"
	"crypto/rand"
	"flag"
	"fmt"
	"math/big"
	"os"
	"strings"
	"time"

	"github.com/datasentinel/control-plane/internal/config"
	"github.com/datasentinel/control-plane/internal/db"
	"github.com/datasentinel/control-plane/internal/models"
	"github.com/datasentinel/control-plane/internal/services"
)

// runCreateAdmin is the secure, out-of-band bootstrap for platform super-admins.
// It can only be run by someone with shell access to the server and the database
// credentials (DATABASE_URL) — there is no public/API path to create the first
// super-admin. If no password is supplied (flag or DS_ADMIN_PASSWORD env) a
// strong random one is generated and printed exactly once.
//
//	control-plane create-admin --email you@datasentinel.io --name "Your Name"
func runCreateAdmin(args []string) int {
	fs := flag.NewFlagSet("create-admin", flag.ContinueOnError)
	email := fs.String("email", "", "platform admin email (required)")
	name := fs.String("name", "", "full name (required)")
	password := fs.String("password", "", "password (optional; falls back to DS_ADMIN_PASSWORD, else a strong one is generated)")
	if err := fs.Parse(args); err != nil {
		return 2
	}
	if strings.TrimSpace(*email) == "" || strings.TrimSpace(*name) == "" {
		fmt.Fprintln(os.Stderr, "error: --email and --name are required")
		fs.Usage()
		return 2
	}

	cfg, err := config.Load()
	if err != nil {
		fmt.Fprintf(os.Stderr, "config: %v\n", err)
		return 1
	}
	log := buildLogger(cfg)
	defer func() { _ = log.Sync() }()

	pg, err := db.NewPostgres(cfg, log)
	if err != nil {
		fmt.Fprintf(os.Stderr, "database: %v\n", err)
		return 1
	}
	defer func() { _ = pg.Close() }()

	svc := services.NewPlatformAdminService(pg, cfg, log, nil, nil)
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	if err := svc.EnsureSchema(ctx); err != nil {
		fmt.Fprintf(os.Stderr, "schema: %v\n", err)
		return 1
	}

	pw := *password
	generated := false
	if pw == "" {
		pw = os.Getenv("DS_ADMIN_PASSWORD")
	}
	if pw == "" {
		pw, err = genStrongPassword(24)
		if err != nil {
			fmt.Fprintf(os.Stderr, "password generation: %v\n", err)
			return 1
		}
		generated = true
	}

	admin, err := svc.CreateAdmin(ctx, &models.CreatePlatformAdminInput{
		Email:    *email,
		FullName: *name,
		Password: pw,
	}, nil, "", "cli")
	if err != nil {
		fmt.Fprintf(os.Stderr, "create admin: %v\n", err)
		return 1
	}

	fmt.Println("✓ Platform super-admin created")
	fmt.Printf("  id:    %s\n", admin.ID)
	fmt.Printf("  email: %s\n", admin.Email)
	if generated {
		fmt.Println()
		fmt.Println("  ⚠  Generated password (shown ONCE — store it securely now):")
		fmt.Printf("     %s\n", pw)
	}
	fmt.Println()
	fmt.Println("  Sign in at /admin/login, then enable MFA immediately.")
	return 0
}

// genStrongPassword returns a cryptographically-random password that satisfies
// the platform password policy (upper, lower, digit, symbol, length >= 12).
func genStrongPassword(n int) (string, error) {
	const (
		upper = "ABCDEFGHJKLMNPQRSTUVWXYZ"
		lower = "abcdefghijkmnpqrstuvwxyz"
		digit = "23456789"
		sym   = "!@#$%^&*-_=+?"
	)
	all := upper + lower + digit + sym
	if n < 12 {
		n = 12
	}
	pick := func(set string) (byte, error) {
		idx, err := rand.Int(rand.Reader, big.NewInt(int64(len(set))))
		if err != nil {
			return 0, err
		}
		return set[idx.Int64()], nil
	}
	buf := make([]byte, 0, n)
	for _, set := range []string{upper, lower, digit, sym} {
		ch, err := pick(set)
		if err != nil {
			return "", err
		}
		buf = append(buf, ch)
	}
	for len(buf) < n {
		ch, err := pick(all)
		if err != nil {
			return "", err
		}
		buf = append(buf, ch)
	}
	// Fisher–Yates shuffle so the guaranteed class chars are not positional.
	for i := len(buf) - 1; i > 0; i-- {
		jBig, err := rand.Int(rand.Reader, big.NewInt(int64(i+1)))
		if err != nil {
			return "", err
		}
		j := jBig.Int64()
		buf[i], buf[j] = buf[j], buf[i]
	}
	return string(buf), nil
}
