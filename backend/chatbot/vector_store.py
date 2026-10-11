
import os

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
        chunk_size=1000,
        chunk_overlap=200
    )

    chunks = splitter.split_documents(documents)

    if not chunks:
        raise ValueError("No text chunks were created")

    # Store chunks and their embeddings
    vectorstore.add_documents(chunks)

    return len(chunks)
