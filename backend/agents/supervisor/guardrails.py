"""Supervisor route validation and routing restrictions."""

ALLOWED_ROUTES = {
    "knowledge",
    "product",
    "cart",
    "order",
    "shipping",
    "returns",
    "support",
}


def validate_route(route: str) -> str:
    """
    Validate that the route is allowed.
    Returns the validated route or raises ValueError.
    """
    route = route.strip().lower()
    if route not in ALLOWED_ROUTES:
        raise ValueError(f"Invalid supervisor route: {route}")
    return route


def supervisor_route(state: dict) -> str:
    """
    Extract and validate route from graph state.
    Used as the conditional edge function in LangGraph.
    """
    route = state.get("route")
    return validate_route(route)