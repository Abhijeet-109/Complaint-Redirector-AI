
import hashlib
import json
import logging
import re
import uuid
from pathlib import Path, PureWindowsPath
from typing import Annotated

from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from docx import Document as WordDocument
from docx.oxml.table import CT_Tbl
from docx.oxml.text.paragraph import CT_P
from docx.table import Table as WordTable
from docx.text.paragraph import Paragraph as WordParagraph

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
from backend.chatbot.document_validation import (
    MAX_DOCUMENT_BYTES,
    MAX_UPLOAD_FILES,
    validate_document_file,
)

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
ALLOWED_CONTENT_TYPES = {
    ".pdf": {"application/pdf", "application/octet-stream"},
    ".docx": {
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/octet-stream",
    },
}


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


def content_hash(path):
    digest = hashlib.sha256()
    with Path(path).open("rb") as document_file:
        for chunk in iter(lambda: document_file.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def document_source(record):
    if record.get("source") == "google_drive" or record.get("drive_file_id"):
        return "google_drive"
    if record.get("source") == "local_upload":
        return "local_upload"
    return "unknown"


@router.post("/upload")
async def upload_documents(
    files: Annotated[list[UploadFile], File(
        description="Select PDF or DOCX files"
    )]
):
    if not files:
        raise HTTPException(status_code=400, detail="No files selected.")
    if len(files) > MAX_UPLOAD_FILES:
        raise HTTPException(
            status_code=413,
            detail=f"Upload no more than {MAX_UPLOAD_FILES} files at a time.",
        )

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

        content_type = (file.content_type or "").lower()
        if content_type and content_type not in ALLOWED_CONTENT_TYPES[extension]:
            await file.close()
            failed_files.append({
                "original_name": original_name or "Unnamed file",
                "status": "failed",
                "message": "The file content type does not match its extension.",
            })
            continue

        if file.size is not None and file.size > MAX_DOCUMENT_BYTES:
            await file.close()
            failed_files.append({
                "original_name": original_name or "Unnamed file",
                "status": "failed",
                "message": "The file exceeds the 25 MB limit.",
            })
            continue

        stored_name = f"{uuid.uuid4().hex}{extension}"
        destination = UPLOAD_DIR / stored_name
        digest = hashlib.sha256()

        try:
            with destination.open("wb") as buffer:
                copied_bytes = 0
                while chunk := file.file.read(64 * 1024):
                    copied_bytes += len(chunk)
                    if copied_bytes > MAX_DOCUMENT_BYTES:
                        raise ValueError("The file exceeds the 25 MB limit.")
                    buffer.write(chunk)
                    digest.update(chunk)

            validate_document_file(destination)

            uploaded_files.append({
                "original_name": original_name,
                "stored_name": stored_name,
                "status": "saved"
            })
            manifest[stored_name] = {
                "original_name": original_name,
                "status": "saved",
                "chunks": 0,
                "source": "local_upload",
                "content_sha256": digest.hexdigest(),
            }
        except ValueError as exc:
            try:
                destination.unlink(missing_ok=True)
            except OSError:
                logger.exception("Could not remove a rejected upload")
            failed_files.append({
                "original_name": original_name or "Unnamed file",
                "status": "failed",
                "message": str(exc),
            })
        except Exception as exc:
            logger.error("Could not save or validate uploaded document (%s)", type(exc).__name__)
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


@router.post("/replace")
async def replace_document(
    stored_name: Annotated[str, Form()],
    file: Annotated[UploadFile, File()],
):
    """Safely replace one local document while retaining its stored identity."""
    async def reject(status_code, detail):
        await file.close()
        raise HTTPException(status_code=status_code, detail=detail)

    if re.fullmatch(r"[0-9a-f]{32}\.(?:pdf|docx)", stored_name) is None:
        await reject(400, "Invalid document selection.")

    try:
        manifest = read_manifest()
    except HTTPException:
        await file.close()
        raise
    record = manifest.get(stored_name, {})
    if not isinstance(record, dict) or record.get("source") != "local_upload":
        await reject(404, "The selected local document was not found.")

    destination = UPLOAD_DIR / stored_name
    if not destination.is_file():
        await reject(404, "The selected local document was not found.")

    original_name = Path(PureWindowsPath(file.filename or "").name).name
    original_name = re.sub(r"[\x00-\x1f]", "", original_name)[:255]
    extension = Path(original_name).suffix.lower()
    if extension not in ALLOWED_EXTENSIONS or extension != destination.suffix.lower():
        await reject(400, "Choose a file with the same PDF or DOCX format.")
    if original_name.casefold() != str(record.get("original_name", "")).casefold():
        await reject(400, "The selected file name does not match this document.")

    content_type = (file.content_type or "").lower()
    if content_type and content_type not in ALLOWED_CONTENT_TYPES[extension]:
        await reject(400, "The file content type does not match its extension.")

    staging_dir = UPLOAD_DIR / f".replace-{uuid.uuid4().hex}"
    try:
        staging_dir.mkdir()
    except OSError as exc:
        await file.close()
        raise HTTPException(status_code=500, detail="The replacement file could not be staged.") from exc
    temporary_path = staging_dir / f"incoming{extension}"
    backup_path = UPLOAD_DIR / f".{uuid.uuid4().hex}.backup"
    digest = hashlib.sha256()
    try:
        copied_bytes = 0
        with temporary_path.open("wb") as buffer:
            while chunk := file.file.read(64 * 1024):
                copied_bytes += len(chunk)
                if copied_bytes > MAX_DOCUMENT_BYTES:
                    raise ValueError("The file exceeds the 25 MB limit.")
                buffer.write(chunk)
                digest.update(chunk)

        validate_document_file(temporary_path)
        new_hash = digest.hexdigest()
        old_hash = content_hash(destination)
        if (
            new_hash == old_hash
            and record.get("content_sha256") == new_hash
            and record.get("status") == "indexed"
        ):
            temporary_path.unlink(missing_ok=True)
            chunks = get_document_chunk_count(stored_name)
            if chunks:
                return {
                    "stored_name": stored_name,
                    "original_name": original_name,
                    "status": "already_indexed",
                    "chunks": chunks,
                    "updated": False,
                }

        destination.replace(backup_path)
        temporary_path.replace(destination)
        try:
            chunk_count = reindex_document(str(destination))
            if get_document_chunk_count(stored_name) != chunk_count:
                raise RuntimeError("The updated document index could not be verified.")
        except Exception as exc:
            destination.unlink(missing_ok=True)
            backup_path.replace(destination)
            logger.error("Document replacement indexing failed (%s)", type(exc).__name__)
            raise HTTPException(
                status_code=503,
                detail="The updated document could not be indexed. The previous file was restored; try again.",
            ) from exc

        manifest[stored_name] = {
            **record,
            "original_name": original_name,
            "source": "local_upload",
            "status": "indexed",
            "chunks": chunk_count,
            "error": None,
            "content_sha256": new_hash,
        }
        try:
            save_manifest(manifest)
        except OSError as exc:
            logger.exception("Could not save replacement document metadata")
            # Keep the file and verified index together. The old manifest hash
            # makes a retry recheck the content safely.
            raise HTTPException(
                status_code=503,
                detail="The document was indexed, but its status could not be saved. Refresh and retry.",
            ) from exc

        try:
            backup_path.unlink(missing_ok=True)
        except OSError:
            logger.warning("Updated document is indexed, but its temporary backup could not be removed")
        return {
            "stored_name": stored_name,
            "original_name": original_name,
            "status": "indexed",
            "chunks": chunk_count,
            "updated": True,
        }
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except OSError as exc:
        logger.exception("Could not stage replacement document")
        if backup_path.exists():
            backup_path.replace(destination)
        raise HTTPException(status_code=500, detail="The replacement file could not be saved.") from exc
    finally:
        try:
            temporary_path.unlink(missing_ok=True)
        except OSError:
            logger.warning("Could not remove temporary replacement upload")
        try:
            staging_dir.rmdir()
        except OSError:
            pass
        await file.close()


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
            "source": document_source(record),
            "size_bytes": path.stat().st_size,
            "status": "indexed" if actual_chunks > 0 else (
                "failed" if record.get("status") == "failed" else "saved"
            ),
            "chunks": actual_chunks,
            "error": record.get("error"),
        })

    return {"count": len(files), "files": files}


@router.get("/preview/{stored_name}")
def preview_document(stored_name: str):
    """Preview one stored PDF or return ordered readable content for a DOCX."""
    if re.fullmatch(r"[0-9a-f]{32}\.(?:pdf|docx)", stored_name) is None:
        raise HTTPException(status_code=400, detail="Invalid document identifier.")

    extension = Path(stored_name).suffix.lower()
    if extension not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=415, detail="This document format cannot be previewed.")

    try:
        uploads_root = UPLOAD_DIR.resolve(strict=True)
        document_path = (uploads_root / stored_name).resolve(strict=True)
    except OSError as exc:
        raise HTTPException(status_code=404, detail="The stored document was not found.") from exc

    if document_path.parent != uploads_root or not document_path.is_file():
        raise HTTPException(status_code=404, detail="The stored document was not found.")

    try:
        validate_document_file(document_path)
        manifest = read_manifest()
        record = manifest.get(stored_name)
        if not isinstance(record, dict):
            raise HTTPException(status_code=404, detail="The stored document was not found.")
        original_name = Path(
            PureWindowsPath(str(record.get("original_name") or stored_name)).name
        ).name
        original_name = re.sub(r"[\x00-\x1f]", "", original_name)[:255] or stored_name

        if extension == ".pdf":
            return FileResponse(
                document_path,
                media_type="application/pdf",
                filename=original_name,
                content_disposition_type="inline",
                headers={
                    "Cache-Control": "no-store",
                    "X-Content-Type-Options": "nosniff",
                },
            )

        word_document = WordDocument(document_path)
        blocks = []
        for item in word_document.element.body.iterchildren():
            if isinstance(item, CT_P):
                paragraph_text = WordParagraph(item, word_document).text
                if paragraph_text.strip():
                    blocks.append({"type": "paragraph", "text": paragraph_text})
            elif isinstance(item, CT_Tbl):
                rows = [
                    [cell.text for cell in row.cells]
                    for row in WordTable(item, word_document).rows
                ]
                if rows:
                    blocks.append({"type": "table", "rows": rows})

        return {
            "stored_name": stored_name,
            "original_name": original_name,
            "blocks": blocks,
        }
    except HTTPException:
        raise
    except ValueError as exc:
        raise HTTPException(
            status_code=422,
            detail="The stored document is invalid and cannot be previewed.",
        ) from exc
    except Exception as exc:
        logger.warning("Document preview failed (%s)", type(exc).__name__)
        raise HTTPException(
            status_code=422,
            detail="This document could not be previewed.",
        ) from exc


class IndexRequest(BaseModel):
    stored_names: list[str] = Field(..., min_length=1)
    reindex: bool = False


class DeleteRequest(BaseModel):
    stored_names: list[str] = Field(..., min_length=1)


@router.post("/index")
def index_documents(
    request: IndexRequest,
):
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
            record = manifest.get(filename, {})
            existing_chunks = get_document_chunk_count(filename)
            validate_document_file(path)
            current_hash = content_hash(path)
            content_changed = (
                bool(record.get("content_sha256"))
                and record.get("content_sha256") != current_hash
            )

            if (
                not request.reindex
                and not content_changed
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

            if request.reindex or content_changed:
                drive_file_id = record.get("drive_file_id")
                chunk_count = (
                    reindex_document(str(path), document_identity=drive_file_id)
                    if drive_file_id
                    else reindex_document(str(path))
                )
            else:
                chunk_count = add_documents([str(path)])
            verified_chunks = get_document_chunk_count(filename)
            if verified_chunks != chunk_count:
                raise RuntimeError("The stored document chunk count could not be verified")

            manifest[filename] = {
                **record,
                "status": "indexed",
                "chunks": chunk_count,
                "error": None,
                "content_sha256": current_hash,
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
                    "status": (
                        "indexed"
                        if record.get("status") == "indexed" and remaining_chunks > 0
                        else "failed"
                    ),
                    "chunks": remaining_chunks,
                    "error": "Indexing failed. Retry the operation or check backend logs.",
                }
                save_manifest(manifest)
            except Exception as persist_exc:
                logger.error(
                    "Could not persist indexing failure for %s (%s)",
                    filename,
                    type(persist_exc).__name__,
                )
            results.append({
                "stored_name": filename,
                "status": "failed",
                "message": "Indexing failed. Retry the operation or check backend logs."
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
