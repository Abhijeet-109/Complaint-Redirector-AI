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

  /**
   * List return claims (Review Queue or All Requests).
   * GET /api/v1/departments/returns
   */
  async getReturns(params = {}) {
    const query = new URLSearchParams();
    if (params.workflow_status) query.append('workflow_status', params.workflow_status);
    if (params.include_all) query.append('include_all', 'true');
    if (params.resolution_type) query.append('resolution_type', params.resolution_type);
    if (params.search) query.append('search', params.search);
    if (params.limit !== undefined) query.append('limit', String(params.limit));
    if (params.offset !== undefined) query.append('offset', String(params.offset));
    const qs = query.toString();
    return await apiRequest(`/api/v1/departments/returns${qs ? `?${qs}` : ''}`, { method: 'GET' });
  },

  /**
   * Get details for a specific return claim.
   * GET /api/v1/departments/returns/{claim_id}
   */
  async getClaimDetails(claimId) {
    return await apiRequest(`/api/v1/departments/returns/${claimId}`, { method: 'GET' });
  },

  /**
   * List tracking handoffs between departments.
   * GET /api/v1/departments/tracking-handoffs
   */
  async getTrackingHandoffs(params = {}) {
    const query = new URLSearchParams();
    if (params.department_name) query.append('department_name', params.department_name);
    if (params.status) query.append('status', params.status);
    if (params.search) query.append('search', params.search);
    if (params.limit !== undefined) query.append('limit', String(params.limit));
    if (params.offset !== undefined) query.append('offset', String(params.offset));
    const qs = query.toString();
    return await apiRequest(`/api/v1/departments/tracking-handoffs${qs ? `?${qs}` : ''}`, { method: 'GET' });
  },

  /**
   * List audit logs / history events.
   * GET /api/v1/departments/history-audit
   */
  async getHistoryAudit(params = {}) {
    const query = new URLSearchParams();
    if (params.action) query.append('action', params.action);
    if (params.search) query.append('search', params.search);
    if (params.limit !== undefined) query.append('limit', String(params.limit));
    if (params.offset !== undefined) query.append('offset', String(params.offset));
    const qs = query.toString();
    return await apiRequest(`/api/v1/departments/history-audit${qs ? `?${qs}` : ''}`, { method: 'GET' });
  },

  /**
   * Get overview KPI stats.
   * GET /api/v1/departments/overview-stats
   */
  async getOverviewStats() {
    return await apiRequest('/api/v1/departments/overview-stats', { method: 'GET' });
  },

  /**
   * Get reports breakdown and trend data.
   * GET /api/v1/departments/reports-stats
   */
  async getReportsStats(params = {}) {
    const query = new URLSearchParams();
    if (params.days !== undefined) query.append('days', String(params.days));
    const qs = query.toString();
    return await apiRequest(`/api/v1/departments/reports-stats${qs ? `?${qs}` : ''}`, { method: 'GET' });
  },
};

export default handlerService;
