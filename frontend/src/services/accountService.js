import { apiRequest } from './api.js';

export const accountService = {
  profile: () => apiRequest('/api/account/profile'),
  updateProfile: (profile) => apiRequest('/api/account/profile', { method: 'PUT', body: JSON.stringify(profile) }),
  changePassword: (values) => apiRequest('/api/account/password', { method: 'PUT', body: JSON.stringify(values) }),
  addresses: () => apiRequest('/api/account/addresses'),
  createAddress: (address) => apiRequest('/api/account/addresses', { method: 'POST', body: JSON.stringify(address) }),
  updateAddress: (id, address) => apiRequest(`/api/account/addresses/${id}`, { method: 'PUT', body: JSON.stringify(address) }),
  deleteAddress: (id) => apiRequest(`/api/account/addresses/${id}`, { method: 'DELETE' }),
  setDefaultAddress: (id) => apiRequest(`/api/account/addresses/${id}/default`, { method: 'PUT' }),
  paymentPreference: () => apiRequest('/api/account/payment-preference'),
  savePaymentPreference: (preferred_payment_method) => apiRequest('/api/account/payment-preference', {
    method: 'PUT', body: JSON.stringify({ preferred_payment_method }),
  }),
  orders: () => apiRequest('/api/account/orders'),
  order: (id) => apiRequest(`/api/account/orders/${id}`),
  returnEligibility: (orderId, orderItemId) => apiRequest(`/api/account/orders/${orderId}/items/${orderItemId}/return-eligibility`),
  createReturnClaim: (data) => apiRequest('/api/account/returns', { method: 'POST', body: JSON.stringify(data) }),
  uploadReturnEvidence: (claimId, files) => {
    const formData = new FormData();
    files.forEach((file) => formData.append('files', file));
    return apiRequest(`/api/account/returns/${claimId}/evidence`, { method: 'POST', body: formData });
  },
  returnClaim: (claimId) => apiRequest(`/api/account/returns/${claimId}`),
  wishlist: () => apiRequest('/api/account/wishlist'),
  addWishlist: (productId) => apiRequest(`/api/account/wishlist/${productId}`, { method: 'POST' }),
  removeWishlist: (productId) => apiRequest(`/api/account/wishlist/${productId}`, { method: 'DELETE' }),
  deliveryCheck: (pincode) => apiRequest(`/api/delivery/check?pincode=${encodeURIComponent(pincode)}`),
  shipmentOptions: (search = '') => apiRequest(`/api/admin/shipment-options?search=${encodeURIComponent(search)}`),
  createShipmentOption: (data) => apiRequest('/api/admin/shipment-options', { method: 'POST', body: JSON.stringify(data) }),
  updateShipmentOption: (id, data) => apiRequest(`/api/admin/shipment-options/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deactivateShipmentOption: (id) => apiRequest(`/api/admin/shipment-options/${id}`, { method: 'DELETE' }),
};

export default accountService;
