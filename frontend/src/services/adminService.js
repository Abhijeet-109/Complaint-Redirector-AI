import { apiRequest } from './api';

export const adminService = {
  // Delivery & Shipment Options
  listShipmentOptions: (search = '') => apiRequest(`/api/admin/shipment-options?search=${encodeURIComponent(search)}`),
  createShipmentOption: (data) => apiRequest('/api/admin/shipment-options', { method: 'POST', body: JSON.stringify(data) }),
  updateShipmentOption: (id, data) => {
    const { id: _, ...body } = data || {};
    return apiRequest(`/api/admin/shipment-options/${id}`, { method: 'PUT', body: JSON.stringify(body) });
  },
  deactivateShipmentOption: (id) => apiRequest(`/api/admin/shipment-options/${id}`, { method: 'DELETE' }),
  activateShipmentOption: (id, data) => {
    const { id: _, ...body } = data || {};
    return apiRequest(`/api/admin/shipment-options/${id}`, { method: 'PUT', body: JSON.stringify({ ...body, is_active: true }) });
  },

  // Users Management
  async getUsers() {
    return await apiRequest('/api/admin/users', { method: 'GET' });
  },

  async createUser(userData) {
    return await apiRequest('/api/admin/users', {
      method: 'POST',
      body: JSON.stringify(userData),
    });
  },

  async updateUser(userId, userData) {
    return await apiRequest(`/api/admin/users/${userId}`, {
      method: 'PUT',
      body: JSON.stringify(userData),
    });
  },

  async deleteUser(userId) {
    return await apiRequest(`/api/admin/users/${userId}`, {
      method: 'DELETE',
    });
  },

  // Departments Management
  async getDepartments() {
    return await apiRequest('/api/admin/departments', { method: 'GET' });
  },

  async createDepartment(departmentData) {
    return await apiRequest('/api/admin/departments', {
      method: 'POST',
      body: JSON.stringify(departmentData),
    });
  },

  async updateDepartment(departmentId, departmentData) {
    return await apiRequest(`/api/admin/departments/${departmentId}`, {
      method: 'PUT',
      body: JSON.stringify(departmentData),
    });
  },

  async deleteDepartment(departmentId) {
    return await apiRequest(`/api/admin/departments/${departmentId}`, {
      method: 'DELETE',
    });
  },

  // Complaints Oversight
  async getComplaints() {
    return await apiRequest('/api/v1/admin/complaints', { method: 'GET' });
  },

  // Complaint Redirection History
  async getComplaintRedirections(complaintId) {
    return await apiRequest(`/api/v1/handler/complaints/${complaintId}/redirections`, {
      method: 'GET',
    });
  },

  // Redirection Analytics
  async getRedirectionKpis() {
    return await apiRequest('/api/v1/admin/redirection-kpis', { method: 'GET' });
  },

  async getChatbotPerformance({ offset = 0, limit = 10 } = {}) {
    const params = new URLSearchParams({ offset: String(offset), limit: String(limit) });
    return await apiRequest(`/chatbot/performance?${params}`, { method: 'GET' });
  },

  // -------------------------------------------------------------------------
  // Commerce & Store Administration APIs
  // -------------------------------------------------------------------------

  // Store Dashboard
  getStoreDashboardKpis: () => apiRequest('/api/admin/commerce/dashboard/kpis'),
  getRevenueChart: (period = 'month') => apiRequest(`/api/admin/commerce/dashboard/revenue-chart?period=${period}`),
  getHotProducts: (period = 'week', limit = 5) => apiRequest(`/api/admin/commerce/dashboard/hot-products?period=${period}&limit=${limit}`),

  // Orders Management
  getAdminOrders: (params = {}) => {
    const q = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') q.append(k, String(v));
    });
    const qs = q.toString();
    return apiRequest(`/api/admin/commerce/orders${qs ? '?' + qs : ''}`);
  },
  getAdminOrderDetail: (orderId) => apiRequest(`/api/admin/commerce/orders/${orderId}`),
  updateOrderStatus: (orderId, status) =>
    apiRequest(`/api/admin/commerce/orders/${orderId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),
  updateShipment: (orderId, data) =>
    apiRequest(`/api/admin/commerce/orders/${orderId}/shipment`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  getShipmentEvents: (orderId) => apiRequest(`/api/admin/commerce/orders/${orderId}/shipment/events`),

  // Inventory Management
  getInventory: (params = {}) => {
    const q = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') q.append(k, String(v));
    });
    const qs = q.toString();
    return apiRequest(`/api/admin/commerce/inventory${qs ? '?' + qs : ''}`);
  },
  getCategoryStock: () => apiRequest('/api/admin/commerce/inventory/categories'),

  // Payments History & Export
  getPayments: (params = {}) => {
    const q = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') q.append(k, String(v));
    });
    const qs = q.toString();
    return apiRequest(`/api/admin/commerce/payments${qs ? '?' + qs : ''}`);
  },

  // Returns & Refunds
  getReturnRequests: (params = {}) => {
    const q = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') q.append(k, String(v));
    });
    const qs = q.toString();
    return apiRequest(`/api/admin/commerce/returns${qs ? '?' + qs : ''}`);
  },
  updateReturnStatus: (returnId, status, restock = false) =>
    apiRequest(`/api/admin/commerce/returns/${returnId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status, restock }),
    }),
  getRefunds: (params = {}) => {
    const q = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') q.append(k, String(v));
    });
    const qs = q.toString();
    return apiRequest(`/api/admin/commerce/refunds${qs ? '?' + qs : ''}`);
  },
  lookupOrderForRefund: (orderNumber) =>
    apiRequest(`/api/admin/commerce/orders/lookup/${encodeURIComponent(orderNumber)}`),
  processRazorpayRefund: (data) =>
    apiRequest('/api/admin/commerce/refunds/razorpay', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  recordCODRefund: (data) =>
    apiRequest('/api/admin/commerce/refunds/cod-manual', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
};

export default adminService;
