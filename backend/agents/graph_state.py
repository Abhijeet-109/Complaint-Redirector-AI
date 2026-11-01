from typing import TypedDict, Any


class GraphState(TypedDict, total=False):
    user_input: Any
    route: str
    answer: dict[str, Any]