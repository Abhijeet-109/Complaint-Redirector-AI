"""Deterministic intent patterns owned by the Supervisor."""

import re

from backend.agents.supervisor.guardrails import ALLOWED_ROUTES


def _patterns(*expressions: str) -> tuple[re.Pattern, ...]:
    return tuple(re.compile(expression, re.IGNORECASE) for expression in expressions)


# Informational questions about rules, eligibility, company facts, and FAQs.
KNOWLEDGE_PATTERNS = _patterns(
    r"\b(?:return|refund|replacement|cancellation|shipping|delivery|payment)\s+polic(?:y|ies)\b",
    r"\b(?:what|which|explain|describe|tell\s+me\s+about)\b.{0,60}\b(?:polic(?:y|ies)|faq|f\.a\.q\.?|terms\s+and\s+conditions|warranty)\b",
    r"\b(?:do\s+you\s+offer|is\s+there)\b.{0,30}\bwarranty\b",
    r"\b(?:can|may)\s+i\s+(?:return|replace|exchange)\b",
    r"\b(?:can|may)\s+i\s+(?:get|receive|claim)\s+(?:a\s+)?refund\b",
    r"\b(?:am\s+i|is\s+this|would\s+i\s+be)\s+(?:eligible|qualified)\b.{0,50}\b(?:return|replacement|refund)\b",
    r"\b(?:eligible|eligibility|conditions?|requirements?|return\s+window)\b.{0,55}\b(?:return|replacement|refund)\b",
    r"\breturn\s+window\b",
    r"\bhow\s+(?:do\s+i|can\s+i|to)\s+(?:return|send\s+back|replace|exchange|request\s+a\s+refund|cancel)\b",
    r"\bhow\s+many\s+days\b.{0,50}\b(?:return|replace|exchange|refund)\b",
    r"\bhow\s+long\b.{0,50}\b(?:refund|return)\b.{0,30}\b(?:take|policy|time)\b",
    r"\b(?:what|which)\s+(?:payment\s+methods|ways\s+to\s+pay)\b",
    r"\b(?:do\s+you\s+offer|is\s+there)\s+(?:free\s+)?shipping\b",
    r"\b(?:tell\s+me\s+about|who\s+is)\s+(?:the\s+)?flatkart\b",
    r"\bhow\s+(?:can|do)\s+i\s+contact\s+(?:customer\s+)?support\b",
    r"\b(?:company|about\s+flatkart|terms\s+and\s+conditions)\b",
)

# Transactional return/replacement intent and management of an existing request.
RETURNS_PATTERNS = _patterns(
    r"\b(?:i\s+(?:want|need|would\s+like)\s+to|please|kindly|can\s+you|could\s+you)\s+(?:initiate\s+)?(?:a\s+)?(?:return|replace|replacement|exchange)\b",
    r"\b(?:i\s+(?:want|need|would\s+like)\s+(?:a\s+)?replacement|send\s+me\s+another\s+unit\s+instead)\b",
    r"\b(?:i\s+(?:want|need)\s+it\s+(?:replaced|returned|exchanged)|i\s+received\b.{0,40}\b(?:wrong|incorrect|damaged|defective)\b.{0,45}\bwant\s+it\s+(?:replaced|returned|exchanged))\b",
    r"\bi\s+received\b.{0,45}\b(?:wrong|incorrect|damaged|defective)\b.{0,45}\bwant\s+to\s+(?:return|replace|exchange)\b",
    r"\b(?:i\s+)?(?:need|want)\s+to\s+send\s+(?:this\s+|the\s+)?(?:product|item|order|it)\s+back\b",
    r"\b(?:start|initiate|raise|file|submit)\s+(?:a\s+)?(?:return|replacement)\b",
    r"\b(?:request|claim)\s+(?:a\s+)?refund\s+by\s+returning\b",
    r"\b(?:i\s+(?:want|need)\s+(?:a\s+)?refund|request\s+(?:a\s+)?refund)\b.{0,45}\b(?:for\s+(?:my\s+)?returned|by\s+returning)\b",
    r"\b(?:i\s+(?:want|need|would\s+like)\s+to\s+request\s+a\s+refund)\b.{0,45}\breturn(?:ing|ed)?\b",
    r"\b(?:check|show|track|get)\s+(?:the\s+)?(?:status\s+of\s+)?(?:(?:my|the|existing)\s+){1,2}(?:return|refund|replacement|exchange)\s+(?:request|claim|status)\b",
    r"\b(?:what\s+is\s+happening|what\s+happened)\s+(?:with|to)\s+(?:my\s+)?(?:return|refund|replacement|exchange)\b",
    r"\bwhat\s+happened\s+to\s+my\s+return\s+order\b",
    r"\bwhat\s+about\s+my\s+refund\b",
    r"\bwhere\s+is\s+my\s+refund\s+for\s+my\s+return\b",
    r"\bhas\s+my\s+(?:return|replacement|exchange)\s+(?:request\s+)?(?:been\s+)?(?:approved|processed|updated)\b",
    r"\bhas\s+my\s+refund\s+(?:request|claim)\s+(?:been\s+)?(?:approved|processed|updated)\b",
    r"\b(?:what\s+is\s+)?(?:the\s+)?status\s+of\s+my\s+(?:return|refund|replacement|exchange)\s+(?:request|claim)\b",
    r"\b(?:provide|upload|send)\s+(?:more\s+)?(?:information|evidence|proof|photos?)\b.{0,55}\b(?:existing\s+)?(?:return|replacement)\s+request\b",
    r"\b(?:return|replacement)\s+(?:pickup|collection)\b.{0,35}\b(?:status|progress|update)\b",
)

# Physical shipment movement and recorded delivery milestones. Order-record
# queries such as "show my delivered orders" intentionally live under Order.
SHIPPING_PATTERNS = _patterns(
    r"\b(?:track|tracking)\b.{0,45}\b(?:package|parcel|shipment|courier|delivery|order)\b",
    r"\b(?:package|parcel|shipment|courier)\b.{0,45}\b(?:track|tracking|where|status|arrive|delivered|update)\b",
    r"\b(?:check|show|get)\s+(?:my\s+|the\s+)?shipment\b",
    r"\bwhere\s+(?:is|has)\s+(?:my\s+)?(?:order|package|parcel|shipment)\b",
    r"\bwhen\s+will\s+(?:my\s+)?(?:order|package|parcel|shipment|delivery)\s+arrive\b",
    r"\b(?:my\s+)?(?:package|parcel|shipment|delivery)\s+(?:has\s+not|hasn't|has\s+)?(?:arrived|been\s+delivered|been\s+dispatched|shipped|is\s+delayed|not\s+arrived)\b",
    r"\bmy\s+order\s+(?:has\s+not|hasn't)\s+(?:arrived|been\s+delivered)\b",
    r"\bmy\s+order\s+(?:has\s+)?(?:not\s+arrived|is\s+delayed|been\s+dispatched|shipped)\b",
    r"\bwhy\s+has\s+(?:my\s+)?(?:order|package|parcel|shipment)\s+not\s+arrived\b",
    r"\b(?:dispatched|out\s+for\s+delivery|delivery\s+attempt|courier\s+attempt(?:ed)?|delivery\s+hub|shipment\s+delayed)\b",
    r"\b(?:latest|recent|delivery|shipment|tracking)\s+(?:delivery\s+)?updates?\s+(?:on|for|about)\s+(?:my\s+)?(?:order|package|parcel|shipment)\b",
    r"\b(?:delivery|shipment)\s+updates?\b",
    r"\b(?:show|display|get)\s+(?:me\s+)?(?:my\s+)?(?:latest|recent)\s+(?:delivery|shipment)\s+updates?\b",
    r"\b(?:what\s+happened|why\s+hasn't|why\s+has\s+not)\b.{0,35}\b(?:my\s+)?(?:order|package|parcel|shipment)\b",
    r"\b(?:shipment|tracking|delivery)\s+(?:status|details|number|reference|progress)\b",
    r"\bwhere\s+is\s+my\s+(?:delivered\s+)?order\s+(?:now|currently)\b",
)

# Cart operations require an operation or an explicit reference to the user's
# selected basket contents. Product discovery by itself belongs to Product.
CART_PATTERNS = _patterns(
    r"\b(?:add|put)\b.{0,55}\b(?:to|in|into)\s+(?:my\s+|the\s+)?(?:shopping\s+)?(?:cart|basket)\b",
    r"\b(?:i\s+(?:want|need)\s+to\s+add)\b.{0,50}\b(?:product|item|shirt|dress|shoes?|units?)\b",
    r"\b(?:remove|delete)\b.{0,55}\bfrom\s+(?:my\s+|the\s+)?(?:shopping\s+)?(?:cart|basket)\b",
    r"\b(?:show|display|view|check|clear|empty)\s+(?:me\s+)?(?:my\s+|the\s+)?(?:shopping\s+)?(?:cart|basket)\b",
    r"\bwhat\s+(?:items|products)\s+(?:are|is)\s+in\s+my\s+(?:shopping\s+)?(?:cart|basket)\b",
    r"\bwhat\s+(?:is\s+in|items?\s+are\s+in|products?\s+are\s+in)\s+my\s+(?:shopping\s+)?(?:cart|basket)\b",
    r"\bhow\s+many\s+(?:items?|products?)\s+(?:are|do\s+i\s+have)\s+in\s+my\s+(?:shopping\s+)?(?:cart|basket)\b",
    r"\bshow\s+(?:me\s+)?(?:the\s+)?products?\s+in\s+my\s+(?:shopping\s+)?(?:cart|basket)\b",
    r"\b(?:show|display)\s+(?:me\s+)?(?:my\s+)?selected\s+products?\s+(?:in|from)\s+(?:my\s+|the\s+)?(?:shopping\s+)?(?:cart|basket)\b",
    r"\b(?:increase|decrease|reduce|update|change|set)\b.{0,55}\bquantity\b.{0,45}\b(?:cart|basket)\s+(?:item|product)\b",
    r"\b(?:increase|decrease|reduce|update|change|set)\b.{0,55}\bquantity\b.{0,45}\b(?:item|product)\b.{0,35}\bin\s+(?:my\s+)?(?:cart|basket)\b",
    r"\b(?:increase|decrease|reduce|update|change|set)\b.{0,45}\b(?:cart|basket)\s+(?:item|product)(?:'s)?\b.{0,30}\bquantity\b",
    r"\b(?:increase|decrease|reduce|update|change|set)\b.{0,45}\bquantity\b.{0,30}\bin\s+(?:my\s+)?(?:cart|basket)\b",
    r"\b(?:make\s+it|change\s+it\s+to|reduce\s+it\s+to|increase\s+it\s+to)\s+(?:\w+|\d+)\s+(?:units?|items?)\b.{0,25}\bin\s+(?:my\s+)?(?:cart|basket)\b",
    r"\bi\s+(?:want|need)\s+(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+more\s+of\s+(?:this\s+|the\s+)?(?:product|item|one)\b.{0,30}\bin\s+(?:my\s+)?(?:cart|basket)\b",
)

# Customer order records, including status filters and purchased-item details.
# Physical movement terms are left to Shipping patterns.
ORDER_PATTERNS = _patterns(
    r"\b(?:show|display|list|view|get|find)\s+(?:me\s+)?(?:(?:my|all)\s+){0,2}(?:(?:recent|past|previous|delivered|pending|cancelled|canceled|processing|confirmed|shipped)\s+)*(?:orders?|purchases)\b",
    r"\bwhat\s+(?:have\s+i\s+ordered|did\s+i\s+order|have\s+i\s+purchased)\b",
    r"\bwhich\s+products?\s+did\s+i\s+(?:order|purchase)\b",
    r"\bshow\s+(?:me\s+)?my\s+purchased\s+products\b",
    r"\bshow\s+(?:me\s+)?my\s+purchased\b.{1,50}",
    r"\b(?:show|list|view)\s+(?:me\s+)?(?:the\s+)?(?:items|products)\s+(?:in|from)\s+(?:my\s+)?(?:previous|past|recent)\s+order\b",
    r"\b(?:order\s+history|past\s+orders|my\s+orders|my\s+purchases)\b",
    r"\b(?:details|information|total\s+amount|order\s+date|order\s+number|order\s+id)\b.{0,45}\border\b",
    r"\border\b.{0,45}\b(?:details|information|total\s+amount|order\s+date|number|id)\b",
    r"\b(?:has|is|was|were)\s+(?:my\s+)?order\b.{0,35}\b(?:confirmed|processing|delivered|cancelled|canceled|pending)\b",
    r"\b(?:current\s+)?status\s+of\s+(?:my\s+)?order\b",
    r"\bmy\s+order\s+(?:current\s+)?status\b",
    r"\border\s+(?:current\s+)?status\b",
    r"\b(?:what\s+is|show\s+me)\s+(?:my\s+)?order\s+(?:number|id)\b",
)

# Catalogue discovery, product details, comparison, price, and availability.
_PRODUCT_QUERY_DETERMINERS = r"(?:a|an|some|any|the|available)"
_NON_PRODUCT_QUERY_STARTS = (
    r"(?:me|my|out|how|what|whether|something|anything|more|it|that|those|these|"
    r"second|first|one|way|problem|issue|solution|suggestions?|help|question|answer|reason|explanation|"
    r"details?|information|status|tracking|update|order|orders|cart|basket|purchased|"
    r"ordered|return|refund|replacement|policy|shipping|delivery|shipment|package|"
    r"account|support|website|platform|cancellation)"
)

PRODUCT_PATTERNS = _patterns(
    rf"\b(?:find|search\s+for|look\s+for|looking\s+for|browse|recommend)\s+(?:me\s+)?(?!(?:{_PRODUCT_QUERY_DETERMINERS}\s+)?{_NON_PRODUCT_QUERY_STARTS}\b)(?:{_PRODUCT_QUERY_DETERMINERS}\s+)?[\w][\w'’&./+-]*(?:\s+[\w][\w'’&./+-]*){{0,7}}",
    rf"\bshow\s+me\s+(?![^\n]*\b(?:in|from)\s+(?:my\s+)?(?:cart|basket)\b)(?!(?:{_PRODUCT_QUERY_DETERMINERS}\s+)?{_NON_PRODUCT_QUERY_STARTS}\b)(?:(?:{_PRODUCT_QUERY_DETERMINERS}|all)\s+)?[\w][\w'’&./+-]*(?:\s+[\w][\w'’&./+-]*){{0,7}}",
    rf"\bdo\s+you\s+(?:sell|have)\s+(?!(?:{_PRODUCT_QUERY_DETERMINERS}\s+)?{_NON_PRODUCT_QUERY_STARTS}\b)(?:{_PRODUCT_QUERY_DETERMINERS}\s+)?[\w][\w'’&./+-]*(?:\s+[\w][\w'’&./+-]*){{0,7}}",
    r"\b(?:find|search\s+for|look\s+for|looking\s+for|browse|recommend|show\s+me)\b.{0,60}\bunder\s+(?:₹|rs\.?\s*)?\d[\d,]*(?:\s*(?:inr|rupees?))?\b",
    r"\b(?:find|search\s+for|look\s+for|looking\s+for|browse|recommend)\s+(?:me\s+)?products?\s+from\s+(?:the\s+)?[\w' -]+\s+categor(?:y|ies)\b",
    r"\b(?:tell\s+me\s+about|details\s+about|information\s+about|specifications\s+for)\s+(?!.*\b(?:flatkart|company|order|return|refund|replacement|cart|basket|policy|account|website|platform)\b)(?:(?:a|an|the|this)\s+)?[\w][\w'’&./+-]*(?:\s+[\w][\w'’&./+-]*){0,6}",
    r"\b(?:is|are)\s+(?:(?:a|an|the|this|available)\s+)?(?!(?:my|order|cart|basket|return|refund|replacement|policy|shipping|delivery|shipment|package|account|support|website|platform|status)\b)[\w][\w'’&./+-]*(?:\s+[\w][\w'’&./+-]*){0,5}\s+(?:available|in\s+stock)\b",
    r"\b(?:find|search\s+for|look\s+for|looking\s+for|browse|recommend)\b.{0,35}\b(?:men'?s\s+|women'?s\s+|running\s+|wireless\s+|home\s+|electronics\s+)?(?:shirts?|dresses?|shoes?|headphones?|laptops?|phones?|products?|items?|clothing|appliances?|electronics\s+category)\b",
    r"\bshow(?:\s+me)?\s+(?:(?:some|available|all)\s+)?(?:men'?s\s+|women'?s\s+|running\s+|wireless\s+|home\s+|electronics\s+)?(?:shirts?|dresses?|shoes?|headphones?|laptops?|phones?|products?|items?|clothing|appliances?|electronics\s+category)\b(?!\s+in\s+(?:my\s+)?(?:cart|basket))",
    r"\bdo\s+you\s+(?:sell|have)\b.{0,35}\b(?:men'?s\s+|women'?s\s+|running\s+|wireless\s+|home\s+)?(?:shirts?|dresses?|shoes?|headphones?|laptops?|phones?|products?|items?|clothing|appliances?)\b",
    r"\bwhat\s+(?:shoes?|products?|laptops?|phones?|headphones?|home\s+appliances?)\s+do\s+you\s+have\b",
    r"\b(?:show|browse|find)\s+(?:me\s+)?products?\s+(?:in|under)\s+(?:the\s+)?[\w' -]+\s+categor(?:y|ies)\b",
    r"\b(?:tell\s+me\s+about|details\s+about|information\s+about)\s+(?:this\s+|the\s+)?(?:product|item|laptop|phone|headphones?)\b",
    r"\b(?:specifications|specs|features|price|cost|colour|color|variant|availability|stock)\b.{0,45}\b(?:product|item|phone|laptop|headphones?|shoes?|shirt|dress|variant|size)\b",
    r"\b(?:product|item|phone|laptop|headphones?|shoes?|shirt|dress|variant|size)\b.{0,45}\b(?:specifications|specs|features|price|cost|colour|color|variant|availability|available|in\s+stock)\b",
    r"\bhow\s+much\s+(?:is|are)\b.{0,45}\b(?:this|the|my)?\s*(?:product|item|phone|laptop|headphones?|shoes?|shirt|dress)\b",
    r"\bwhat\s+is\s+the\s+price\s+of\b.{0,45}\b(?:this|the|product|item|phone|laptop|headphones?|shoes?|shirt|dress)\b",
    r"\b(?:is|are)\s+(?:this\s+|the\s+)?(?:product|item|variant|size\s+[\w]+)\s+(?:available|in\s+stock)\b",
    r"\bdo\s+you\s+have\b.{0,45}\b(?:this\s+)?(?:product|item|variant|size\s+[\w]+)\s+(?:available|in\s+stock|in\s+another\s+colou?r)\b",
    r"\bcompare\b.{1,70}\b(?:products?|items?|phones?|laptops?|headphones?|models?)\b",
    r"\b(?:shirts?|shoes?|dresses?|phones?|laptops?|headphones?|products?|items?)\b.{0,35}\b(?:under|below|less\s+than|within)\s+(?:₹|rs\.?\s*)?\d[\d,]*(?:\s*(?:inr|rupees?))?\b",
)

# General website, account, and platform guidance. Broad "help" phrases are
# deliberately absent so they cannot steal a clear specialist request.
SUPPORT_PATTERNS = _patterns(
    r"\bhow\s+(?:do\s+i|can\s+i)\s+(?:use|navigate)\s+(?:this\s+|the\s+)?(?:website|platform|site|app)\b",
    r"\bhow\s+(?:do\s+i|can\s+i)\s+(?:create\s+an?\s+account|sign\s+in|log\s*in|access\s+my\s+profile|manage\s+my\s+account|use\s+the\s+search\s+bar)\b",
    r"\b(?:i\s+)?(?:cannot|can't|am\s+unable\s+to)\s+(?:access|log\s*in\s+to)\s+my\s+account\b",
    r"\b(?:i\s+)?need\s+(?:some\s+)?help\s+with\s+my\s+account\b",
    r"\bwhere\s+can\s+i\s+find\s+(?:my\s+)?(?:account\s+settings|profile)\b",
    r"\b(?:guide|walk)\s+me\s+through\s+(?:this\s+|the\s+)?(?:website|platform|site)\b",
    r"\b(?:i\s+am|i'm)\s+confused\s+about\s+(?:this\s+|the\s+)?(?:website|platform|site)\b",
    r"\b(?:problem|issue|trouble)\b.{0,40}\b(?:using|with)\s+(?:this\s+|the\s+)?(?:website|platform|site|app)\b",
    r"\bwhat\s+can\s+i\s+do\s+on\s+(?:this\s+|the\s+)?platform\b",
    r"\b(?:i\s+)?need\s+(?:general\s+)?(?:assistance|help)\s+(?:using|with)\s+(?:this\s+|the\s+)?(?:website|platform|site|account)\b",
    r"\b(?:website|platform|site|app)\s+(?:is\s+)?not\s+working\b",
    r"\bi\s+need\s+general\s+assistance\b",
)

ROUTE_PATTERNS = (
    ("returns", RETURNS_PATTERNS),
    ("order", ORDER_PATTERNS),
    ("shipping", SHIPPING_PATTERNS),
    ("cart", CART_PATTERNS),
    ("product", PRODUCT_PATTERNS),
    ("knowledge", KNOWLEDGE_PATTERNS),
    ("support", SUPPORT_PATTERNS),
)


def detect_intent_deterministic(question: str) -> str | None:
    """Return one clear allowed route, or None for ambiguity/fallback."""
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
