
import hashlib
import json
import os
from collections import Counter
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
embedding_model = HuggingFaceEmbeddings(
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


# Load, chunk, and store documents\
def add_documents(file_paths):

    documents = []

    for file_path in file_paths:

        extracted_sections = load_document(file_path)

        for section in extracted_sections:
            documents.append(
                Document(
                    page_content=section["page_content"],
                    metadata=section["metadata"]
                )
            )

    if not documents:
        raise ValueError("No readable document content found")

    # Split text into smaller chunks
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=CHUNK_SIZE,
        chunk_overlap=CHUNK_OVERLAP
    )

    chunks = splitter.split_documents(documents)

    if not chunks:
        raise ValueError("No text chunks were created")

    # Match existing chunks first, including legacy chunks with generated IDs.
    existing_chunks = Counter()
    for source_name in {chunk.metadata.get("source", "") for chunk in chunks}:
        stored = vectorstore.get(
            where={"source": source_name},
            include=["documents", "metadatas"],
        )
        for content, metadata in zip(
            stored.get("documents", []), stored.get("metadatas", [])
        ):
            key = (content, json.dumps(metadata or {}, sort_keys=True, default=str))
            existing_chunks[key] += 1

    missing_chunks = []
    missing_ids = []
    for index, chunk in enumerate(chunks):
        metadata_key = json.dumps(chunk.metadata, sort_keys=True, default=str)
        content_key = (chunk.page_content, metadata_key)
        if existing_chunks[content_key] > 0:
            existing_chunks[content_key] -= 1
            continue

        missing_chunks.append(chunk)
        missing_ids.append(hashlib.sha256(
            f"{chunk.metadata.get('source', '')}:{chunk.metadata.get('page', '')}:{index}:{chunk.page_content}".encode("utf-8")
        ).hexdigest())

    if missing_chunks:
        # Stable IDs make retries upsert the same newly added chunks.
        vectorstore.add_documents(missing_chunks, ids=missing_ids)

    return len(chunks)


def reindex_document(file_path):
    """Upsert current document chunks, then remove stale chunks for its source."""
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

    source_name = chunks[0].metadata.get("source", "")
    ids = [
        hashlib.sha256(
            f"{source_name}:{chunk.metadata.get('page', '')}:{index}:{chunk.page_content}".encode("utf-8")
        ).hexdigest()
        for index, chunk in enumerate(chunks)
    ]
    existing = vectorstore.get(
        where={"source": source_name},
        include=["metadatas"],
    )

    #Debug the add documets
    # Upsert first so a failed embedding operation leaves the existing index intact.
    vectorstore.add_documents(chunks, ids=ids)
    stale_ids = [stored_id for stored_id in existing.get("ids", []) if stored_id not in set(ids)]
    if stale_ids:
        vectorstore.delete(ids=stale_ids)
    return len(chunks)


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
