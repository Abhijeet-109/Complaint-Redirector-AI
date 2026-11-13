"""Authoritative customer-facing reasons accepted for new return requests."""

RETURN_REASON_LABELS = {
    "defective": "Item is defective / not working properly",
    "damaged": "Damaged during delivery / transit",
    "wrong_item": "Wrong item or variant delivered",
    "missing_parts": "Missing accessories or parts in package",
    "not_as_described": "Quality not as expected / description mismatch",
    "changed_mind": "Changed mind / No longer needed",
}

_LABEL_TO_CODE = {label.casefold(): code for code, label in RETURN_REASON_LABELS.items()}


def normalize_return_reason_code(value: str) -> str:
    if not isinstance(value, str):
        raise ValueError("Choose a supported return reason.")
    normalized = value.strip().casefold()
    normalized = _LABEL_TO_CODE.get(normalized, normalized)
    if normalized not in RETURN_REASON_LABELS:
        raise ValueError("Choose a supported return reason.")
    return normalized
