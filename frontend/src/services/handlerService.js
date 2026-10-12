import { apiRequest } from './api';

export const handlerService = {
  /**
   * Get complaints assigned to the current handler's department.
   * GET /api/v1/handler/complaints
   */
  async getAssignedComplaints() {
    return await apiRequest('/api/v1/handler/complaints', { method: 'GET' });
  },

  /**
   * Update a complaint's status (pending, followed_up, resolved).
   * PATCH /api/v1/handler/complaints/{id}/status
   */
  async updateComplaintStatus(complaintId, newStatus) {
    return await apiRequest(`/api/v1/handler/complaints/${complaintId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: newStatus }),
    });
  },

  /**
   * Redirect a complaint to a different department.
   * PATCH /api/v1/handler/complaints/{id}/redirect
   */
  async redirectComplaint(complaintId, departmentId, reason) {
    return await apiRequest(`/api/v1/handler/complaints/${complaintId}/redirect`, {
      method: 'PATCH',
      body: JSON.stringify({ department_id: departmentId, reason }),
    });
  },

  /**
   * Get redirection history for a complaint.
   * GET /api/v1/handler/complaints/{id}/redirections
   */
  async getRedirectionHistory(complaintId) {
    return await apiRequest(`/api/v1/handler/complaints/${complaintId}/redirections`, {
      method: 'GET',
    });
  },

  /**
   * Get all departments (for the redirect target selector).
   * GET /api/v1/departments
   */
  async getDepartments() {
    return await apiRequest('/api/v1/departments', { method: 'GET' });
  },
};

export default handlerService;
