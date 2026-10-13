export const DOCUMENT_SOURCE_LABELS = Object.freeze({
  local_upload: 'Local Upload',
  google_drive: 'Google Drive',
  unknown: 'Unknown source',
});

export function normalizeDocumentSource(file) {
  if (file?.source === 'google_drive' || file?.drive_file_id) return 'google_drive';
  if (file?.source === 'local_upload') return 'local_upload';
  return 'unknown';
}
