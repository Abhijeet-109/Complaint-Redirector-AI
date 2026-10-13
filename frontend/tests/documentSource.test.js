import assert from 'node:assert/strict';
import test from 'node:test';
import { DOCUMENT_SOURCE_LABELS, normalizeDocumentSource } from '../src/utils/documentSource.js';

test('document sources retain backend identifiers for filtering and readable labels', () => {
  assert.equal(normalizeDocumentSource({ source: 'local_upload' }), 'local_upload');
  assert.equal(normalizeDocumentSource({ source: 'google_drive' }), 'google_drive');
  assert.equal(normalizeDocumentSource({ drive_file_id: 'drive-id' }), 'google_drive');
  assert.equal(normalizeDocumentSource({}), 'unknown');
  assert.deepEqual(DOCUMENT_SOURCE_LABELS, {
    local_upload: 'Local Upload',
    google_drive: 'Google Drive',
    unknown: 'Unknown source',
  });
});
