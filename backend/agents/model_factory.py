import os
import logging

from dotenv import load_dotenv
from langchain_groq import ChatGroq
from langchain_openai import ChatOpenAI

load_dotenv()

logger = logging.getLogger(__name__)


MODEL_CONFIG = {
    "supervisor": {
        "provider": "groq",
        "model": "openai/gpt-oss-120b",
        "fallback_provider": "openrouter",
        "fallback_model": "google/gemma-4-26b-a4b-it:free",
    },

    # "knowledge": {
    #     "provider": "openrouter",
    #     "model": "google/gemma-4-26b-a4b-it:free",
    #     "fallback_provider": "groq",
    #     "fallback_model": "openai/gpt-oss-120b",
    # },

    "product": {
        "provider": "openrouter",
        "model": "nvidia/nemotron-3-ultra-550b-a55b:free",
        "fallback_provider": "openrouter",
        "fallback_model": "google/gemma-4-26b-a4b-it:free",
    },

    "cart": {
        "provider": "groq",
        "model": "openai/gpt-oss-20b",
        "fallback_provider": "openrouter",
        "fallback_model": "google/gemma-4-26b-a4b-it:free",
    },

    "order": {
        "provider": "groq",
        "model": "qwen/qwen3.8-27b",
        "fallback_provider": "openrouter",
        "fallback_model": "google/gemma-4-26b-a4b-it:free",
    },

    "shipping": {
        "provider": "groq",
        "model": "openai/gpt-oss-20b",
        "fallback_provider": "openrouter",
        "fallback_model": "google/gemma-4-26b-a4b-it:free",
    },

    "returns": {
        "provider": "groq",
        "model": "qwen/qwen3.8-27b",
        "fallback_provider": "openrouter",
        "fallback_model": "google/gemma-4-26b-a4b-it:free",
    },

    "support": {
        "provider": "groq",
        "model": "openai/gpt-oss-120b",
        "fallback_provider": "openrouter",
        "fallback_model": "google/gemma-4-26b-a4b-it:free",
    },
}


PROVIDERS = {
    "groq": {
        "class": ChatGroq,
        "key": "GROQ_API_KEY",
        "base_url": None,
    },

    "openrouter": {
        "class": ChatOpenAI,
        "key": "OPENROUTER_API_KEY",
        "base_url": "https://openrouter.ai/api/v1",
    },
    "openai": {
        "class": ChatOpenAI,
        "key": "OPENAI_API_KEY",
        "base_url": None,
    },
}


def _build_model(provider: str, model_name: str):

    if provider not in PROVIDERS:
        raise ValueError(f"Unsupported provider: {provider}")

    settings = PROVIDERS[provider]
    api_key = os.getenv(settings["key"])

    if not api_key:
        raise ValueError(
            f"{settings['key']} is missing from .env"
        )

    if provider == "groq":
        return ChatGroq(
            model=model_name,
            api_key=api_key,
            temperature=0,
            max_tokens=1000,
        )

    return ChatOpenAI(
        model=model_name,
        api_key=api_key,
        base_url=settings["base_url"],
        temperature=0,
        max_tokens=1000,
        timeout=60,
        max_retries=0,
    )


def get_model(agent_name: str):

    if agent_name not in MODEL_CONFIG:
        raise ValueError(
            f"Model configuration not found: {agent_name}"
        )

    config = MODEL_CONFIG[agent_name]

    try:
        primary = _build_model(
            config["provider"],
            config["model"],
        )

    except ValueError:
        logger.warning(
            "Primary model unavailable for %s. Trying fallback.",
            agent_name,
        )

        return _build_model(
            config["fallback_provider"],
            config["fallback_model"],
        )

    try:
        fallback = _build_model(
            config["fallback_provider"],
            config["fallback_model"],
        )

        return primary.with_fallbacks([fallback])

    except ValueError:
        logger.warning(
            "Fallback unavailable for %s. Using primary model only.",
            agent_name,
        )

        return primary