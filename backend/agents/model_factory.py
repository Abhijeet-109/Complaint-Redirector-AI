
import os

from dotenv import load_dotenv
from langchain_groq import ChatGroq
from langchain_openai import ChatOpenAI

load_dotenv()

# Manageable Model config 
MODEL_CONFIG = {
    "supervisor": {
        "provider": "groq",
        "model": "openai/gpt-oss-120b",
        "fallback_provider": "openrouter",
        "fallback_model": "nvidia/nemotron-3.5-lightning:free",
    },
    "order": {
        "provider": "openrouter",
        "model": "nvidia/nemotron-3-ultra-550b-a55b:free",
        "fallback_provider": "groq",
        "fallback_model": "openai/gpt-oss-120b",
    },
    "customer_support": {
        "provider": "groq",
        "model": "openai/gpt-oss-120b",
        "fallback_provider": "openrouter",
        "fallback_model": "nvidia/nemotron-3.5-lightning:free",
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
            f"{settings['key']} is missing from the .env file"
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
    config = MODEL_CONFIG[agent_name]

    try:
        primary = _build_model(
            config["provider"],
            config["model"],
        )
    except ValueError:
        # Use fallback if the primary provider's key is missing
        primary = _build_model(
            config["fallback_provider"],
            config["fallback_model"],
        )
        return primary

    fallback = _build_model(
        config["fallback_provider"],
        config["fallback_model"],
    )

    # Retry with the fallback if the primary invocation fails.
    return primary.with_fallbacks([fallback])
