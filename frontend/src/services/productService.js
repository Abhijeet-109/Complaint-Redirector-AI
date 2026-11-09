import { apiRequest } from './api.js';

const HOME_CATALOGUE_TTL = 2 * 60 * 1000;
let homeCatalogueCache = null;
let homeCatalogueRequest = null;

export function getHomeCatalogueSnapshot() {
  return homeCatalogueCache?.value || null;
}

export function getHomeCatalogue({ refresh = false } = {}) {
  if (!refresh && homeCatalogueCache && Date.now() - homeCatalogueCache.savedAt < HOME_CATALOGUE_TTL) {
    return Promise.resolve(homeCatalogueCache.value);
  }
  if (!refresh && homeCatalogueRequest) return homeCatalogueRequest;
  homeCatalogueRequest = Promise.all([productService.list({ limit: 100 }), productService.categories()])
    .then(([products, categories]) => {
      const value = { products: Array.isArray(products) ? products : [], categories: Array.isArray(categories) ? categories : [] };
      homeCatalogueCache = { savedAt: Date.now(), value };
      return value;
    })
    .finally(() => { homeCatalogueRequest = null; });
  return homeCatalogueRequest;
}

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
  getCart: () => apiRequest('/api/cart'),
  addCartItem: (productId, variantId, quantity = 1) => apiRequest('/api/cart/items', {
    method: 'POST', body: JSON.stringify({ product_id: productId, variant_id: variantId, quantity }),
  }),
  updateCartItem: (variantId, quantity) => apiRequest(`/api/cart/items/${variantId}`, {
    method: 'PUT', body: JSON.stringify({ quantity }),
  }),
  removeCartItem: (variantId) => apiRequest(`/api/cart/items/${variantId}`, { method: 'DELETE' }),
  getCheckoutSummary: (intent = null) => apiRequest(`/api/checkout/summary${intent ? `?variant_id=${encodeURIComponent(intent.variantId)}&quantity=${encodeURIComponent(intent.quantity)}` : ''}`),
  placeCodOrder: (address, idempotencyKey, checkout = {}) => apiRequest('/api/checkout/cod', {
    method: 'POST', headers: { 'Idempotency-Key': idempotencyKey }, body: JSON.stringify({ address, ...checkout }),
  }),
  createRazorpayCheckout: (address, idempotencyKey, checkout = {}) => apiRequest('/api/checkout/razorpay', {
    method: 'POST', headers: { 'Idempotency-Key': idempotencyKey }, body: JSON.stringify({ address, ...checkout }),
  }),
  verifyRazorpayPayment: (payment) => apiRequest('/api/payments/verify', {
    method: 'POST', body: JSON.stringify(payment),
  }),
  cancelRazorpayAttempt: (attemptId) => apiRequest('/api/payments/cancel', {
    method: 'POST', body: JSON.stringify({ attempt_id: attemptId }),
  }),
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
  deleteProduct: (id) => apiRequest(`/api/admin/catalog/products/${id}`, { method: 'DELETE' }),
  deleteCategory: (id) => apiRequest(`/api/admin/catalog/categories/${id}`, { method: 'DELETE' }),
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
