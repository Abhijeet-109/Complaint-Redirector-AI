"""Isolated reindex tests; no persistent ChromaDB directory is opened."""

import importlib
import unittest
from unittest.mock import patch

import langchain_chroma
import langchain_huggingface


class FakeEmbeddings:
    def __init__(self, *args, **kwargs):
        self.calls = []

    def embed_documents(self, texts):
        self.calls.append(list(texts))
        return [[float(len(text)), float(sum(map(ord, text)))] for text in texts]


class FakeCollection:
    def __init__(self, store):
        self.store = store

    def upsert(self, ids, embeddings, documents, metadatas):
        if self.store.fail_upsert:
            raise RuntimeError("isolated upsert failure")
        for stored_id, vector, content, metadata in zip(ids, embeddings, documents, metadatas):
            self.store.records[stored_id] = (content, dict(metadata), list(vector))


class FakeChroma:
    instances = []

    def __init__(self, *args, **kwargs):
        self.records = {}
        self.fail_upsert = False
        self.fail_delete = False
        self.fail_verification = False
        self._collection = FakeCollection(self)
        self.__class__.instances.append(self)

    def get(self, where=None, ids=None, include=None):
        selected = list(self.records)
        if where:
            selected = [
                stored_id for stored_id in selected
                if all(self.records[stored_id][1].get(key) == value for key, value in where.items())
            ]
        if ids is not None:
            selected = [stored_id for stored_id in selected if stored_id in set(ids)]
        if self.fail_verification and ids is not None:
            selected = []
        return {
            "ids": selected,
            "documents": [self.records[key][0] for key in selected],
            "metadatas": [self.records[key][1] for key in selected],
            "embeddings": [self.records[key][2] for key in selected],
        }

    def delete(self, ids=None, where=None):
        if self.fail_delete:
            raise RuntimeError("isolated delete failure")
        targets = list(ids or [])
        if where:
            targets.extend(
                stored_id for stored_id, (_, metadata, _) in self.records.items()
                if all(metadata.get(key) == value for key, value in where.items())
            )
        for stored_id in targets:
            self.records.pop(stored_id, None)


with patch.object(langchain_huggingface, "HuggingFaceEmbeddings", FakeEmbeddings), \
        patch.object(langchain_chroma, "Chroma", FakeChroma):
    vector_store = importlib.import_module("backend.chatbot.vector_store")


class VectorStoreReindexTests(unittest.TestCase):
    def setUp(self):
        self.store = FakeChroma.instances[-1]
        self.store.records.clear()
        self.store.fail_upsert = False
        self.store.fail_delete = False
        self.store.fail_verification = False
        vector_store.embedding_model.calls.clear()
        self.sections = [
            {"page_content": "unchanged policy section", "metadata": {"source": "local-a.pdf", "page": 1}},
            {"page_content": "section to update", "metadata": {"source": "local-a.pdf", "page": 2}},
        ]
        self.loader = patch.object(vector_store, "load_document", side_effect=lambda _path: self.sections)
        self.loader.start()
        self.addCleanup(self.loader.stop)

    def test_first_index_and_identical_reindex_reuse_all_embeddings(self):
        self.assertEqual(vector_store.reindex_document("local-a.pdf"), 2)
        self.assertEqual(len(vector_store.embedding_model.calls), 1)
        first_ids = set(self.store.records)
        first_vectors = {key: value[2] for key, value in self.store.records.items()}

        self.assertEqual(vector_store.reindex_document("local-a.pdf"), 2)
        self.assertEqual(len(vector_store.embedding_model.calls), 1)
        self.assertEqual(set(self.store.records), first_ids)
        self.assertEqual({key: value[2] for key, value in self.store.records.items()}, first_vectors)

    def test_changed_section_reuses_unchanged_vector_and_reembeds_only_change(self):
        vector_store.reindex_document("local-a.pdf")
        old = {value[0]: (key, value[2]) for key, value in self.store.records.items()}
        self.sections[1] = {"page_content": "changed policy section", "metadata": {"source": "local-a.pdf", "page": 2}}

        vector_store.reindex_document("local-a.pdf")

        self.assertEqual(vector_store.embedding_model.calls[-1], ["changed policy section"])
        self.assertEqual(len(self.store.records), 2)
        self.assertEqual(self.store.records[old["unchanged policy section"][0]][2], old["unchanged policy section"][1])
        self.assertNotIn("section to update", [record[0] for record in self.store.records.values()])

    def test_added_removed_and_duplicate_chunks_keep_unique_stable_ids(self):
        vector_store.reindex_document("local-a.pdf")
        self.sections.append({"page_content": "new section", "metadata": {"source": "local-a.pdf", "page": 3}})
        vector_store.reindex_document("local-a.pdf")
        self.assertEqual(len(self.store.records), 3)

        self.sections = [self.sections[0], self.sections[2]]
        vector_store.reindex_document("local-a.pdf")
        self.assertEqual(len(self.store.records), 2)
        self.assertNotIn("section to update", [record[0] for record in self.store.records.values()])

        self.sections = [self.sections[0], dict(self.sections[0])]
        vector_store.reindex_document("local-a.pdf")
        ids = [key for key, value in self.store.records.items() if value[0] == "unchanged policy section"]
        self.assertEqual(len(ids), 2)
        self.assertEqual(len(set(ids)), 2)

    def test_legacy_ids_are_reused_then_cleaned_without_reembedding(self):
        legacy_id = "legacy-position-based-id"
        legacy_vector = [24.0, 1.0]
        self.store.records[legacy_id] = (
            "unchanged policy section",
            {"source": "local-a.pdf", "page": 1},
            legacy_vector,
        )

        vector_store.reindex_document("local-a.pdf")

        self.assertNotIn(legacy_id, self.store.records)
        self.assertEqual(len(vector_store.embedding_model.calls), 1)
        self.assertEqual(self.store.records[next(iter(self.store.records))][2], legacy_vector)

    def test_load_embedding_upsert_verification_and_cleanup_failures_are_retryable(self):
        vector_store.reindex_document("local-a.pdf")
        original_records = dict(self.store.records)

        with patch.object(vector_store, "load_document", side_effect=OSError("load")):
            with self.assertRaises(OSError):
                vector_store.reindex_document("local-a.pdf")
        self.assertEqual(self.store.records, original_records)

        self.sections[1] = {"page_content": "new section", "metadata": {"source": "local-a.pdf", "page": 2}}
        with patch.object(vector_store.embedding_model, "embed_documents", side_effect=RuntimeError("embedding failed")):
            with self.assertRaisesRegex(RuntimeError, "embedding"):
                vector_store.reindex_document("local-a.pdf")
        self.assertEqual(self.store.records, original_records)

        self.store.fail_upsert = True
        with self.assertRaises(RuntimeError):
            vector_store.reindex_document("local-a.pdf")
        self.assertEqual(self.store.records, original_records)

        self.store.fail_upsert = False
        self.store.fail_verification = True
        with self.assertRaisesRegex(RuntimeError, "verify"):
            vector_store.reindex_document("local-a.pdf")
        self.assertEqual(len(self.store.records), 3)  # prior usable chunks remain

        self.store.fail_verification = False
        self.store.fail_delete = True
        self.sections = [self.sections[0]]
        with self.assertRaises(RuntimeError):
            vector_store.reindex_document("local-a.pdf")
        self.assertEqual(len(self.store.records), 3)

        self.store.fail_delete = False
        self.assertEqual(vector_store.reindex_document("local-a.pdf"), 1)
        self.assertEqual(len(self.store.records), 1)

    def test_same_original_name_and_local_drive_sources_are_isolated_by_stored_identity(self):
        local = [{"page_content": "local policy", "metadata": {"source": "local-uuid.pdf", "original_name": "policy.pdf"}}]
        drive = [{"page_content": "drive policy", "metadata": {"source": "drive-uuid.pdf", "original_name": "policy.pdf"}}]
        with patch.object(vector_store, "load_document", side_effect=lambda path: local if "local" in path else drive):
            vector_store.reindex_document("local-uuid.pdf")
            vector_store.reindex_document("drive-uuid.pdf")
        self.assertEqual(len(self.store.records), 2)
        self.assertEqual({item[1]["source"] for item in self.store.records.values()}, {"local-uuid.pdf", "drive-uuid.pdf"})


if __name__ == "__main__":
    unittest.main()
