import { apiRequest } from './api';

async function uploadRequest(endpoint, formData, fallbackMessage) {
  const token = localStorage.getItem('flatkart_token');
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(endpoint, { method: 'POST', headers, body: formData });
  if (!response.ok) {
    let errorDetail = fallbackMessage;
    try {
      const errorData = await response.json();
      errorDetail = errorData.detail || errorData.message || errorDetail;
    } catch {
      // Keep the plain-language fallback when the server did not return JSON.
    }
    throw new Error(errorDetail);
  }
  return response.json();
}

/**
 * Document Management Service
 * Wraps /documents endpoints for the Super Admin Pipeline UI.
 *
 * NOTE: Upload needs FormData so we bypass apiRequest's JSON Content-Type.
 */

export const documentService = {
  /**
   * List all uploaded documents.
   * GET /documents
   */
  async listDocuments() {
    return await apiRequest('/documents', { method: 'GET' });
  },

  /**
   * Upload multiple PDF/DOCX files.
   * POST /documents/upload (multipart/form-data)
   *
   * We intentionally skip apiRequest here because apiRequest
   * sets Content-Type: application/json. FormData requires the
   * browser to set the multipart boundary automatically.
   */
  async uploadDocuments(files) {
    const formData = new FormData();
    for (const file of files) {
      formData.append('files', file);
    }

    return uploadRequest('/documents/upload', formData, 'Upload failed. Please try again.');
  },

  /** Replace the contents of one explicitly selected local document. */
  async replaceDocument(storedName, file) {
    const formData = new FormData();
    formData.append('stored_name', storedName);
    formData.append('file', file);
    return uploadRequest('/documents/replace', formData, 'Document update failed. Please try again.');
  },

  /**
   * Index selected documents.
   * POST /documents/index
   * Body: { stored_names: string[] }
   */
  async indexDocuments(storedNames, reindex = false) {
    return await apiRequest('/documents/index', {
      method: 'POST',
      body: JSON.stringify({ stored_names: storedNames, reindex }),
    });
  },

  async getPipelineConfig() {
    return await apiRequest('/documents/config', { method: 'GET' });
  },

  /**
   * Delete saved documents and their indexed chunks by backend storage name.
   */
  async deleteDocuments(storedNames) {
    return await apiRequest('/documents/delete', {
      method: 'POST',
      body: JSON.stringify({ stored_names: storedNames }),
    });
  },
};

export default documentService;
