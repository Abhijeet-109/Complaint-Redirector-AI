
import json
import logging
import re
import shutil
import uuid
from pathlib import Path, PureWindowsPath
from typing import Annotated

from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from pydantic import BaseModel, Field

from backend.chatbot.vector_store import (
    add_documents,
    delete_document_vectors,
    get_document_chunk_count,
    reindex_document,
    COLLECTION_NAME,
    EMBEDDING_MODEL_NAME,
    CHUNK_SIZE,
    CHUNK_OVERLAP,
    CHROMA_PATH,
)
from backend.auth.dependencies import require_role

router = APIRouter(
    prefix="/documents",
    tags=["Documents"],
    dependencies=[Depends(require_role("super_admin"))],
)
logger = logging.getLogger("flatkart.documents")

BASE_DIR = Path(__file__).resolve().parents[2]
UPLOAD_DIR = BASE_DIR / "uploads"
MANIFEST_PATH = UPLOAD_DIR / "manifest.json"

UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

ALLOWED_EXTENSIONS = {".pdf", ".docx"}


def read_manifest():
    if not MANIFEST_PATH.exists():
        return {}

    try:
        return json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        raise HTTPException(
            status_code=500,
            detail="Could not read document manifest."
        )


def save_manifest(manifest):
    temporary_path = MANIFEST_PATH.with_suffix(".tmp")
    temporary_path.write_text(
        json.dumps(manifest, indent=2),
        encoding="utf-8"
    )
    temporary_path.replace(MANIFEST_PATH)


@router.post("/upload")
async def upload_documents(
    files: Annotated[list[UploadFile], File(
        description="Select PDF or DOCX files"
    )]
):
    if not files:
        raise HTTPException(status_code=400, detail="No files selected.")

    uploaded_files = []
    failed_files = []
    manifest = read_manifest()

    for file in files:
        original_name = Path(PureWindowsPath(file.filename or "").name).name
        original_name = re.sub(r"[\x00-\x1f]", "", original_name)[:255]
        extension = Path(original_name).suffix.lower()

        if extension not in ALLOWED_EXTENSIONS:
            await file.close()
            failed_files.append({
                "original_name": original_name or "Unnamed file",
                "status": "failed",
                "message": "Unsupported file type. Upload PDF or DOCX only.",
            })
            continue

        stored_name = f"{uuid.uuid4().hex}{extension}"
        destination = UPLOAD_DIR / stored_name

        try:
            with destination.open("wb") as buffer:
                shutil.copyfileobj(file.file, buffer)

            uploaded_files.append({
                "original_name": original_name,
                "stored_name": stored_name,
                "status": "saved"
            })
            manifest[stored_name] = {
                "original_name": original_name,
                "status": "saved",
                "chunks": 0,
            }
        except Exception:
            logger.exception("Could not save uploaded document %s", original_name)
            try:
                destination.unlink(missing_ok=True)
            except OSError:
                logger.exception("Could not remove incomplete upload %s", destination)
            failed_files.append({
                "original_name": original_name or "Unnamed file",
                "status": "failed",
                "message": "Could not save this document.",
            })
        finally:
            await file.close()

    if uploaded_files:
        try:
            save_manifest(manifest)
        except OSError as exc:
            logger.exception("Could not save uploaded document metadata")
            for item in uploaded_files:
                try:
                    (UPLOAD_DIR / item["stored_name"]).unlink(missing_ok=True)
                except OSError:
                    logger.exception("Could not roll back upload %s", item["stored_name"])
            raise HTTPException(
                status_code=500,
                detail="Documents could not be saved because their metadata was unavailable.",
            ) from exc

    return {
        "message": "Documents saved. They have not been indexed.",
        "uploaded_count": len(uploaded_files),
        "failed_count": len(failed_files),
        "files": uploaded_files,
        "errors": failed_files,
    }


@router.get("")
def list_documents():
    manifest = read_manifest()
    files = []

    for path in sorted(UPLOAD_DIR.iterdir()):
        if path.suffix.lower() not in ALLOWED_EXTENSIONS:
            continue

        record = manifest.get(path.name, {})

        try:
            actual_chunks = get_document_chunk_count(path.name)
        except Exception as exc:
            logger.exception("Could not read ChromaDB status for %s", path.name)
            raise HTTPException(
                status_code=503,
                detail="Document index status is temporarily unavailable.",
            ) from exc

        files.append({
            "stored_name": path.name,
            "original_name": record.get("original_name") or path.name,
            "size_bytes": path.stat().st_size,
            "status": "indexed" if actual_chunks > 0 else (
                "failed" if record.get("status") == "failed" else "saved"
            ),
            "chunks": actual_chunks,
            "error": record.get("error"),
        })

    return {"count": len(files), "files": files}


class IndexRequest(BaseModel):
    stored_names: list[str] = Field(..., min_length=1)
    reindex: bool = False


class DeleteRequest(BaseModel):
    stored_names: list[str] = Field(..., min_length=1)


@router.post("/index")
def index_documents(request: IndexRequest):
    manifest = read_manifest()
    results = []

    for stored_name in request.stored_names:
        filename = Path(stored_name).name

        if (
            filename != stored_name
            or PureWindowsPath(stored_name).name != stored_name
            or re.fullmatch(r"[0-9a-f]{32}\.(?:pdf|docx)", filename) is None
        ):
            raise HTTPException(
                status_code=400,
                detail="Invalid stored filename."
            )

        path = UPLOAD_DIR / filename

        if (
            not path.is_file()
            or path.suffix.lower() not in ALLOWED_EXTENSIONS
        ):
            raise HTTPException(
                status_code=404,
                detail=f"Saved document not found: {filename}"
            )

        try:
            existing_chunks = get_document_chunk_count(filename)
            record = manifest.get(filename, {})

            if (
                not request.reindex
                and
                record.get("status") == "indexed"
                and existing_chunks > 0
                and existing_chunks == record.get("chunks")
            ):
                results.append({
                    "stored_name": filename,
                    "status": "already_indexed",
                    "chunks": existing_chunks
                })
                continue

            chunk_count = reindex_document(str(path)) if request.reindex else add_documents([str(path)])

            manifest[filename] = {
                **record,
                "status": "indexed",
                "chunks": chunk_count,
                "error": None,
            }
            save_manifest(manifest)

            results.append({
                "stored_name": filename,
                "status": "indexed",
                "chunks": chunk_count
            })

        except Exception as exc:
            logger.exception("Indexing failed for %s", filename)
            try:
                remaining_chunks = get_document_chunk_count(filename)
                manifest[filename] = {
                    **record,
                    "status": "failed",
                    "chunks": remaining_chunks,
                    "error": "Indexing failed. Retry the operation or check backend logs.",
                }
                save_manifest(manifest)
            except Exception:
                logger.exception("Could not persist indexing failure for %s", filename)
            results.append({
                "stored_name": filename,
                "status": "failed",
                "message": str(exc)[:240] or "Indexing failed. Check backend logs."
            })

    return {"results": results}


@router.get("/config")
def document_pipeline_config(
    _current_user=Depends(require_role("admin", "super_admin")),
):
    return {
        "collection_name": COLLECTION_NAME,
        "embedding_model": EMBEDDING_MODEL_NAME,
        "chunk_size": CHUNK_SIZE,
        "chunk_overlap": CHUNK_OVERLAP,
        "persistent_storage": (
            "Local persistent ChromaDB storage configured"
            if CHROMA_PATH else "Persistent storage is not configured"
        ),
    }


@router.post("/delete")
def delete_documents(request: DeleteRequest):
    manifest = read_manifest()
    results = []

    for stored_name in request.stored_names:
        filename = stored_name
        if (
            Path(filename).name != filename
            or PureWindowsPath(filename).name != filename
            or re.fullmatch(r"[0-9a-f]{32}\.(?:pdf|docx)", filename) is None
        ):
            results.append({
                "stored_name": stored_name,
                "status": "failed",
                "message": "Invalid stored filename.",
            })
            continue

        path = UPLOAD_DIR / filename
        has_file = path.is_file()
        has_manifest_entry = filename in manifest

        try:
            existing_chunks = get_document_chunk_count(filename)
        except Exception:
            results.append({
                "stored_name": filename,
                "status": "failed",
                "message": "Could not check document vectors; the saved file was left in place.",
            })
            continue

        if not has_file and not has_manifest_entry and existing_chunks == 0:
            results.append({
                "stored_name": filename,
                "status": "failed",
                "message": "Document was not found in storage or ChromaDB.",
            })
            continue

        if existing_chunks:
            try:
                delete_document_vectors(filename)
                if get_document_chunk_count(filename) != 0:
                    raise RuntimeError("Document vectors remain after cleanup.")
            except Exception:
                results.append({
                    "stored_name": filename,
                    "status": "failed",
                    "message": "ChromaDB cleanup failed; the saved file was left in place.",
                })
                continue

        if has_file:
            try:
                path.unlink()
            except OSError:
                results.append({
                    "stored_name": filename,
                    "status": "failed",
                    "message": "Vectors were removed, but the saved file could not be removed.",
                })
                continue

        updated_manifest = dict(manifest)
        updated_manifest.pop(filename, None)
        try:
            save_manifest(updated_manifest)
            manifest = updated_manifest
        except OSError:
            results.append({
                "stored_name": filename,
                "status": "failed",
                "message": "The file and vectors were removed, but the manifest could not be updated.",
            })
            continue

        results.append({
            "stored_name": filename,
            "status": "deleted",
            "removed_chunks": existing_chunks,
        })

    return {"results": results}
