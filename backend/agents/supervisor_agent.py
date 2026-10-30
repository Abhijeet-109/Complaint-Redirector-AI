def supervisor_route(state: dict) -> str:
    route = state.get("route")

    if route == "knowledge":
        return "knowledge"

    raise ValueError(f"Invalid supervisor route: {route}")