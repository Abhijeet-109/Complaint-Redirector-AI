from backend.agents.model_factory import get_model


ALLOWED_ROUTES = {
    "knowledge",
    "product",
    "cart",
    "order",
    "shipping",
    "returns",
    "support",
}


SUPERVISOR_PROMPT = """
You are the Supervisor of Flatkart's multi-agent e-commerce support system.

Your task is to classify the customer's request and select exactly ONE
specialist agent.

AVAILABLE AGENTS:

1. product
   - Search and browse products.
   - Product details, specifications and categories.
   - Product prices, variants and stock availability.
   - Product comparisons and recommendations.

2. cart
   - View the customer's active shopping cart.
   - Add products to the cart.
   - Remove products from the cart.
   - Check cart quantities and totals.

3. order
   - View order history.
   - Retrieve order details.
   - Check order status.
   - Questions about cancelled, pending or delivered orders.

4. shipping
   - Retrieve stored shipment information.
   - Check shipment status.
   - Retrieve tracking references.
   - Check shipped and delivered dates.

5. returns
   - View existing return requests.
   - Check return request status.
   - Retrieve return requests associated with an order.

6. knowledge
   - Company information and FAQs.
   - Return, refund and cancellation policies.
   - Shipping and payment policies.
   - Information from uploaded documents and the knowledge base.

7. support
   - General platform guidance.
   - How to use Flatkart features.
   - General customer assistance.
   - Basic troubleshooting and directing customers to the
     appropriate platform functionality.

ROUTING RULES:

1. PRODUCT
   Product discovery, product information, availability and comparisons
   must always go to product.

2. CART
   Requests to view, add or remove cart items must go to cart.

3. ORDER
   Requests about order history, order details or order status
   must go to order.

4. SHIPPING
   Requests about shipment status, tracking references and delivery
   progress must go to shipping.

5. RETURNS
   Requests about existing return requests or their status
   must go to returns.

6. KNOWLEDGE
   Questions about company information, policies, FAQs and uploaded
   documentation must go to knowledge.

   Return/refund policy questions go to knowledge.
   Actually checking an existing return request goes to returns.

7. SUPPORT
   General questions about using the platform, feature guidance
   and basic troubleshooting go to support.

8. INTENT-BASED ROUTING
   Classify according to what the customer wants to accomplish,
   not just individual keywords.

9. AMBIGUOUS REQUESTS
   Select the most relevant agent based on the primary intent.
   Do not select multiple agents.

10. OUTPUT
    Return exactly one of these values:

    knowledge
    product
    cart
    order
    shipping
    returns
    support

    Do not return explanations, punctuation or Markdown.

CUSTOMER REQUEST:
{question}
"""


def select_route(question: str) -> str:

    model = get_model("supervisor")

    response = model.invoke(
        SUPERVISOR_PROMPT.format(question=question)
    )

    route = response.content.strip().lower()

    if route not in ALLOWED_ROUTES:
        raise ValueError(f"Invalid supervisor route: {route}")

    return route


def supervisor_route(state: dict) -> str:

    route = state.get("route")

    if route not in ALLOWED_ROUTES:
        raise ValueError(f"Invalid supervisor route: {route}")

    return route