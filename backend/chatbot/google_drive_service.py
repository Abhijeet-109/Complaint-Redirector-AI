
import json
import logging
import os
import time
from io import BytesIO
from pathlib import Path

from dotenv import load_dotenv
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload


logger = logging.getLogger("flatkart.google_drive")

BACKEND_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = BACKEND_DIR / "data"
TOKEN_FILE = DATA_DIR / "google_drive_token.json"
STATE_FILE = DATA_DIR / "google_drive_oauth_states.json"

load_dotenv(BACKEND_DIR / ".env")

SCOPES = ["https://www.googleapis.com/auth/drive.readonly"]

GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET")
GOOGLE_REDIRECT_URI = os.getenv(
    "GOOGLE_REDIRECT_URI",
    "http://localhost:8000/drive/callback",
)


def _client_config():
    if not GOOGLE_CLIENT_ID or not GOOGLE_CLIENT_SECRET:
        raise RuntimeError(
            "GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set in backend/.env"
        )

    return {
        "web": {
            "client_id": GOOGLE_CLIENT_ID,
            "client_secret": GOOGLE_CLIENT_SECRET,
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "redirect_uris": [GOOGLE_REDIRECT_URI],
        }
    }


def create_oauth_flow(state=None, code_verifier=None):
    flow = Flow.from_client_config(
        _client_config(),
        scopes=SCOPES,
        state=state,
        code_verifier=code_verifier,
    )
    flow.redirect_uri = GOOGLE_REDIRECT_URI
    return flow


def save_oauth_state(state, code_verifier):
    """Save OAuth state and its PKCE verifier for the callback."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)

    try:
        states = json.loads(STATE_FILE.read_text(encoding="utf-8"))
        if not isinstance(states, dict):
            states = {}
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        states = {}

    now = int(time.time())

    # Keep only valid states that are less than 10 minutes old.
    states = {
        key: value
        for key, value in states.items()
        if isinstance(value, dict)
        and isinstance(value.get("created_at"), int)
        and 0 <= now - value["created_at"] < 600
    }

    states[state] = {
        "created_at": now,
        "code_verifier": code_verifier,
    }

    temporary_file = STATE_FILE.with_suffix(".tmp")
    temporary_file.write_text(json.dumps(states), encoding="utf-8")
    temporary_file.replace(STATE_FILE)


def consume_oauth_state(state):
    """
    Validate a state once and return its saved PKCE verifier.
    Returns None if the state is invalid or expired.
    """
    if not STATE_FILE.exists():
        return None

    try:
        states = json.loads(STATE_FILE.read_text(encoding="utf-8"))
        if not isinstance(states, dict):
            return None
    except (json.JSONDecodeError, OSError):
        logger.exception("Could not read Google OAuth state file")
        return None

    item = states.pop(state, None)

    temporary_file = STATE_FILE.with_suffix(".tmp")

    try:
        temporary_file.write_text(json.dumps(states), encoding="utf-8")
        temporary_file.replace(STATE_FILE)
    except OSError:
        logger.exception("Could not update Google OAuth state file")
        return None

    if not isinstance(item, dict):
        return None

    created_at = item.get("created_at")
    code_verifier = item.get("code_verifier")

    age = (
        int(time.time()) - created_at
        if isinstance(created_at, int)
        else -1
    )

    if not (0 <= age < 600):
        return None

    if not isinstance(code_verifier, str) or not code_verifier:
        return None

    return code_verifier


def exchange_authorization_code(code, state, code_verifier):
    """Exchange Google's authorization code using the original PKCE verifier."""
    flow = create_oauth_flow(
        state=state,
        code_verifier=code_verifier,
    )

    flow.fetch_token(code=code)

    credentials = flow.credentials
    save_credentials(credentials)

    return credentials


def save_credentials(credentials):
    DATA_DIR.mkdir(parents=True, exist_ok=True)

    temporary_file = TOKEN_FILE.with_suffix(".tmp")
    temporary_file.write_text(
        credentials.to_json(),
        encoding="utf-8",
    )
    temporary_file.replace(TOKEN_FILE)


def load_credentials():
    if not TOKEN_FILE.exists():
        return None

    try:
        credentials = Credentials.from_authorized_user_file(
            str(TOKEN_FILE),
            SCOPES,
        )
    except (ValueError, OSError):
        logger.exception("Could not load Google Drive credentials")
        return None

    if credentials.expired and credentials.refresh_token:
        try:
            credentials.refresh(Request())
            save_credentials(credentials)
        except Exception:
            logger.exception("Could not refresh Google Drive credentials")
            return None

    if not credentials.valid:
        return None

    return credentials


def get_drive_service():
    credentials = load_credentials()

    if credentials is None:
        raise RuntimeError(
            "Google Drive is not connected. Connect it from the admin dashboard."
        )

    return build(
        "drive",
        "v3",
        credentials=credentials,
        cache_discovery=False,
    )


def get_connection_status():
    credentials = load_credentials()

    return {
        "connected": credentials is not None,
        "account": None,
        "message": (
            "Google Drive connected."
            if credentials is not None
            else "Google Drive is not connected."
        ),
    }


def list_drive_files(folder_id=None, page_token=None, page_size=100):
    service = get_drive_service()
    query_parts = ["trashed = false"]

    if folder_id:
        safe_folder_id = (
            folder_id.replace("\\", "\\\\").replace("'", "\\'")
        )
        query_parts.append(f"'{safe_folder_id}' in parents")
    else:
        query_parts.append("'root' in parents")

    response = service.files().list(
        q=" and ".join(query_parts),
        pageSize=max(1, min(page_size, 100)),
        pageToken=page_token,
        orderBy="name",
        fields=(
            "nextPageToken,"
            "files(id,name,mimeType,modifiedTime,size,webViewLink)"
        ),
    ).execute()

    return {
        "files": response.get("files", []),
        "next_page_token": response.get("nextPageToken"),
    }


def _download_request(service, file_id, mime_type):
    if mime_type in {
        "application/pdf",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    }:
        return service.files().get_media(fileId=file_id)

    if mime_type == "application/vnd.google-apps.document":
        return service.files().export(
            fileId=file_id,
            mimeType=(
                "application/vnd.openxmlformats-officedocument."
                "wordprocessingml.document"
            ),
        )

    raise ValueError(
        "Unsupported file type. Import PDF, DOCX, or Google Docs files only."
    )


def download_drive_file(file_id, destination):
    service = get_drive_service()

    metadata = service.files().get(
        fileId=file_id,
        fields="id,name,mimeType,modifiedTime,size",
    ).execute()

    mime_type = metadata.get("mimeType", "")
    original_name = metadata.get("name", "drive_document")

    request = _download_request(service, file_id, mime_type)

    extension = ".pdf" if mime_type == "application/pdf" else ".docx"

    destination = Path(destination).with_suffix(extension)
    destination.parent.mkdir(parents=True, exist_ok=True)

    buffer = BytesIO()
    downloader = MediaIoBaseDownload(buffer, request)

    done = False
    while not done:
        _, done = downloader.next_chunk()

    destination.write_bytes(buffer.getvalue())

    return {
        "stored_name": destination.name,
        "original_name": original_name,
        "mime_type": mime_type,
        "modified_time": metadata.get("modifiedTime"),
        "size_bytes": destination.stat().st_size,
    }


def disconnect_drive():
    if TOKEN_FILE.exists():
        TOKEN_FILE.unlink()

    return {
        "connected": False,
        "message": "Google Drive disconnected.",
    }
