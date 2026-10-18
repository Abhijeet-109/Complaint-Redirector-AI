
import hashlib
import json
import os
import logging
from langchain_core.documents import Document
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_chroma import Chroma

from backend.chatbot.document_loader import load_document

logger = logging.getLogger(__name__)
# Persistent database location
BASE_DIR = os.path.dirname(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
)

CHROMA_PATH = os.path.join(
    BASE_DIR,
    "backend",
    "ChromaDB"
)


# Vector-store configuration exposed by the read-only admin status endpoint.
COLLECTION_NAME = "flatkart_documents"
EMBEDDING_MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2"
CHUNK_SIZE = 600
CHUNK_OVERLAP = 200


# Embedding model
class ChatbotEmbeddings(HuggingFaceEmbeddings):
    def embed_query(self, text):
        embedding = super().embed_query(text)
        logger.info("[CHATBOT] Query embedding created successfully.")
        return embedding


embedding_model = ChatbotEmbeddings(
    model_name=EMBEDDING_MODEL_NAME
)

logger.info("Embedding model loaded")

# ChromaDB
vectorstore = Chroma(
    collection_name=COLLECTION_NAME,
    persist_directory=CHROMA_PATH,
    embedding_function=embedding_model
)
logger.info("Chromadb created")


def _split_document(file_path):
    extracted_sections = load_document(file_path)
    documents = [
        Document(page_content=section["page_content"], metadata=section["metadata"])
        for section in extracted_sections
    ]
    if not documents:
        raise ValueError("No readable document content found")

    splitter = RecursiveCharacterTextSplitter(
        chunk_size=CHUNK_SIZE,
        chunk_overlap=CHUNK_OVERLAP,
    )
    chunks = splitter.split_documents(documents)
    if not chunks:
        raise ValueError("No text chunks were created")
    return chunks


def _metadata_key(metadata):
    return json.dumps(metadata or {}, sort_keys=True, separators=(",", ":"), default=str)


def _stable_chunk_ids(chunks, document_identity):
    """Build content-based IDs; occurrence disambiguates identical chunks."""
    occurrences = {}
    ids = []
    for chunk in chunks:
        metadata = dict(chunk.metadata or {})
        metadata.pop("source", None)
        identity = json.dumps(
            [document_identity, metadata, chunk.page_content],
            sort_keys=True,
            separators=(",", ":"),
            ensure_ascii=False,
            default=str,
        )
        occurrence = occurrences.get(identity, 0)
        occurrences[identity] = occurrence + 1
        ids.append(hashlib.sha256(f"{identity}:{occurrence}".encode("utf-8")).hexdigest())
    return ids


def _chunk_key(content, metadata):
    return content, _metadata_key(metadata)


def _write_chunks(chunks, remove_stale, document_identity=None):
    source_names = {chunk.metadata.get("source", "") for chunk in chunks}
    if len(source_names) != 1:
        raise ValueError("A document index operation must contain exactly one source")

    source_name = next(iter(source_names))
    ids = _stable_chunk_ids(chunks, document_identity or source_name)
    existing = vectorstore.get(
        where={"source": source_name},
        include=["documents", "metadatas", "embeddings"],
    )
    existing_ids = existing.get("ids", [])
    existing_docs = existing.get("documents", [])
    existing_metadata = existing.get("metadatas", [])
    existing_embeddings = existing.get("embeddings", [])

    # Keep an ordered list so duplicate content can reuse distinct legacy vectors.
    reusable_by_content = {}
    existing_by_id = {}
    for index, stored_id in enumerate(existing_ids):
        content = existing_docs[index] if index < len(existing_docs) else None
        metadata = existing_metadata[index] if index < len(existing_metadata) else None
        embedding = existing_embeddings[index] if index < len(existing_embeddings) else None
        entry = (stored_id, content, metadata or {}, embedding)
        existing_by_id[stored_id] = entry
        reusable_by_content.setdefault(_chunk_key(content, metadata), []).append(entry)

    claimed_ids = set()
    pending_ids = []
    pending_chunks = []
    pending_embeddings = []
    for chunk, chunk_id in zip(chunks, ids):
        metadata = dict(chunk.metadata or {})
        current = existing_by_id.get(chunk_id)
        reusable = None
        if (
            current is not None
            and current[1] == chunk.page_content
            and _metadata_key(current[2]) == _metadata_key(metadata)
            and current[0] not in claimed_ids
        ):
            reusable = current
        else:
            candidates = reusable_by_content.get(_chunk_key(chunk.page_content, metadata), [])
            reusable = next(
                (entry for entry in candidates if entry[0] not in claimed_ids),
                None,
            )

        if reusable is not None:
            claimed_ids.add(reusable[0])
            vector = reusable[3]
            if vector is not None:
                if reusable[0] != chunk_id and not remove_stale:
                    continue
                claimed_ids.add(chunk_id)
                if reusable[0] != chunk_id:
                    pending_ids.append(chunk_id)
                    pending_chunks.append(chunk)
                    pending_embeddings.append(vector)
                continue

        pending_ids.append(chunk_id)
        pending_chunks.append(chunk)
        pending_embeddings.append(None)

    if pending_chunks:
        missing_indices = [i for i, vector in enumerate(pending_embeddings) if vector is None]
        if missing_indices:
            new_vectors = embedding_model.embed_documents(
                [pending_chunks[index].page_content for index in missing_indices]
            )
            if len(new_vectors) != len(missing_indices):
                raise RuntimeError("The embedding model returned an incomplete chunk batch")
            for index, vector in zip(missing_indices, new_vectors):
                pending_embeddings[index] = vector

        # Upsert is retry-safe: the new deterministic IDs replace a partial prior attempt.
        vectorstore._collection.upsert(
            ids=pending_ids,
            embeddings=[vector.tolist() if hasattr(vector, "tolist") else vector for vector in pending_embeddings],
            documents=[chunk.page_content for chunk in pending_chunks],
            metadatas=[dict(chunk.metadata or {}) for chunk in pending_chunks],
        )

        written = vectorstore.get(
            ids=pending_ids,
            include=["documents", "metadatas", "embeddings"],
        )
        written_by_id = {
            stored_id: (content, metadata or {}, embedding)
            for stored_id, content, metadata, embedding in zip(
                written.get("ids", []),
                written.get("documents", []),
                written.get("metadatas", []),
                written.get("embeddings", []),
            )
        }
        for stored_id, chunk in zip(pending_ids, pending_chunks):
            actual = written_by_id.get(stored_id)
            if (
                actual is None
                or actual[0] != chunk.page_content
                or _metadata_key(actual[1]) != _metadata_key(chunk.metadata)
                or actual[2] is None
                or len(actual[2]) == 0
            ):
                raise RuntimeError("ChromaDB did not verify all replacement chunks")

    if remove_stale:
        current_ids = set(ids)
        stale_ids = [stored_id for stored_id in existing_ids if stored_id not in current_ids]
        if stale_ids:
            vectorstore.delete(ids=stale_ids)

        final = vectorstore.get(
            where={"source": source_name},
            include=["documents", "metadatas", "embeddings"],
        )
        final_ids = final.get("ids", [])
        final_docs = final.get("documents", [])
        final_metadata = final.get("metadatas", [])
        final_by_id = {
            stored_id: (content, metadata or {}, embedding)
            for stored_id, content, metadata, embedding in zip(
                final_ids,
                final_docs,
                final_metadata,
                final.get("embeddings", []),
            )
        }
        if set(final_by_id) != current_ids:
            raise RuntimeError("ChromaDB stale chunk cleanup could not be verified")
        for chunk, chunk_id in zip(chunks, ids):
            actual = final_by_id.get(chunk_id)
            if (
                actual is None
                or actual[0] != chunk.page_content
                or _metadata_key(actual[1]) != _metadata_key(chunk.metadata)
                or actual[2] is None
                or len(actual[2]) == 0
            ):
                raise RuntimeError("ChromaDB final document index could not be verified")

    return len(chunks)


def add_documents(file_paths, document_identity=None):
    """Add chunks idempotently without removing any previously indexed chunks."""
    chunks_by_source = {}
    for file_path in file_paths:
        for chunk in _split_document(file_path):
            source_name = chunk.metadata.get("source", "")
            chunks_by_source.setdefault(source_name, []).append(chunk)
    if not chunks_by_source:
        raise ValueError("No readable document content found")
    return sum(
        _write_chunks(chunks, remove_stale=False, document_identity=document_identity)
        for chunks in chunks_by_source.values()
    )


def reindex_document(file_path, document_identity=None):
    """Verify replacement chunks before cleaning this source's obsolete IDs."""
    chunks = _split_document(file_path)
    return _write_chunks(chunks, remove_stale=True, document_identity=document_identity)


def get_document_chunk_count(source_name):
    """Return the number of stored chunks for a source filename."""
    result = vectorstore.get(
        where={"source": source_name},
        include=["metadatas"],
    )
    return len(result.get("ids", []))


def delete_document_vectors(source_name):
    """Delete only chunks whose source metadata matches a stored filename."""
    vectorstore.delete(where={"source": source_name})
