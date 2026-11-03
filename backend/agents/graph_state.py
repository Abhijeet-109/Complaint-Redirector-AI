from typing import Annotated, TypedDict, Any

from langchain_core.messages import AnyMessage
from langgraph.graph.message import add_messages


class GraphState(TypedDict, total=False):

    user_input: Any

    question: str

    request_id: str | None

    last_request_id: str | None

    user_id: int

    route: str

    answer: dict[str, Any]

    messages: Annotated[list[AnyMessage], add_messages]
