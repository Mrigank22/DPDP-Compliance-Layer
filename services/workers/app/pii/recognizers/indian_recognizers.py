# services/workers/app/pii/recognizers/indian_recognizers.py

from __future__ import annotations
import re
from typing import Optional

from presidio_analyzer import Pattern, PatternRecognizer


class AadhaarRecognizer(PatternRecognizer):
    """12-digit Aadhaar (UIDAI). Verhoeff-validated."""

    PATTERNS = [
        Pattern("aadhaar", r"\b[2-9]\d{3}[\s\-]?\d{4}[\s\-]?\d{4}\b", score=0.7),
    ]
    CONTEXT_WORDS = ["aadhaar", "aadhar", "uid", "uidai", "unique identification", "resident"]

    def __init__(self):
        super().__init__(
            supported_entity="AADHAAR_NUMBER",
            patterns=self.PATTERNS,
            context=self.CONTEXT_WORDS,
            supported_language="en",
        )

    def validate_result(self, pattern_text: str) -> Optional[bool]:
        digits = re.sub(r"\D", "", pattern_text)
        if len(digits) != 12:
            return False
        if int(digits[0]) < 2:
            return False
        return _verhoeff_validate(digits) or None


class PANRecognizer(PatternRecognizer):
    """Indian PAN card — AAAAA9999A."""

    PATTERNS = [
        Pattern("pan", r"\b[A-Z]{3}[ABCFGHLJPTF][A-Z]\d{4}[A-Z]\b", score=0.85),
    ]
    CONTEXT_WORDS = ["pan", "permanent account", "income tax", "pan card", "taxpayer"]

    def __init__(self):
        super().__init__(
            supported_entity="IN_PAN",
            patterns=self.PATTERNS,
            context=self.CONTEXT_WORDS,
            supported_language="en",
        )

    def validate_result(self, pattern_text: str) -> Optional[bool]:
        if len(pattern_text) != 10:
            return False
        return pattern_text[3].upper() in set("ABCFGHLJPTF")


class GSTINRecognizer(PatternRecognizer):
    """Indian GSTIN — 15-char format with state code and PAN."""

    PATTERNS = [
        Pattern(
            "gstin",
            r"\b\d{2}[A-Z]{3}[ABCFGHLJPTF][A-Z]\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]\b",
            score=0.88,
        ),
    ]
    CONTEXT_WORDS = ["gstin", "gst", "goods and services tax", "gstn", "tax invoice"]

    def __init__(self):
        super().__init__(
            supported_entity="IN_GSTIN",
            patterns=self.PATTERNS,
            context=self.CONTEXT_WORDS,
            supported_language="en",
        )

    def validate_result(self, pattern_text: str) -> Optional[bool]:
        try:
            return 1 <= int(pattern_text[:2]) <= 37
        except (ValueError, IndexError):
            return False


_DL_STATE_CODES = {
    "AN","AP","AR","AS","BR","CG","CH","DD","DL","DN","GA","GJ","HP",
    "HR","JH","JK","KA","KL","LA","LD","MH","ML","MN","MP","MZ","NL",
    "OD","PB","PY","RJ","SK","TG","TN","TR","UK","UP","WB",
}


class DrivingLicenseRecognizer(PatternRecognizer):
    """Indian Driving Licence — state code + RTO + year + serial."""

    PATTERNS = [
        Pattern(
            "dl",
            (r"\b(?:AN|AP|AR|AS|BR|CG|CH|DD|DL|DN|GA|GJ|HP|HR|JH|JK"
             r"|KA|KL|LA|LD|MH|ML|MN|MP|MZ|NL|OD|PB|PY|RJ|SK|TG|TN"
             r"|TR|UK|UP|WB)\d{2}[\s]?\d{4}[\s]?\d{7}\b"),
            score=0.80,
        ),
    ]
    CONTEXT_WORDS = ["driving licence", "driving license", "dl number", "rto", "motor vehicle"]

    def __init__(self):
        super().__init__(
            supported_entity="IN_DRIVING_LICENSE",
            patterns=self.PATTERNS,
            context=self.CONTEXT_WORDS,
            supported_language="en",
        )

    def validate_result(self, pattern_text: str) -> Optional[bool]:
        return pattern_text[:2].upper() in _DL_STATE_CODES


class VoterIDRecognizer(PatternRecognizer):
    """Indian Voter ID (EPIC) — 3 letters + 7 digits."""

    PATTERNS = [
        Pattern("voter_id", r"\b[A-Z]{3}\d{7}\b", score=0.55),
    ]
    CONTEXT_WORDS = ["voter id", "epic", "election card", "electoral", "election commission"]

    def __init__(self):
        super().__init__(
            supported_entity="IN_VOTER_ID",
            patterns=self.PATTERNS,
            context=self.CONTEXT_WORDS,
            supported_language="en",
        )


class UPIRecognizer(PatternRecognizer):
    """UPI VPA — username@bankhandle."""

    PATTERNS = [
        Pattern(
            "upi",
            (r"[a-zA-Z0-9.\-_+]{2,256}@"
             r"(?:okicici|oksbi|okhdfcbank|okaxis|ybl|ibl|axl|paytm|upi|"
             r"waicici|wasbi|wahdfcbank|waaxis|aubank|indus|rbl|kotak|fbl|"
             r"barodampay|centralbank|cmsidfc|dbs|equitas|esaf|federal|idbi|"
             r"idfcbank|indianbank|indusind|iob|juspay|kvb|mahb|pnb|postpaid|"
             r"ptaxis|pthdfc|ptsbi|rajgovhdfcbank|sib|sunb|syndicate|uco|"
             r"unionbank|utbi|vjb|yesbankltd|axisbank|hdfcbank|icici|sbi|"
             r"canara|union|bob)\b"),
            score=0.88,
        ),
    ]
    CONTEXT_WORDS = ["upi", "vpa", "payment address", "bhim", "gpay", "phonepe", "paytm"]

    def __init__(self):
        super().__init__(
            supported_entity="IN_UPI_ID",
            patterns=self.PATTERNS,
            context=self.CONTEXT_WORDS,
            supported_language="en",
        )


class IFSCRecognizer(PatternRecognizer):
    """Indian Financial System Code — 4 alpha + 0 + 6 alphanumeric."""

    PATTERNS = [
        Pattern("ifsc", r"\b[A-Z]{4}0[A-Z0-9]{6}\b", score=0.75),
    ]
    CONTEXT_WORDS = ["ifsc", "ifsc code", "bank branch", "neft", "rtgs", "imps"]

    def __init__(self):
        super().__init__(
            supported_entity="IN_IFSC",
            patterns=self.PATTERNS,
            context=self.CONTEXT_WORDS,
            supported_language="en",
        )


class IndianPassportRecognizer(PatternRecognizer):
    """Indian passport number — 1 letter + 7 digits."""

    PATTERNS = [
        Pattern("passport", r"\b[A-Z]\d{7}\b", score=0.55),
    ]
    CONTEXT_WORDS = ["passport", "passport number", "travel document", "republic of india", "visa"]

    def __init__(self):
        super().__init__(
            supported_entity="IN_PASSPORT",
            patterns=self.PATTERNS,
            context=self.CONTEXT_WORDS,
            supported_language="en",
        )


class BankAccountRecognizer(PatternRecognizer):
    """Indian bank account number — 9-18 digits with contextual prefix."""

    PATTERNS = [
        Pattern(
            "bank_account",
            r"(?i)(?:account[\s\-_]*(?:no|number|num|#)?[\s:]*|a\s*/\s*c[\s:]*)\b(\d{9,18})\b",
            score=0.80,
        ),
    ]
    CONTEXT_WORDS = ["bank account", "account number", "savings account", "current account", "a/c"]

    def __init__(self):
        super().__init__(
            supported_entity="IN_BANK_ACCOUNT",
            patterns=self.PATTERNS,
            context=self.CONTEXT_WORDS,
            supported_language="en",
        )


ALL_RECOGNIZER_CLASSES = [
    AadhaarRecognizer,
    PANRecognizer,
    GSTINRecognizer,
    DrivingLicenseRecognizer,
    VoterIDRecognizer,
    UPIRecognizer,
    IFSCRecognizer,
    IndianPassportRecognizer,
    BankAccountRecognizer,
]


def get_all_recognizers() -> list:
    return [cls() for cls in ALL_RECOGNIZER_CLASSES]


# ---- Verhoeff checksum -------------------------------------------------------

_VD = [
    [0,1,2,3,4,5,6,7,8,9],[1,2,3,4,0,6,7,8,9,5],[2,3,4,0,1,7,8,9,5,6],
    [3,4,0,1,2,8,9,5,6,7],[4,0,1,2,3,9,5,6,7,8],[5,9,8,7,6,0,4,3,2,1],
    [6,5,9,8,7,1,0,4,3,2],[7,6,5,9,8,2,1,0,4,3],[8,7,6,5,9,3,2,1,0,4],
    [9,8,7,6,5,4,3,2,1,0],
]
_VP = [
    [0,1,2,3,4,5,6,7,8,9],[1,5,7,6,2,8,3,0,9,4],[5,8,0,3,7,9,6,1,4,2],
    [8,9,1,6,0,4,3,5,2,7],[9,4,5,3,1,2,6,8,7,0],[4,2,8,6,5,7,3,9,0,1],
    [2,7,9,3,8,0,6,4,1,5],[7,0,4,6,9,1,3,2,5,8],
]


def _verhoeff_validate(number: str) -> bool:
    c = 0
    for i, d in enumerate(reversed(number)):
        c = _VD[c][_VP[i % 8][int(d)]]
    return c == 0
