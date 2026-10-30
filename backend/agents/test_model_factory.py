import os

from backend.agents.model_factory import get_model

os.environ["SUPERVISOR_PROVIDER"] = "invalid_provider"

try:
    get_model("supervisor")
except Exception as error:
    print(type(error).__name__, error)