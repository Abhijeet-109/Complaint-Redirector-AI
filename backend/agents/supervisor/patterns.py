"""Deterministic intent detection for Supervisor routing."""

import re

from backend.agents.supervisor.guardrails import ALLOWED_ROUTES


def _patterns(*expressions: str) -> tuple[re.Pattern, ...]:
    return tuple(re.compile(expression, re.IGNORECASE) for expression in expressions)


# Policy and eligibility questions describe a process; they do not request it.
KNOWLEDGE_PATTERNS = _patterns(
    r"\b(?:refund|return|replacement|cancellation|shipping|delivery|payment)\s+polic(?:y|ies)\b",
    r"\b(?:what|which)\s+(?:payment\s+methods|ways\s+to\s+pay)\b",
    r"\b(?:do\s+you\s+offer|is\s+there)\s+(?:free\s+)?shipping\b",
    r"\bhow\s+(?:do\s+i|can\s+i|to)\s+(?:return|send\s+back|replace|exchange|request\s+a\s+refund|cancel)\b",
    r"\bhow\s+many\s+days\b.{0,50}\b(?:return|replace|exchange)\b",
    r"\b(?:can|may)\s+i\s+(?:return|replace|exchange)\b",
    r"\b(?:eligible|eligibility)\b.{0,50}\b(?:return|replacement|replace|refund)\b",
    r"\b(?:return|replacement|replace|refund)\b.{0,50}\b(?:eligible|eligibility)\b",
    r"\b(?:company|about\s+flatkart|contact\s+(?:details|information))\b",
    r"\b(?:faq|f\.a\.q\.?|policy|policies)\b",
)

RETURNS_PATTERNS = _patterns(
    r"\b(?:i\s+(?:want|need|would\s+like)\s+to|please|kindly|can\s+you)\s+(?:initiate\s+)?(?:a\s+)?(?:return|replacement|replace|exchange)\b",
    r"\b(?:i\s+(?:want|need|would\s+like)\s+(?:a\s+)?replacement|i\s+(?:want|need|would\s+like)\s+to\s+request\s+a\s+refund\s+for\s+(?:my\s+)?returned)\b",
    r"\b(?:initiate|start|raise|file|request)\s+(?:a\s+)?(?:return|replacement|refund)\b",
    r"\b(?:request|claim)\s+(?:a\s+)?refund\s+for\s+(?:my\s+)?returned\b",
    r"\b(?:where\s+is|what\s+happened\s+to|check|track|show)\s+(?:the\s+)?(?:status\s+of\s+)?(?:my\s+)?(?:existing\s+)?(?:return|refund)\s+(?:request|claim)\b",
    r"\b(?:where\s+is\s+my\s+refund\s+for\s+my\s+return|status\s+of\s+my\s+return|existing\s+return\s+request)\b",
    r"\b(?:return|refund)\s+(?:request|claim)\s+(?:status|update)\b",
)

SHIPPING_PATTERNS = _patterns(
    r"\b(?:track|tracking)\b.{0,35}\b(?:package|parcel|shipment|order|delivery)\b",
    r"\b(?:package|parcel|shipment)\b.{0,35}\b(?:track|tracking|where|status|arrive|delivered)\b",
    r"\bwhere\s+is\s+my\s+(?:package|parcel|shipment)\b",
    r"\bwhen\s+will\s+(?:my\s+)?(?:order|package|parcel|delivery)\s+arrive\b",
    r"\b(?:my\s+)?(?:order|package|delivery)\s+(?:has\s+)?(?:not\s+arrived|not\s+been\s+delivered|is\s+delayed)\b",
    r"\bmy\s+(?:order|package|delivery)\s+hasn't\s+arrived\b",
    r"\b(?:shipment|delivery|tracking)\s+(?:status|details|number|reference)\b",
    r"\b(?:where\s+is|when\s+will)\s+my\s+(?:order|delivery)\b",
)

CART_PATTERNS = _patterns(
    r"\b(?:add|put)\b.{0,50}\b(?:to|in|into)\s+(?:my\s+)?(?:shopping\s+)?cart\b",
    r"\b(?:remove|delete)\b.{0,50}\bfrom\s+(?:my\s+)?(?:shopping\s+)?cart\b",
    r"\b(?:show|view|check|clear|empty)\s+(?:me\s+)?(?:my\s+)?(?:shopping\s+)?cart\b",
    r"\bwhat\s+(?:items|products)\s+(?:are|is)\s+in\s+my\s+(?:shopping\s+)?cart\b",
    r"\b(?:update|change|set)\s+(?:the\s+)?quantity\s+(?:to|of)\s+\w+\b",
    r"\b(?:increase|decrease)\s+(?:the\s+)?quantity\s+(?:of\s+)?(?:my\s+)?(?:cart\s+)?item\b",
)

ORDER_PATTERNS = _patterns(
    r"\b(?:show|list|view|get)\s+(?:me\s+)?(?:my\s+)?(?:recent\s+|past\s+|all\s+)?orders\b",
    r"\b(?:order\s+history|past\s+orders|my\s+orders)\b",
    r"\b(?:details|information|number|id|confirmation|confirmed|status)\b.{0,35}\border\b",
    r"\border\b.{0,35}\b(?:details|information|number|id|confirmation|confirmed|status)\b",
    r"\bcancel\b.{0,30}\b(?:my\s+)?order\b",
    r"\b(?:my\s+)?order\b.{0,30}\bcancel\b",
    r"\b(?:what\s+is|show\s+me)\s+(?:my\s+)?order\s+(?:number|id)\b",
)

PRODUCT_PATTERNS = _patterns(
    r"\b(?:show|find|search\s+for|browse|recommend|list)\s+(?:me\s+)?(?:available\s+)?[\w-]+\s+(?:products?|items?|laptops?|phones?|headphones?|clothing|shoes)\b",
    r"\b(?:show|find|search\s+for|browse|recommend|list)\s+(?:me\s+)?(?:available\s+)?(?:products?|items?|laptops?|phones?|headphones?|clothing|shoes)\b",
    r"\b(?:tell\s+me\s+about|details\s+about|information\s+about)\s+(?:this\s+|the\s+)?(?:product|item|laptop|phone|headphones?)\b",
    r"\bcompare\b.{1,70}\b(?:products?|items?|phones?|laptops?|headphones?|models?)\b",
    r"\bhow\s+much\s+(?:is|are)\b.{0,50}\b(?:product|item|phone|laptop|headphones?|model)\b",
    r"\bwhat\s+is\s+the\s+price\s+of\b.{0,50}\b(?:product|item|phone|laptop|headphones?|model)\b",
    r"\b(?:specifications|specs|features|price|cost|colou?r|variant|availability|in\s+stock)\b.{0,50}\b(?:product|item|phone|laptop|headphones?|model)\b",
    r"\b(?:product|item|phone|laptop|headphones?|model)\b.{0,50}\b(?:specifications|specs|features|price|cost|colou?r|variant|availability|in\s+stock)\b",
    r"\bdo\s+you\s+have\b.{0,50}\b(?:product|item|phone|laptop|headphones?|another\s+colou?r)\b",
    r"\b(?:phones?|laptops?|headphones?|products?|items?)\b.{0,40}\b(?:under|below|less\s+than|within)\s+(?:₹|rs\.?\s*)?\d[\d,]*(?:\s*(?:inr|rupees?))?\b",
)

SUPPORT_PATTERNS = _patterns(
    r"\b(?:i\s+)?(?:need|want)\s+(?:some\s+)?(?:general\s+)?(?:help|assistance|support)\b",
    r"\b(?:cannot|can't|unable\s+to)\s+(?:access|log\s*in\s+to)\s+my\s+account\b",
    r"\b(?:problem|issue|trouble)\b.{0,40}\b(?:using|with)\s+(?:the\s+)?(?:website|platform|app|account)\b",
    r"\b(?:website|platform|app)\b.{0,40}\b(?:not\s+working|problem|issue|trouble)\b",
    r"\bhow\s+do\s+i\s+use\s+(?:the\s+)?(?:website|platform|app|feature)\b",
)

ROUTE_PATTERNS = (
    ("knowledge", KNOWLEDGE_PATTERNS),
    ("returns", RETURNS_PATTERNS),
    ("shipping", SHIPPING_PATTERNS),
    ("cart", CART_PATTERNS),
    ("order", ORDER_PATTERNS),
    ("product", PRODUCT_PATTERNS),
    ("support", SUPPORT_PATTERNS),
)


def detect_intent_deterministic(question: str) -> str | None:
    """Return one clear supported intent, or None for fallback/ambiguity."""
    if not isinstance(question, str) or not question.strip():
        return None

    matched_routes = {
        route
        for route, patterns in ROUTE_PATTERNS
        if route in ALLOWED_ROUTES and any(pattern.search(question) for pattern in patterns)
    }
    if len(matched_routes) != 1:
        return None

    return matched_routes.pop()
