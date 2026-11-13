"""Regex patterns and deterministic intent detection for Supervisor routing."""

import re

# Pre-compiled patterns for deterministic intent detection
# These patterns are checked before falling back to LLM-based routing

RETURNS_PATTERNS = [
    re.compile(r"\b(return|refund|exchange|replace)\b", re.IGNORECASE),
    re.compile(r"\b(return\s+request|return\s+status)\b", re.IGNORECASE),
    re.compile(r"\b(send\s+back|send\s+it\s+back)\b", re.IGNORECASE),
]

REPLACEMENT_PATTERNS = [
    re.compile(r"\b(replacement|replace)\b", re.IGNORECASE),
    re.compile(r"\b(wrong\s+item|incorrect\s+item)\b", re.IGNORECASE),
    re.compile(r"\b(damaged|defective|broken)\b", re.IGNORECASE),
]

PRODUCT_PATTERNS = [
    re.compile(r"\b(product|item|merchandise)\b", re.IGNORECASE),
    re.compile(r"\b(search|find|look\s+for|browse)\b", re.IGNORECASE),
    re.compile(r"\b(price|cost|how\s+much)\b", re.IGNORECASE),
    re.compile(r"\b(stock|available|availability)\b", re.IGNORECASE),
    re.compile(r"\b(compare|comparison|vs\.?|versus)\b", re.IGNORECASE),
    re.compile(r"\b(category|categories)\b", re.IGNORECASE),
]

CART_PATTERNS = [
    re.compile(r"\b(cart|basket)\b", re.IGNORECASE),
    re.compile(r"\b(add\s+to\s+cart|put\s+in\s+cart)\b", re.IGNORECASE),
    re.compile(r"\b(remove\s+from\s+cart|delete\s+from\s+cart)\b", re.IGNORECASE),
    re.compile(r"\b(view\s+cart|show\s+cart|my\s+cart)\b", re.IGNORECASE),
]

ORDER_PATTERNS = [
    re.compile(r"\b(order|purchase)\b", re.IGNORECASE),
    re.compile(r"\b(order\s+history|past\s+orders|my\s+orders)\b", re.IGNORECASE),
    re.compile(r"\b(order\s+details|order\s+information)\b", re.IGNORECASE),
    re.compile(r"\b(order\s+status|order\s+state)\b", re.IGNORECASE),
    re.compile(r"\b(order\s+number|order\s+id)\b", re.IGNORECASE),
]

SHIPPING_PATTERNS = [
    re.compile(r"\b(ship|shipment|shipping|delivery)\b", re.IGNORECASE),
    re.compile(r"\b(track|tracking|tracking\s+number)\b", re.IGNORECASE),
    re.compile(r"\b(shipped|delivered|in\s+transit)\b", re.IGNORECASE),
    re.compile(r"\b(when\s+will.*arrive|delivery\s+date)\b", re.IGNORECASE),
]

KNOWLEDGE_PATTERNS = [
    re.compile(r"\b(policy|policies|faq|f\.a\.q)\b", re.IGNORECASE),
    re.compile(r"\b(how\s+to|how\s+do\s+i)\b", re.IGNORECASE),
    re.compile(r"\b(shipping\s+policy|return\s+policy|refund\s+policy)\b", re.IGNORECASE),
    re.compile(r"\b(company|about\s+flatkart|contact)\b", re.IGNORECASE),
]

SUPPORT_PATTERNS = [
    re.compile(r"\b(help|support|assist)\b", re.IGNORECASE),
    re.compile(r"\b(how\s+does\s+.*work|how\s+to\s+use)\b", re.IGNORECASE),
    re.compile(r"\b(troubleshoot|problem|issue)\b", re.IGNORECASE),
    re.compile(r"\b(platform|website|app)\b", re.IGNORECASE),
]

# Route priority order for deterministic matching (higher priority first)
ROUTE_PATTERNS = [
    ("returns", RETURNS_PATTERNS),
    ("returns", REPLACEMENT_PATTERNS),  # Replacement routes to returns
    ("product", PRODUCT_PATTERNS),
    ("cart", CART_PATTERNS),
    ("order", ORDER_PATTERNS),
    ("shipping", SHIPPING_PATTERNS),
    ("knowledge", KNOWLEDGE_PATTERNS),
    ("support", SUPPORT_PATTERNS),
]


def detect_intent_deterministic(question: str) -> str | None:
    """
    Detect intent using deterministic pattern matching.
    Returns the route name if a pattern matches, None otherwise.
    """
    if not question or not isinstance(question, str):
        return None

    for route, patterns in ROUTE_PATTERNS:
        for pattern in patterns:
            if pattern.search(question):
                return route

    return None