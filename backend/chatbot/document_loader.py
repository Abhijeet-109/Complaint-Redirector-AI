
import os
from pathlib import Path

from langchain_community.document_loaders import UnstructuredFileLoader


SUPPORTED_EXTENSIONS = {
    ".pdf",
    ".docx",
    ".doc",
    ".txt",
    ".rtf",
    ".odt",
    ".pptx",
    ".xlsx",
    ".csv",
    ".tsv",
    ".html",
    ".htm",
    ".xml",
    ".json",
    ".eml",
    ".md",
    ".png",
    ".jpg",
    ".jpeg",
    ".tiff",
    ".bmp",
}


def load_document(file_path):
    path = Path(file_path)

    if not path.is_file():
        raise FileNotFoundError(
            f"Document not found: {path}"
        )

    extension = path.suffix.lower()

    if extension not in SUPPORTED_EXTENSIONS:
        raise ValueError(
            f"Unsupported file format: {extension}"
        )

    loader = UnstructuredFileLoader(
        str(path),
        mode="elements",
    )

    loaded_documents = loader.load()
    documents = []

    for document in loaded_documents:
        text = document.page_content.strip()

        if not text:
            continue

        metadata = dict(document.metadata)
        metadata["source"] = os.path.basename(path)

        documents.append({
            "page_content": text,
            "metadata": metadata,
        })

    if not documents:
        raise ValueError(
            f"No readable text found in {path.name}"
        )

    return documents
