import { apiRequest } from './api';

export const adminService = {
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
};

export default adminService;
