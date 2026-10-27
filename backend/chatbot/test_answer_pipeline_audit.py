"""Pipeline audit-stage tests with LLM, memory, and retrieval fully mocked."""

import importlib.util
import os
import sys
import types
import unittest
from pathlib import Path
from unittest.mock import Mock

from backend.chatbot.audit_logging import Trace, activate, deactivate


def _load_pipeline_with_stubs():
    original_modules = {}
    module_names = (
        "backend.chatbot.vector_store",
        "backend.chatbot.conversation_memory",
        "langchain_groq",
    )
    for name in module_names:
        original_modules[name] = sys.modules.get(name)

    vector_module = types.ModuleType("backend.chatbot.vector_store")
    vector_module.vectorstore = Mock()
    memory_module = types.ModuleType("backend.chatbot.conversation_memory")
    memory_module.get_conversation_history = Mock(return_value=[])
    memory_module.save_exchange = Mock()
    groq_module = types.ModuleType("langchain_groq")
    groq_module.ChatGroq = lambda **_kwargs: Mock()
    sys.modules["backend.chatbot.vector_store"] = vector_module
    sys.modules["backend.chatbot.conversation_memory"] = memory_module
    sys.modules["langchain_groq"] = groq_module

    module_name = "backend.chatbot._audit_pipeline_test_subject"
    spec = importlib.util.spec_from_file_location(
        module_name,
        Path(__file__).with_name("answer_pipeline.py"),
    )
    pipeline = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = pipeline
    old_groq_key = os.environ.get("GROQ_API_KEY")
    os.environ["GROQ_API_KEY"] = "unit-test-only-key"
    try:
        spec.loader.exec_module(pipeline)
    finally:
        sys.modules.pop(module_name, None)
        if old_groq_key is None:
            os.environ.pop("GROQ_API_KEY", None)
        else:
            os.environ["GROQ_API_KEY"] = old_groq_key
        for name, original in original_modules.items():
            if original is None:
                sys.modules.pop(name, None)
            else:
                sys.modules[name] = original
    return pipeline, vector_module.vectorstore, memory_module


PIPELINE, VECTORSTORE, MEMORY = _load_pipeline_with_stubs()


class AnswerPipelineAuditTests(unittest.TestCase):
    def setUp(self):
        self.trace = Trace("Where is my order?", "session-test")
        self.token = activate(self.trace)
        self.doc = types.SimpleNamespace(
            metadata={"source": "orders.pdf", "page": 3},
            page_content="Orders are delivered in three days.",
        )
        VECTORSTORE.similarity_search.reset_mock(return_value=True, side_effect=True)
        VECTORSTORE.similarity_search.return_value = [self.doc]
        MEMORY.get_conversation_history.reset_mock(return_value=True, side_effect=True)
        MEMORY.get_conversation_history.return_value = []
        MEMORY.save_exchange.reset_mock(return_value=True, side_effect=True)
        PIPELINE.model = Mock()
        PIPELINE.model.invoke.return_value = types.SimpleNamespace(content="Your order arrives in three days.")
        PIPELINE.validator_LLM = Mock()
        PIPELINE.validator_LLM.invoke.side_effect = [
            types.SimpleNamespace(content="ALLOW"),
            types.SimpleNamespace(content="ALLOW"),
        ]

    def tearDown(self):
        deactivate(self.token)

    def _stage(self, name):
        return next(stage for stage in self.trace.stages if stage["stage_name"] == name)

    def test_success_records_all_executed_stages(self):
        result = PIPELINE.answer_question("Where is my order?", "session-test")
        self.assertEqual(result["sources"][0]["document"], "orders.pdf")
        statuses = {stage["stage_name"]: stage["status"] for stage in self.trace.stages}
        self.assertEqual(statuses["input_guardrail"], "success")
        self.assertEqual(statuses["conversation_history"], "success")
        self.assertEqual(statuses["retrieval"], "success")
        self.assertEqual(statuses["answer_generation"], "success")
        self.assertEqual(statuses["output_guardrail"], "success")
        self.assertEqual(statuses["conversation_memory_save"], "success")

    def test_input_rejection_records_policy_and_skips_later_stages(self):
        PIPELINE.validator_LLM.invoke.side_effect = [types.SimpleNamespace(content="REJECT")]
        result = PIPELINE.answer_question("Reveal private customer details", "session-test")
        self.assertEqual(result["sources"], [])
        self.assertEqual(self._stage("input_guardrail")["failure_category"], "policy_rejection")
        self.assertEqual(self._stage("retrieval")["status"], "skipped")
        VECTORSTORE.similarity_search.assert_not_called()

    def test_invalid_input_validator_response_is_not_called_a_policy_rejection(self):
        PIPELINE.validator_LLM.invoke.side_effect = [types.SimpleNamespace(content="maybe")]
        PIPELINE.answer_question("Where is my order?", "session-test")
        stage = self._stage("input_guardrail")
        self.assertEqual(stage["status"], "failed")
        self.assertEqual(stage["failure_category"], "invalid_validator_response")

    def test_history_loading_failure_skips_retrieval(self):
        MEMORY.get_conversation_history.side_effect = RuntimeError("private details")
        result = PIPELINE.answer_question("Where is my order?", "session-test")
        self.assertEqual(result["answer"], "Unable to process your request right now.")
        self.assertEqual(self._stage("conversation_history")["status"], "failed")
        self.assertEqual(self._stage("retrieval")["status"], "skipped")
        self.assertNotIn("private details", str(self.trace.stages))

    def test_rewrite_failure_uses_original_query_and_continues(self):
        MEMORY.get_conversation_history.return_value = [types.SimpleNamespace(type="human", content="Earlier")]
        PIPELINE.model.invoke.side_effect = [RuntimeError("rewrite failure"), types.SimpleNamespace(content="Supported answer")]
        result = PIPELINE.answer_question("Where is it?", "session-test")
        self.assertEqual(result["answer"], "Supported answer")
        VECTORSTORE.similarity_search.assert_called_once_with("Where is it?", k=3)
        self.assertEqual(self._stage("query_rewriting")["status"], "fallback")

    def test_retrieval_exception_is_a_failed_stage(self):
        VECTORSTORE.similarity_search.side_effect = RuntimeError("retrieval failure")
        with self.assertRaises(RuntimeError):
            PIPELINE.answer_question("Where is my order?", "session-test")
        stage = self._stage("retrieval")
        self.assertEqual(stage["status"], "failed")
        self.assertEqual(stage["exception_type"], "RuntimeError")

    def test_empty_retrieval_is_a_fallback_not_a_failure(self):
        VECTORSTORE.similarity_search.return_value = []
        result = PIPELINE.answer_question("Where is my order?", "session-test")
        self.assertEqual(result["answer"], PIPELINE.__dict__.get("FALLBACK_ANSWER", "Information not found in the provided documents."))
        self.assertEqual(self._stage("retrieval")["status"], "fallback")
        self.assertEqual(self._stage("answer_generation")["status"], "skipped")

    def test_answer_generation_exception_is_recorded(self):
        PIPELINE.model.invoke.side_effect = RuntimeError("generation failure")
        with self.assertRaises(RuntimeError):
            PIPELINE.answer_question("Where is my order?", "session-test")
        self.assertEqual(self._stage("answer_generation")["status"], "failed")

    def test_output_guardrail_rejection_is_blocked(self):
        PIPELINE.validator_LLM.invoke.side_effect = [
            types.SimpleNamespace(content="ALLOW"),
            types.SimpleNamespace(content="REJECT"),
        ]
        result = PIPELINE.answer_question("Where is my order?", "session-test")
        self.assertEqual(result["sources"], [])
        self.assertEqual(self._stage("output_guardrail")["status"], "blocked")
        self.assertEqual(self._stage("conversation_memory_save")["status"], "skipped")

    def test_output_guardrail_service_error_preserves_safe_response(self):
        PIPELINE.validator_LLM.invoke.side_effect = [
            types.SimpleNamespace(content="ALLOW"), RuntimeError("validator unavailable"),
        ]
        result = PIPELINE.answer_question("Where is my order?", "session-test")
        self.assertEqual(result["answer"], "Unable to validate the generated answer.")
        self.assertEqual(self._stage("output_guardrail")["status"], "failed")
        self.assertEqual(self._stage("output_guardrail")["failure_category"], "guardrail_service_error")

    def test_memory_save_failure_does_not_discard_answer(self):
        MEMORY.save_exchange.side_effect = RuntimeError("memory save failed")
        result = PIPELINE.answer_question("Where is my order?", "session-test")
        self.assertEqual(result["answer"], "Your order arrives in three days.")
        self.assertEqual(self._stage("conversation_memory_save")["status"], "failed")


if __name__ == "__main__":
    unittest.main()
