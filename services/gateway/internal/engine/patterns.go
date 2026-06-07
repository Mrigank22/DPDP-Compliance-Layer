// services/gateway/internal/engine/patterns.go

package engine

import "regexp"

// AllPatterns returns a map of PII type name to compiled regexp.
// Patterns are compiled once at startup; this function is called during engine init.
func AllPatterns() map[string]*regexp.Regexp {
	return map[string]*regexp.Regexp{
		"AADHAAR":         AadhaarPattern,
		"PAN":             PANPattern,
		"PHONE":           PhonePattern,
		"UPI":             UPIPattern,
		"VOTER_ID":        VoterIDPattern,
		"PASSPORT":        PassportPattern,
		"DRIVING_LICENSE": DrivingLicensePattern,
		"GSTIN":           GSTINPattern,
		"IFSC":            IFSCPattern,
		"BANK_ACCOUNT":    BankAccountPattern,
		"EMAIL":           EmailPattern,
		"CREDIT_CARD":     CreditCardPattern,
		"EPFIC":           EPFICPattern,
		"CIN":             CINPattern,
	}
}

// ContextualPatterns are higher-precision patterns that require a keyword near the value.
// Used as a second pass when the base pattern fires, to boost confidence.
func ContextualPatterns() map[string]*regexp.Regexp {
	return map[string]*regexp.Regexp{
		"AADHAAR":      AadhaarContextPattern,
		"PAN":          PANContextPattern,
		"BANK_ACCOUNT": BankAccountPattern, // already contextual
	}
}

var (
	// AadhaarPattern — 12-digit, starting with 2-9 (valid UIDAI range).
	// Handles spaces and hyphens as separators.
	AadhaarPattern = regexp.MustCompile(
		`\b[2-9]\d{3}[\s\-]?\d{4}[\s\-]?\d{4}\b`,
	)

	// AadhaarContextPattern — Aadhaar near a keyword for higher precision.
	AadhaarContextPattern = regexp.MustCompile(
		`(?i)(?:aadhaar|aadhar|uid(?:ai)?|adhaar)[\s:]*\b[2-9]\d{3}[\s\-]?\d{4}[\s\-]?\d{4}\b`,
	)

	// PANPattern — AAAAA9999A. 4th letter encodes entity type; 5th is surname initial.
	PANPattern = regexp.MustCompile(
		`\b[A-Z]{3}[ABCFGHLJPTF][A-Z]\d{4}[A-Z]\b`,
	)

	// PANContextPattern — PAN near a keyword.
	PANContextPattern = regexp.MustCompile(
		`(?i)(?:pan|permanent\s+account\s+number)[\s:]*\b[A-Z]{3}[ABCFGHLJPTF][A-Z]\d{4}[A-Z]\b`,
	)

	// PhonePattern — Indian mobile numbers, optional +91 prefix, 6-9 prefix for mobile.
	PhonePattern = regexp.MustCompile(
		`(?:(?:\+|00)91[\s\-]?)?[6-9]\d{9}\b`,
	)

	// UPIPattern — VPA format username@bankhandle.
	UPIPattern = regexp.MustCompile(
		`[a-zA-Z0-9.\-_+]{2,256}@(?:okicici|oksbi|okhdfcbank|okaxis|ybl|ibl|axl|paytm|upi|` +
			`waicici|wasbi|wahdfcbank|waaxis|aubank|indus|rbl|kotak|fbl|barodampay|` +
			`centralbank|cmsidfc|dbs|equitas|esaf|federal|idbi|idfcbank|indianbank|` +
			`indusind|iob|juspay|kvb|mahb|pnb|postpaid|ptaxis|pthdfc|ptsbi|` +
			`rajgovhdfcbank|sib|sunb|syndicate|uco|unionbank|utbi|vjb|yesbankltd|` +
			`axisbank|hdfcbank|icici|sbi|canara|union|bob)\b`,
	)

	// VoterIDPattern — 3 uppercase letters + 7 digits (ECI EPIC format).
	VoterIDPattern = regexp.MustCompile(
		`\b[A-Z]{3}\d{7}\b`,
	)

	// PassportPattern — 1 uppercase letter + 7 digits.
	PassportPattern = regexp.MustCompile(
		`\b[A-Z]\d{7}\b`,
	)

	// DrivingLicensePattern — state code + RTO + year + serial.
	DrivingLicensePattern = regexp.MustCompile(
		`\b(?:AN|AP|AR|AS|BR|CG|CH|DD|DL|DN|GA|GJ|HP|HR|JH|JK|KA|KL|LA|LD|MH|ML|MN|MP|MZ|NL|OD|PB|PY|RJ|SK|TG|TN|TR|UK|UP|WB)\d{2}[\s]?\d{4}[\s]?\d{7}\b`,
	)

	// GSTINPattern — 2-digit state + 10-char PAN + entity + Z + checksum.
	GSTINPattern = regexp.MustCompile(
		`\b\d{2}[A-Z]{3}[ABCFGHLJPTF][A-Z]\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]\b`,
	)

	// IFSCPattern — 4 alpha (bank) + 0 + 6 alphanumeric (branch).
	IFSCPattern = regexp.MustCompile(
		`\b[A-Z]{4}0[A-Z0-9]{6}\b`,
	)

	// BankAccountPattern — 9–18 digit account number with contextual prefix.
	BankAccountPattern = regexp.MustCompile(
		`(?i)(?:account[\s\-_]*(?:no|number|num|#)?[\s:]*|a\s*/\s*c[\s:]*)\b(\d{9,18})\b`,
	)

	// EmailPattern — RFC 5322 addresses including Indian TLDs.
	EmailPattern = regexp.MustCompile(
		`\b[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.(?:com|in|co\.in|net|org|edu|gov\.in|nic\.in|ac\.in|res\.in|org\.in)\b`,
	)

	// CreditCardPattern — Visa/MC/Amex/RuPay, Luhn validated separately.
	CreditCardPattern = regexp.MustCompile(
		`\b(?:4[0-9]{3}|5[1-5][0-9]{2}|2[2-7][0-9]{2}|3[47][0-9]{2}|6(?:011|5[0-9]{2})|(?:60|65|81|82|508)[0-9]{2})` +
			`[\s\-]?[0-9]{4}[\s\-]?[0-9]{4}[\s\-]?[0-9]{4}(?:[\s\-]?[0-9]{3})?\b`,
	)

	// EPFICPattern — Employees' Provident Fund member ID.
	EPFICPattern = regexp.MustCompile(
		`\b[A-Z]{2}/[A-Z]{3}/\d{7}/\d{3}/\d{7}\b`,
	)

	// CINPattern — Corporate Identity Number.
	CINPattern = regexp.MustCompile(
		`\b[UL]\d{5}[A-Z]{2}\d{4}(?:PLC|PTC|LLC|LLP|OPC|NPL|NGO|GAV|FLC|GAP)\d{6}\b`,
	)
)
