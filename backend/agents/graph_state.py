from typing import TypedDict, Any


class GraphState(TypedDict, total=False):

    user_input: Any

    user_id: int

    route: str

    answer: dict[str, Any]