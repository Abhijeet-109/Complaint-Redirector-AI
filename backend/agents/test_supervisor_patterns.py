"""Focused ownership and collision tests for Supervisor intent routing."""

import unittest

from backend.agents.supervisor.patterns import ROUTE_PATTERNS, detect_intent_deterministic
from backend.agents.supervisor.guardrails import ALLOWED_ROUTES


POSITIVE_CASES = {
    "returns": (
        "I want to return my order.",
        "I need to send this product back.",
        "I received a damaged product and want to return it.",
        "Start a return for my recent purchase.",
        "I want a replacement.",
        "Send me another unit instead.",
        "I received the wrong product and want it replaced.",
        "I want to exchange this item through the return process.",
        "I want a refund for my returned product.",
        "Where is my refund for my return?",
        "Check my return request.",
        "Show my return request status.",
        "Has my return been approved?",
        "What is the status of my refund request?",
        "What is happening with my replacement?",
        "Provide more information for my existing return request.",
        "Track my return pickup status.",
    ),
    "order": (
        "Show my orders.",
        "Display all my purchases.",
        "What have I ordered recently?",
        "Show my delivered orders.",
        "List my pending orders.",
        "Show my cancelled orders.",
        "Find orders placed last month.",
        "Show my order details.",
        "What is the total amount of my order?",
        "Which products did I purchase?",
        "Show the items in my previous order.",
        "Has my order been confirmed?",
        "Is my order processing?",
        "Is my order delivered?",
        "Has my order been cancelled?",
        "What is the current status of order #123?",
        "Order status.",
        "Show my purchased products.",
    ),
    "shipping": (
        "Where is my order?",
        "Track my package.",
        "Where is my parcel?",
        "Can you check my shipment?",
        "When will my package arrive?",
        "What happened to my order?",
        "Why has my package not arrived?",
        "Has my order been dispatched?",
        "Is my package out for delivery?",
        "Has the courier attempted delivery?",
        "Show my latest delivery updates.",
        "Delivery updates.",
        "What is the latest update on my shipment?",
        "Has the package reached the delivery hub?",
        "Why is my shipment delayed?",
        "Where is my delivered order now?",
        "I need help tracking my package.",
    ),
    "cart": (
        "Show my cart.",
        "What is in my shopping cart?",
        "How many items are in my cart?",
        "Show me the products in my cart.",
        "Add this product to my cart.",
        "Put this shirt in my cart.",
        "I want to add this product to my basket.",
        "Add two units of this item to my cart.",
        "Increase the quantity of this cart item.",
        "Reduce the quantity of the item in my basket to one.",
        "Set the cart item's quantity to three.",
        "Update the quantity of this product in my cart.",
        "I want two more of this product in my cart.",
        "Remove this item from my cart.",
        "Delete the selected product from my basket.",
        "Clear my cart.",
        "Remove everything from my shopping cart.",
        "Empty my basket.",
    ),
    "product": (
        "Find me a men's shirt.",
        "Find me a Samsung Galaxy S25.",
        "Show me Nike Air Max.",
        "Tell me about Samsung Galaxy S25.",
        "Search for a gaming keyboard.",
        "Find a wooden study table.",
        "Do you have a refrigerator?",
        "I am looking for a Bluetooth speaker.",
        "Show me products under ₹5,000.",
        "Find a product from the electronics category.",
        "Is a gaming keyboard available?",
        "Show me women's dresses.",
        "I am looking for running shoes.",
        "Do you sell wireless headphones?",
        "Do you have wireless headphones?",
        "Find a laptop under ₹50,000.",
        "Show products in the electronics category.",
        "Browse men's clothing.",
        "What shoes do you have?",
        "Show available home appliances.",
        "Tell me about this product.",
        "What are the specifications of this laptop?",
        "Compare these two phones.",
        "What is the price of this item?",
        "Is this product available?",
        "Do you have this product in another colour?",
        "Is size L available?",
    ),
    "knowledge": (
        "What is your return policy?",
        "What is your refund policy?",
        "Can I return an opened product?",
        "What is your replacement policy?",
        "How long does a refund take according to policy?",
        "Am I eligible for a return?",
        "Can I get a refund for a damaged product?",
        "What are the conditions for replacement?",
        "What is the return window?",
        "What is your delivery policy?",
        "Which payment methods do you accept?",
        "What is your cancellation policy?",
        "Tell me about Flatkart.",
        "Do you offer warranty?",
        "What are your terms and conditions?",
        "How can I contact customer support?",
        "How do I return this item?",
        "How do I cancel an order?",
        "Can I get a refund under your policy?",
    ),
    "support": (
        "How do I use this website?",
        "How can I navigate the platform?",
        "Where can I find my account settings?",
        "I cannot access my account.",
        "I need help with my account.",
        "How do I create an account?",
        "How do I sign in?",
        "How can I use the search bar?",
        "How do I manage my account?",
        "I need help using the website.",
        "I am confused about the platform.",
        "I am having a problem using the website.",
        "The website is not working.",
        "Can you guide me through the website?",
        "What can I do on this platform?",
        "I need general assistance.",
    ),
}


# These verify that similar wording still belongs to the specialist whose
# records or operation the customer is asking about.
OWNERSHIP_CASES = (
    ("What is your return policy?", "knowledge"),
    ("I want to return my order.", "returns"),
    ("Can I get a refund under your policy?", "knowledge"),
    ("Check my existing refund request.", "returns"),
    ("Show my delivered orders.", "order"),
    ("Where is my delivered order now?", "shipping"),
    ("Find me a men's shirt.", "product"),
    ("Add this shirt to my cart.", "cart"),
    ("Show me products in my cart.", "cart"),
    ("How do I use this website?", "support"),
    ("I need help tracking my order.", "shipping"),
    ("Show my purchased products.", "order"),
    ("What is my order status?", "order"),
    ("What is my delivery status?", "shipping"),
)


PRODUCT_CART_OWNERSHIP_CASES = (
    ("Find me a gaming keyboard.", "product"),
    ("Add this gaming keyboard to my cart.", "cart"),
    ("Show my purchased keyboard.", "order"),
    ("Is the keyboard I ordered eligible for return?", "knowledge"),
    ("I want to return my keyboard.", "returns"),
)


ORDER_CANCELLATION_CASES = (
    ("Cancel my order.", None),
    ("I want to cancel order #123.", None),
    ("What is your cancellation policy?", "knowledge"),
    ("How do I cancel an order?", "knowledge"),
    ("Show my cancelled orders.", "order"),
    ("Has my order been cancelled?", "order"),
)


CART_QUANTITY_CASES = (
    ("Increase the quantity of this cart item.", "cart"),
    ("Reduce the quantity of the item in my basket to one.", "cart"),
    ("Set the cart item's quantity to three.", "cart"),
    ("Add two units of this item to my cart.", "cart"),
    ("I want two more of this product in my cart.", "cart"),
    ("Make it three units in my cart.", "cart"),
    ("What is the required quantity for this recipe?", None),
    ("How many units does this product contain?", None),
    ("Update the quantity in my order.", None),
    ("Make it three units.", None),
)


GENERIC_PRODUCT_FALSE_POSITIVE_CASES = (
    ("Do you have any suggestions?", None),
    ("Show me something.", None),
    ("Find me a solution.", None),
    ("Can you help me?", None),
    ("Do you have any information?", None),
    ("What about the second one?", None),
    ("Show the second one.", None),
    ("What is its status?", None),
    ("Find me a problem with my order.", None),
)


ARBITRARY_PRODUCT_CASES = (
    ("Find me a Samsung Galaxy S25.", "product"),
    ("Show me Nike Air Max.", "product"),
    ("Search for a gaming keyboard.", "product"),
    ("Find a wooden study table.", "product"),
    ("Do you have a refrigerator?", "product"),
    ("I am looking for a Bluetooth speaker.", "product"),
    ("Show me products under â‚¹5,000.", "product"),
    ("Find products in the electronics category.", "product"),
)


SELECTED_PRODUCTS_CART_CASES = (
    ("Show selected products.", None),
    ("Display my selected products.", None),
    ("Show my selected products in the cart.", "cart"),
    ("Show the products in my basket.", "cart"),
)


AMBIGUOUS_CASES = (
    "I have an issue with my order.",
    "Find me a problem with my order.",
    "I need help with a product.",
    "I want to know about my order and return.",
    "I need assistance with delivery and refund.",
    "Can you help me with this?",
    "What about now?",
    "Make it three.",
    "Show the second one.",
    "What is its status?",
    "Make it three units.",
    "Make it three units while my cart is open.",
    "Find me a shirt and add one to my cart.",
    "List my orders and check my return request.",
    "Track my package and check my return pickup status.",
    "Where is my order and what is its cancellation policy?",
    "Has my refund been processed?",
)


GENUINE_MULTI_INTENT_CASES = (
    "Find me a shirt and add one to my cart.",
    "List my orders and check my return request.",
    "Track my package and check my return pickup status.",
    "Where is my order and what is its cancellation policy?",
)


BOUNDARY_CASES = (
    "",
    "   \t  ",
    "return",
    "refund",
    "order",
    "delivery",
    "status",
    "help",
    "product",
    "retun policy",
    "Can I add this item later?",
    "Tell me a joke.",
)


def matched_routes(question: str) -> set[str]:
    return {
        route
        for route, patterns in ROUTE_PATTERNS
        if any(pattern.search(question) for pattern in patterns)
    }


class SupervisorPatternTests(unittest.TestCase):
    def test_all_seven_allowed_routes_have_patterns(self):
        self.assertEqual({route for route, _ in ROUTE_PATTERNS}, ALLOWED_ROUTES)

    def test_positive_routes_and_single_pattern_ownership(self):
        for route, questions in POSITIVE_CASES.items():
            for question in questions:
                with self.subTest(route=route, question=question):
                    self.assertEqual(detect_intent_deterministic(question), route)
                    self.assertEqual(matched_routes(question), {route})

    def test_ownership_contrasts_do_not_collide(self):
        for question, route in OWNERSHIP_CASES:
            with self.subTest(question=question):
                self.assertEqual(detect_intent_deterministic(question), route)
                self.assertEqual(matched_routes(question), {route})

    def test_product_cart_ownership_contrasts(self):
        for question, route in PRODUCT_CART_OWNERSHIP_CASES:
            with self.subTest(question=question):
                self.assertEqual(detect_intent_deterministic(question), route)
                self.assertEqual(matched_routes(question), {route})

    def test_order_cancellation_requests_are_not_routed_to_order(self):
        for question, expected in ORDER_CANCELLATION_CASES:
            with self.subTest(question=question):
                self.assertEqual(detect_intent_deterministic(question), expected)

    def test_cart_quantity_requires_cart_or_basket_context(self):
        for question, expected in CART_QUANTITY_CASES:
            with self.subTest(question=question):
                self.assertEqual(detect_intent_deterministic(question), expected)

    def test_generic_product_questions_fall_back(self):
        for question, expected in GENERIC_PRODUCT_FALSE_POSITIVE_CASES:
            with self.subTest(question=question):
                self.assertEqual(detect_intent_deterministic(question), expected)

    def test_arbitrary_catalogue_searches_route_to_product(self):
        for question, expected in ARBITRARY_PRODUCT_CASES:
            with self.subTest(question=question):
                self.assertEqual(detect_intent_deterministic(question), expected)

    def test_selected_products_require_cart_or_basket_context(self):
        for question, expected in SELECTED_PRODUCTS_CART_CASES:
            with self.subTest(question=question):
                self.assertEqual(detect_intent_deterministic(question), expected)

    def test_ambiguous_and_multi_intent_messages_fall_back(self):
        for question in AMBIGUOUS_CASES:
            with self.subTest(question=question):
                self.assertIsNone(detect_intent_deterministic(question))

        for question in GENUINE_MULTI_INTENT_CASES:
            with self.subTest(multiple_intents=question):
                self.assertGreater(len(matched_routes(question)), 1)

    def test_boundaries_and_unrecognized_keywords_fall_back(self):
        for question in BOUNDARY_CASES:
            with self.subTest(question=question):
                self.assertIsNone(detect_intent_deterministic(question))

    def test_case_punctuation_spacing_and_long_context(self):
        self.assertEqual(detect_intent_deterministic("WHAT IS YOUR RETURN POLICY?!"), "knowledge")
        self.assertEqual(detect_intent_deterministic("Show my cart!!!"), "cart")
        self.assertEqual(detect_intent_deterministic("How   do I return this item?"), "knowledge")
        self.assertEqual(detect_intent_deterministic(("irrelevant context " * 80) + "Show my cart."), "cart")


if __name__ == "__main__":
    unittest.main()
