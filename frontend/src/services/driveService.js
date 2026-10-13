import { apiRequest } from './api';

export const driveService = {
  async getStatus() {
    return apiRequest('/drive/status', { method: 'GET' });
  },

  async startConnection() {
    return apiRequest('/drive/connect', { method: 'GET' });
  },

  async listFiles({ folderId = null, pageToken = null, pageSize = 100 } = {}) {
    const params = new URLSearchParams({ page_size: String(pageSize) });
    if (folderId) params.set('folder_id', folderId);
    if (pageToken) params.set('page_token', pageToken);
    return apiRequest(`/drive/files?${params}`, { method: 'GET' });
  },

  async importFiles(fileIds) {
    return apiRequest('/drive/import', {
      method: 'POST',
      body: JSON.stringify({ file_ids: fileIds }),
    });
  },

  async getImportStatus() {
    return apiRequest('/drive/import-status', { method: 'GET' });
  },

  async disconnect() {
    return apiRequest('/drive/disconnect', { method: 'DELETE' });
  },
};

export default driveService;
