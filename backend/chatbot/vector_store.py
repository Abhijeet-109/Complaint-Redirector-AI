
import hashlib
import json
import logging

from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url

from langchain_core.documents import Document
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_postgres import PGVector

from backend.Database.connection import DATABASE_URL
from backend.chatbot.document_loader import load_document


logger = logging.getLogger(__name__)

#Vector store config

COLLECTION_NAME = "flatkart_documents"

EMBEDDING_MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2"

CHUNK_SIZE = 600
CHUNK_OVERLAP = 200

#DB connection

database_url = make_url(DATABASE_URL).set(
    drivername="postgresql+psycopg"
)

connection_string = database_url.render_as_string(
    hide_password=False
)

db_engine = create_engine(connection_string)

#Embedding model 

class ChatbotEmbeddings(HuggingFaceEmbeddings):

    def embed_query(self, text):
        try:
            embedding = super().embed_query(text)

        except Exception as exc:
            logger.error(
                "[CHATBOT] Query embedding failed (%s).",
                type(exc).__name__,
            )
            raise

        logger.info(
            "[CHATBOT] Query embedding created successfully."
        )

        return embedding


embedding_model = ChatbotEmbeddings(
    model_name=EMBEDDING_MODEL_NAME
)

logger.info("[CHATBOT] Embedding model loaded successfully.")

#pg-vector config

vectorstore = PGVector(
    embeddings=embedding_model,
    collection_name=COLLECTION_NAME,
    connection=db_engine,
    use_jsonb=True,
)

logger.info("[CHATBOT] PGVector initialized successfully.")


#Doc metadata

def _normalize_metadata(metadata):

    normalized = {}

    for key, value in (metadata or {}).items():

        if value is None:
            continue

        if isinstance(value, (str, int, float, bool)):
            normalized[key] = value

        else:
            normalized[key] = json.loads(
                json.dumps(
                    value,
                    sort_keys=True,
                    ensure_ascii=False,
                    default=str,
                )
            )

    return normalized


#Document Chunking 

def _split_document(file_path):

    extracted_sections = load_document(file_path)

    documents = [
        Document(
            page_content=section["page_content"],
            metadata=_normalize_metadata(
                section.get("metadata")
            ),
        )
        for section in extracted_sections
    ]

    if not documents:
        raise ValueError(
            "No readable document content found"
        )

    splitter = RecursiveCharacterTextSplitter(
        chunk_size=CHUNK_SIZE,
        chunk_overlap=CHUNK_OVERLAP,
    )

    chunks = splitter.split_documents(documents)

    if not chunks:
        raise ValueError(
            "No text chunks were created"
        )

    return chunks


#Chunk IDs

def _stable_chunk_ids(chunks, document_identity):

    occurrences = {}
    ids = []

    for chunk in chunks:

        metadata = dict(chunk.metadata or {})
        metadata.pop("source", None)

        identity = json.dumps(
            [
                document_identity,
                metadata,
                chunk.page_content,
            ],
            sort_keys=True,
            separators=(",", ":"),
            ensure_ascii=False,
            default=str,
        )

        occurrence = occurrences.get(identity, 0)
        occurrences[identity] = occurrence + 1

        chunk_id = hashlib.sha256(
            f"{identity}:{occurrence}".encode("utf-8")
        ).hexdigest()

        ids.append(chunk_id)

    return ids


#DB Helper

def _get_source_chunk_ids(source_name):

    query = text("""
        SELECT e.id
        FROM langchain_pg_embedding AS e
        INNER JOIN langchain_pg_collection AS c
            ON e.collection_id = c.uuid
        WHERE c.name = :collection_name
          AND e.cmetadata ->> 'source' = :source_name
    """)

    with db_engine.connect() as connection:

        result = connection.execute(
            query,
            {
                "collection_name": COLLECTION_NAME,
                "source_name": source_name,
            },
        )

        return [row[0] for row in result.fetchall()]


# Write the chunk docs
def _write_chunks(
    chunks,
    remove_stale=False,
    document_identity=None,
):

    if not chunks:
        raise ValueError("No chunks provided")

    source_names = {
        chunk.metadata.get("source", "")
        for chunk in chunks
    }

    if len(source_names) != 1:
        raise ValueError(
            "A document index operation must contain exactly one source"
        )

    source_name = next(iter(source_names))

    if not source_name:
        raise ValueError(
            "Document source metadata is missing"
        )

    document_identity = document_identity or source_name

    ids = _stable_chunk_ids(
        chunks,
        document_identity,
    )

    # Capture existing IDs before writing replacement chunks.
    existing_ids = set(
        _get_source_chunk_ids(source_name)
    )

    # Add or update the new chunks.
    vectorstore.add_documents(
        documents=chunks,
        ids=ids,
    )

    # Verify that every new chunk was stored.
    stored_ids = set(
        _get_source_chunk_ids(source_name)
    )

    if not set(ids).issubset(stored_ids):
        raise RuntimeError(
            "PGVector could not verify all document chunks"
        )

    # Remove obsolete chunks only after successful indexing.
    if remove_stale:

        stale_ids = list(
            existing_ids - set(ids)
        )

        if stale_ids:
            vectorstore.delete(
                ids=stale_ids
            )

        final_ids = set(
            _get_source_chunk_ids(source_name)
        )

        if final_ids != set(ids):
            raise RuntimeError(
                "PGVector final document index verification failed"
            )

    logger.info(
        "[CHATBOT] Indexed %d chunks for %s.",
        len(chunks),
        source_name,
    )

    return len(chunks)


# Add the documents
def add_documents(
    file_paths,
    document_identity=None,
):

    chunks_by_source = {}

    for file_path in file_paths:

        chunks = _split_document(file_path)

        for chunk in chunks:

            source_name = chunk.metadata.get(
                "source",
                "",
            )

            chunks_by_source.setdefault(
                source_name,
                [],
            ).append(chunk)

    if not chunks_by_source:
        raise ValueError(
            "No readable document content found"
        )

    total_chunks = 0

    for chunks in chunks_by_source.values():

        total_chunks += _write_chunks(
            chunks,
            remove_stale=False,
            document_identity=document_identity,
        )

    return total_chunks


# Reindex documnets
def reindex_document(
    file_path,
    document_identity=None,
):

    chunks = _split_document(file_path)

    return _write_chunks(
        chunks,
        remove_stale=True,
        document_identity=document_identity,
    )


# Get hunk count 

def get_document_chunk_count(source_name):

    query = text("""
        SELECT COUNT(*)
        FROM langchain_pg_embedding AS e
        INNER JOIN langchain_pg_collection AS c
            ON e.collection_id = c.uuid
        WHERE c.name = :collection_name
          AND e.cmetadata ->> 'source' = :source_name
    """)

    with db_engine.connect() as connection:

        count = connection.execute(
            query,
            {
                "collection_name": COLLECTION_NAME,
                "source_name": source_name,
            },
        ).scalar_one()

    return count


# Delete chunks
def delete_document_vectors(source_name):

    ids = _get_source_chunk_ids(source_name)

    if not ids:
        logger.info(
            "[CHATBOT] No vectors found for %s.",
            source_name,
        )
        return

    vectorstore.delete(
        ids=ids
    )

    remaining_chunks = get_document_chunk_count(
        source_name
    )

    if remaining_chunks != 0:
        raise RuntimeError(
            "PGVector document deletion could not be verified"
        )

    logger.info(
        "[CHATBOT] Deleted %d chunks for %s.",
        len(ids),
        source_name,
    )
