import { apiRequest } from './api';

const query = (values = {}) => {
  const params = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') params.set(key, value);
  });
  return params.toString();
};

export const productService = {
  list: (filters = {}) => apiRequest(`/api/products?${query(filters)}`),
  search: (search, limit = 8) => apiRequest(`/api/products?${query({ search, limit })}`),
  get: (slug) => apiRequest(`/api/products/${encodeURIComponent(slug)}`),
  categories: () => apiRequest('/api/categories'),
  adminProducts: (filters = {}) => apiRequest(`/api/admin/catalog/products?${query(filters)}`),
  adminProduct: (id) => apiRequest(`/api/admin/catalog/products/${id}`),
  createProduct: (data) => apiRequest('/api/admin/catalog/products', { method: 'POST', body: JSON.stringify(data) }),
  updateProduct: (id, data) => apiRequest(`/api/admin/catalog/products/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  orderImages: (id, imageIds, variantId = null) => apiRequest(`/api/admin/catalog/products/${id}/images/order`, { method: 'PUT', body: JSON.stringify({ image_ids: imageIds, variant_id: variantId }) }),
  deleteImage: (id, imageId) => apiRequest(`/api/admin/catalog/products/${id}/images/${imageId}`, { method: 'DELETE' }),
  archiveProduct: (id, archived) => apiRequest(`/api/admin/catalog/products/${id}/${archived ? 'restore' : 'archive'}`, { method: 'PATCH' }),
  categoriesAdmin: () => apiRequest('/api/admin/catalog/categories'),
  createCategory: (data) => apiRequest('/api/admin/catalog/categories', { method: 'POST', body: JSON.stringify(data) }),
  updateCategory: (id, data) => apiRequest(`/api/admin/catalog/categories/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  archiveCategory: (id, archived) => apiRequest(`/api/admin/catalog/categories/${id}/${archived ? 'restore' : 'archive'}`, { method: 'PATCH' }),
  uploadImage: (productId, file, onProgress = () => {}, variantId = null) => new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/api/admin/catalog/products/${productId}/images`);
    const token = localStorage.getItem('flatkart_token');
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.upload.onprogress = (event) => { if (event.lengthComputable) onProgress(Math.round(event.loaded * 100 / event.total)); };
    xhr.onload = () => {
      let payload = {};
      try { payload = JSON.parse(xhr.responseText); } catch { /* handled below */ }
      if (xhr.status >= 200 && xhr.status < 300) resolve(payload);
      else reject(new Error(payload.detail || `Upload failed (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error('Image upload failed. Check your connection.'));
    const body = new FormData();
    body.append('file', file);
    if (variantId != null) body.append('variant_id', String(variantId));
    xhr.send(body);
  }),
};
