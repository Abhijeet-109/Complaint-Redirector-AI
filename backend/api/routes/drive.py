
import json
import logging
import re
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, Field

from backend.auth.dependencies import require_role
from backend.chatbot.google_drive_service import (
    consume_oauth_state,
    create_oauth_flow,
    disconnect_drive,
    download_drive_file,
    exchange_authorization_code,
    get_connection_status,
    list_drive_files,
    save_oauth_state,
)
from backend.chatbot.vector_store import (
    add_documents,
    delete_document_vectors,
    get_document_chunk_count,
)


router = APIRouter(prefix="/drive", tags=["Google Drive"])
logger = logging.getLogger("flatkart.drive")

BACKEND_DIR = Path(__file__).resolve().parents[2]
UPLOAD_DIR = BACKEND_DIR / "uploads"
MANIFEST_PATH = UPLOAD_DIR / "manifest.json"


def read_manifest():
    if not MANIFEST_PATH.exists():
        return {}

    try:
        data = json.loads(
            MANIFEST_PATH.read_text(encoding="utf-8")
        )
    except (json.JSONDecodeError, OSError) as exc:
        logger.exception("Could not read document manifest")
        raise HTTPException(
            status_code=500,
            detail="Could not read document manifest.",
        ) from exc

    if not isinstance(data, dict):
        raise HTTPException(
            status_code=500,
            detail="Document manifest has an invalid format.",
        )

    return data


def save_manifest(manifest):
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

    temporary_path = MANIFEST_PATH.with_suffix(".tmp")
    temporary_path.write_text(
        json.dumps(manifest, indent=2),
        encoding="utf-8",
    )
    temporary_path.replace(MANIFEST_PATH)


@router.get("/status")
def drive_status(
    _user=Depends(require_role("super_admin")),
):
    return get_connection_status()


@router.get("/connect")
def connect_drive(
    _user=Depends(require_role("super_admin")),
):
    try:
        # Generate the OAuth flow and its PKCE verifier.
        flow = create_oauth_flow()

        authorization_url, returned_state = flow.authorization_url(
            access_type="offline",
            include_granted_scopes="true",
            prompt="consent",
        )

        # Save the verifier created for this exact authorization request.
        code_verifier = flow.code_verifier

        if not code_verifier:
            raise RuntimeError(
                "Google OAuth did not generate a PKCE code verifier."
            )

        save_oauth_state(returned_state, code_verifier)

        return {
            "authorization_url": authorization_url,
            "state": returned_state,
        }

    except Exception as exc:
        logger.exception("Could not start Google Drive OAuth")
        raise HTTPException(
            status_code=500,
            detail="Could not start Google Drive connection.",
        ) from exc


@router.get("/callback")
def drive_callback(
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
):
    if error:
        raise HTTPException(
            status_code=400,
            detail=f"Google authorization failed: {error}",
        )

    if not code or not state:
        raise HTTPException(
            status_code=400,
            detail="Missing Google OAuth code or state.",
        )

    # Retrieve and consume the verifier saved by /drive/connect.
    code_verifier = consume_oauth_state(state)

    if not code_verifier:
        raise HTTPException(
            status_code=400,
            detail="Invalid or expired OAuth state. Start the connection again.",
        )

    try:
        exchange_authorization_code(
            code=code,
            state=state,
            code_verifier=code_verifier,
        )

    except Exception as exc:
        logger.exception("Google Drive OAuth callback failed")
        raise HTTPException(
            status_code=400,
            detail=(
                "Google Drive authorization failed. "
                "Check the backend terminal for the actual error."
            ),
        ) from exc

    return RedirectResponse(
        url="http://localhost:5173/admin",
        status_code=303,
    )


@router.get("/files")
def drive_files(
    folder_id: str | None = Query(default=None),
    page_token: str | None = Query(default=None),
    page_size: int = Query(default=100, ge=1, le=100),
    _user=Depends(require_role("super_admin")),
):
    try:
        return list_drive_files(
            folder_id=folder_id,
            page_token=page_token,
            page_size=page_size,
        )

    except RuntimeError as exc:
        raise HTTPException(
            status_code=400,
            detail=str(exc),
        ) from exc

    except Exception as exc:
        logger.exception("Could not list Google Drive files")
        raise HTTPException(
            status_code=502,
            detail="Could not retrieve files from Google Drive.",
        ) from exc


class DriveImportRequest(BaseModel):
    file_ids: list[str] = Field(
        ...,
        min_length=1,
        max_length=20,
    )


@router.post("/import")
def import_drive_files(
    request: DriveImportRequest,
    _user=Depends(require_role("super_admin")),
):
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    manifest = read_manifest()
    results = []

    already_imported_ids = {
        record.get("drive_file_id")
        for record in manifest.values()
        if isinstance(record, dict)
        and record.get("source") == "google_drive"
        and record.get("status") == "indexed"
    }

    for file_id in request.file_ids:
        if (
            not isinstance(file_id, str)
            or not file_id.strip()
            or len(file_id) > 512
            or re.fullmatch(r"[A-Za-z0-9_-]+", file_id) is None
        ):
            results.append({
                "file_id": str(file_id)[:100],
                "status": "failed",
                "message": "Invalid Google Drive file ID.",
            })
            continue

        if file_id in already_imported_ids:
            results.append({
                "file_id": file_id,
                "status": "already_imported",
                "message": (
                    "This Drive file is already indexed. "
                    "Delete it before importing again."
                ),
            })
            continue

        stored_path = None
        vectors_added = False

        try:
            temporary_path = UPLOAD_DIR / f"{uuid.uuid4().hex}.tmp"

            metadata = download_drive_file(
                file_id=file_id,
                destination=temporary_path,
            )

            stored_path = UPLOAD_DIR / metadata["stored_name"]

            if stored_path.suffix.lower() not in {".pdf", ".docx"}:
                raise ValueError(
                    "Only PDF and DOCX files can be imported."
                )

            chunk_count = add_documents([str(stored_path)])
            vectors_added = True

            manifest[stored_path.name] = {
                "original_name": metadata["original_name"],
                "status": "indexed",
                "chunks": chunk_count,
                "error": None,
                "source": "google_drive",
                "drive_file_id": file_id,
                "drive_mime_type": metadata["mime_type"],
                "modified_time": metadata.get("modified_time"),
            }

            save_manifest(manifest)
            already_imported_ids.add(file_id)

            results.append({
                "file_id": file_id,
                "stored_name": stored_path.name,
                "original_name": metadata["original_name"],
                "status": "indexed",
                "chunks": chunk_count,
            })

        except Exception as exc:
            logger.exception(
                "Google Drive import failed for file ID %s",
                file_id,
            )

            if stored_path is not None and vectors_added:
                try:
                    delete_document_vectors(stored_path.name)
                except Exception:
                    logger.exception(
                        "Could not remove partial vectors for %s",
                        stored_path.name,
                    )

            if stored_path is not None and stored_path.exists():
                try:
                    stored_path.unlink()
                except OSError:
                    logger.exception(
                        "Could not remove failed Drive download %s",
                        stored_path,
                    )

            if stored_path is not None:
                manifest.pop(stored_path.name, None)
                try:
                    save_manifest(manifest)
                except OSError:
                    logger.exception(
                        "Could not update manifest after import failure"
                    )

            results.append({
                "file_id": file_id,
                "status": "failed",
                "message": str(exc)[:240] or "Import failed. Check backend logs.",
            })

    return {
        "results": results,
        "imported_count": sum(
            item["status"] == "indexed"
            for item in results
        ),
        "already_imported_count": sum(
            item["status"] == "already_imported"
            for item in results
        ),
    }


@router.get("/import-status")
def drive_import_status(
    _user=Depends(require_role("super_admin")),
):
    manifest = read_manifest()

    imported_files = [
        {
            "stored_name": stored_name,
            "original_name": record.get("original_name", stored_name),
            "drive_file_id": record.get("drive_file_id"),
            "status": record.get("status"),
            "chunks": get_document_chunk_count(stored_name),
            "modified_time": record.get("modified_time"),
        }
        for stored_name, record in manifest.items()
        if isinstance(record, dict)
        and record.get("source") == "google_drive"
    ]

    return {
        "count": len(imported_files),
        "files": imported_files,
    }


@router.delete("/disconnect")
def disconnect_google_drive(
    _user=Depends(require_role("super_admin")),
):
    try:
        return disconnect_drive()

    except OSError as exc:
        logger.exception("Could not disconnect Google Drive")
        raise HTTPException(
            status_code=500,
            detail="Could not remove saved Google Drive credentials.",
        ) from exc
