
import hashlib
import json
import os
from collections import Counter

from langchain_core.documents import Document
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_chroma import Chroma

from backend.chatbot.document_loader import load_document


# Persistent database location
BASE_DIR = os.path.dirname(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
)

CHROMA_PATH = os.path.join(
    BASE_DIR,
    "backend",
    "ChromaDB"
)


# Embedding model
embedding_model = HuggingFaceEmbeddings(
    model_name="sentence-transformers/all-MiniLM-L6-v2"
)


# ChromaDB
vectorstore = Chroma(
    collection_name="flatkart_documents",
    persist_directory=CHROMA_PATH,
    embedding_function=embedding_model
)


# Load, chunk, and store documents
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
        chunk_size=600,
        chunk_overlap=200
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


def get_document_chunk_count(source_name):
    """Return the number of stored chunks for a source filename."""
    result = vectorstore.get(
        where={"source": source_name},
        include=["metadatas"],
    )
    return len(result.get("ids", []))
