from typing import Annotated, TypedDict, Any

from langchain_core.messages import AnyMessage
from langgraph.graph.message import add_messages


class GraphState(TypedDict, total=False):

    user_input: Any

    question: str

    request_id: str | None

    last_request_id: str | None

    user_id: int

    thread_id: str

    order_id: int | None

    order_item_id: int | None

    return_submission_key: str | None

    return_intake: dict[str, Any]

    route: str

    answer: dict[str, Any]

    messages: Annotated[list[AnyMessage], add_messages]
