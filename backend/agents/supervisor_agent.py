
from backend.agents.model_factory import get_model


def select_route(question: str) -> str:
    model = get_model("supervisor")

    prompt = f"""
You are the supervisor of a multi-agent e-commerce support system.

Your task is to classify the user's query and route it to exactly ONE
specialist agent that is best suited to handle the request.

AVAILABLE SPECIALIST AGENTS:

1. product
   Handles all product-related requests, including:
   - Searching, browsing, and discovering products.
   - Listing products or showing available products.
   - Searching by product name, keyword, or description.
   - Filtering products by category, brand, price, or attributes.
   - Retrieving product details and specifications.
   - Checking product prices, stock, and availability.
   - Finding product variants, sizes, and colors.
   - Comparing multiple products.
   - Product recommendations and purchase-related product queries.

2. order
   Handles customer-specific order requests, including:
   - Viewing orders and order history.
   - Retrieving details of a particular order.
   - Checking order status and delivery information.
   - Tracking shipments.
   - Questions about cancelled, delivered, or pending orders.

3. knowledge
   Handles company and knowledge-base-related requests, including:
   - Company information and general business queries.
   - FAQs and customer support information.
   - Return, refund, cancellation, and shipping policies.
   - Payment methods and payment-related policies.
   - Information contained in uploaded documents.
   - General information available in the knowledge base.

ROUTING RULES:

1. PRODUCT PRIORITY:
   If the user is asking to search, browse, discover, list, compare,
   or retrieve information about products, ALWAYS select product.

   Examples:
   - "Show me all available shirts" -> product
   - "Find red sneakers" -> product
   - "What products do you sell?" -> product
   - "Show products under ₹1000" -> product
   - "Compare these two laptops" -> product

2. ORDER PRIORITY:
   If the user is asking about their own orders, order history,
   order status, or shipment tracking, select order.

   Examples:
   - "Show my recent orders" -> order
   - "Where is my order?" -> order
   - "Show my cancelled orders" -> order

3. KNOWLEDGE ROUTING:
   If the user is asking about company information, policies,
   FAQs, or uploaded documentation, select knowledge.

   Examples:
   - "What is your return policy?" -> knowledge
   - "How can I request a refund?" -> knowledge
   - "What payment methods do you support?" -> knowledge

4. INTENT-BASED CLASSIFICATION:
   Classify based on what the user wants to accomplish, not just
   individual keywords.

5. DO NOT CONFUSE PRODUCT AND KNOWLEDGE QUERIES:
   Product searches and product availability questions must go
   to product, even if the user uses general language.

   Questions about company policies related to returns, refunds,
   shipping, or payments must go to knowledge.

6. SINGLE AGENT:
   Select exactly one agent. Never combine multiple agent names.

7. AMBIGUOUS QUERIES:
   If the request clearly refers to a previous discussion, use its
   context to identify the relevant specialist.
   Otherwise, select the agent that best matches the primary intent.

USER QUESTION:
{question}

OUTPUT FORMAT:
Return exactly one of these agent names:

knowledge
product
order

Do not provide explanations, punctuation, additional text,
or Markdown formatting.
"""

    response = model.invoke(prompt)

    route = response.content.strip().lower()

    allowed_routes = ["knowledge", "product", "order"]

    if route not in allowed_routes:
        raise ValueError(f"Invalid supervisor route: {route}")

    return route


def supervisor_route(state: dict) -> str:
    route = state.get("route")

    if route in ["knowledge", "product", "order"]:
        return route

    raise ValueError(f"Invalid supervisor route: {route}")
