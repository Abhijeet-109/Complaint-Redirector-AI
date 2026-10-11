import os
import uuid
import shutil
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, UploadFile, File, HTTPException

router = APIRouter(prefix="/documents", tags=["Documents"])

BASE_DIR = Path(__file__).resolve().parents[2]
UPLOAD_DIR = BASE_DIR / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

ALLOWED_EXTENSIONS = {".pdf", ".docx"}


@router.post("/upload")
async def upload_documents(
    files: Annotated[list[UploadFile], File(description="Select PDF or DOCX files")]
):
    uploaded_files = []

    for file in files:
        original_name = file.filename or "document"
        extension = Path(original_name).suffix.lower()

        if extension not in ALLOWED_EXTENSIONS:
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported file type: {original_name}"
            )

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
        finally:
            await file.close()

    return {
        "message": "Documents saved successfully. They have not been indexed.",
        "uploaded_count": len(uploaded_files),
        "files": uploaded_files
    }