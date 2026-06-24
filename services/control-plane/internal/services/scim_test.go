// services/control-plane/internal/services/scim_test.go

package services

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/datasentinel/control-plane/internal/models"
)

func TestToSCIMUser(t *testing.T) {
	now := time.Date(2026, 2, 3, 4, 5, 6, 0, time.UTC)
	u := &models.User{
		ID:        "user-123",
		Email:     "jane.doe@acme.com",
		FullName:  "Jane Doe",
		IsActive:  true,
		CreatedAt: now,
		UpdatedAt: now,
	}
	s := toSCIMUser(u)

	if s.UserName != "jane.doe@acme.com" {
		t.Errorf("userName = %q", s.UserName)
	}
	if s.ID != "user-123" || !s.Active {
		t.Errorf("id/active wrong: %+v", s)
	}
	if s.Name == nil || s.Name.GivenName != "Jane" || s.Name.FamilyName != "Doe" {
		t.Errorf("name split wrong: %+v", s.Name)
	}
	if len(s.Emails) != 1 || s.Emails[0].Value != u.Email || !s.Emails[0].Primary {
		t.Errorf("emails wrong: %+v", s.Emails)
	}
	if len(s.Schemas) != 1 || s.Schemas[0] != models.SCIMUserSchema {
		t.Errorf("schemas wrong: %+v", s.Schemas)
	}
	if s.Meta == nil || s.Meta.ResourceType != "User" || s.Meta.Location != "/scim/v2/Users/user-123" {
		t.Errorf("meta wrong: %+v", s.Meta)
	}
}

func TestSplitName(t *testing.T) {
	cases := []struct{ in, given, family string }{
		{"Jane Doe", "Jane", "Doe"},
		{"Cher", "Cher", ""},
		{"", "", ""},
		{"Mary Jane Watson", "Mary", "Jane Watson"},
		{"  Padded  Name  ", "Padded", "Name"},
	}
	for _, c := range cases {
		g, f := splitName(c.in)
		if g != c.given || f != c.family {
			t.Errorf("splitName(%q) = (%q,%q), want (%q,%q)", c.in, g, f, c.given, c.family)
		}
	}
}

func TestParseSCIMBool(t *testing.T) {
	cases := []struct {
		raw  string
		want bool
		ok   bool
	}{
		{`true`, true, true},
		{`false`, false, true},
		{`"true"`, true, true},
		{`"False"`, false, true},
		{`1`, true, true},
		{`0`, false, true},
		{`maybe`, false, false},
	}
	for _, c := range cases {
		got, err := parseSCIMBool([]byte(c.raw))
		if (err == nil) != c.ok {
			t.Errorf("parseSCIMBool(%q) ok=%v, want %v (err=%v)", c.raw, err == nil, c.ok, err)
			continue
		}
		if c.ok && got != c.want {
			t.Errorf("parseSCIMBool(%q) = %v, want %v", c.raw, got, c.want)
		}
	}
}

// TestApplyPatchActiveDeprovision is the critical deprovisioning case:
// `replace active=false` must flip the user inactive.
func TestApplyPatchActiveDeprovision(t *testing.T) {
	u := &models.User{IsActive: true, FullName: "Jane Doe"}
	op := models.SCIMPatchOperation{Op: "replace", Path: "active", Value: json.RawMessage(`false`)}
	if err := applyPatchValue(u, op); err != nil {
		t.Fatalf("applyPatchValue: %v", err)
	}
	if u.IsActive {
		t.Fatal("active=false patch did not deactivate the user")
	}
}

func TestApplyPatchNamePath(t *testing.T) {
	u := &models.User{IsActive: true, FullName: "Old Name"}
	op := models.SCIMPatchOperation{Op: "replace", Path: "name.formatted", Value: json.RawMessage(`"New Name"`)}
	if err := applyPatchValue(u, op); err != nil {
		t.Fatalf("applyPatchValue: %v", err)
	}
	if u.FullName != "New Name" {
		t.Fatalf("FullName = %q, want New Name", u.FullName)
	}
}

func TestApplyPatchNoPathObject(t *testing.T) {
	u := &models.User{IsActive: true, FullName: "Old"}
	op := models.SCIMPatchOperation{
		Op:    "replace",
		Value: json.RawMessage(`{"active": false, "displayName": "Display"}`),
	}
	if err := applyPatchValue(u, op); err != nil {
		t.Fatalf("applyPatchValue: %v", err)
	}
	if u.IsActive {
		t.Error("no-path patch did not deactivate")
	}
	if u.FullName != "Display" {
		t.Errorf("FullName = %q, want Display", u.FullName)
	}
}

func TestFilterRe(t *testing.T) {
	if m := filterRe.FindStringSubmatch(`userName eq "a@b.com"`); m == nil || m[1] != "a@b.com" {
		t.Errorf("filter parse failed: %v", m)
	}
	if m := filterRe.FindStringSubmatch(`  USERNAME   EQ   "X"  `); m == nil || m[1] != "X" {
		t.Errorf("case-insensitive/whitespace filter failed: %v", m)
	}
	if m := filterRe.FindStringSubmatch(`displayName eq "x"`); m != nil {
		t.Errorf("unsupported filter should not match, got %v", m)
	}
}

func TestDisplayNameFallback(t *testing.T) {
	if got := displayName(&models.SCIMUser{Name: &models.SCIMName{Formatted: "Formatted"}, DisplayName: "Disp"}, "e@x.com"); got != "Formatted" {
		t.Errorf("got %q, want Formatted", got)
	}
	if got := displayName(&models.SCIMUser{DisplayName: "Disp"}, "e@x.com"); got != "Disp" {
		t.Errorf("got %q, want Disp", got)
	}
	if got := displayName(&models.SCIMUser{}, "e@x.com"); got != "e@x.com" {
		t.Errorf("got %q, want e@x.com", got)
	}
}
