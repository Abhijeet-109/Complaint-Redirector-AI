from typing import TypedDict, Any
from backend.api.routes.chatbot import ChatRequest


class GraphState(TypedDict, total=False):
    user_input: ChatRequest
    route: str
    answer: dict[str, Any]