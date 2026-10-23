import logging

from langchain_groq import ChatGroq
from langchain_classic.memory import ConversationSummaryBufferMemory

logger = logging.getLogger(__name__)

memory_model = ChatGroq(
    model_name="openai/gpt-oss-120b",
    temperature=0,
    max_tokens=1000
)

# Separate memory object for each conversation session
conversation_memories = {}


def get_memory(session_id: str):
    if session_id not in conversation_memories:
        conversation_memories[session_id] = ConversationSummaryBufferMemory(
            llm=memory_model,
            max_token_limit=4000,
            return_messages=True,
            memory_key="chat_history",
            input_key="question",
            output_key="answer"
        )

        logger.info("[CHATBOT] Conversation memory created.")

    return conversation_memories[session_id]


def save_exchange(session_id: str, question: str, answer: str):
    memory = get_memory(session_id)

    memory.save_context(
        {"question": question},
        {"answer": answer}
    )

    logger.info("[CHATBOT] Conversation exchange saved.")


def get_conversation_history(session_id: str):
    memory = get_memory(session_id)
    return memory.load_memory_variables({})["chat_history"]