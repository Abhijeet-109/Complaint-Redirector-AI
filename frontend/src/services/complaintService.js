import { apiRequest } from './api';

export const complaintService = {
  async predictDepartment(complaintText) {
    return await apiRequest('/classifier/predict', {
      method: 'POST',
      body: JSON.stringify({ complaint: complaintText }),
    });
  },

  async createComplaint(complaintText) {
    return await apiRequest('/api/v1/complaints', {
      method: 'POST',
      body: JSON.stringify({ complaint_text: complaintText }),
    });
  },

  async getMyComplaints() {
    return await apiRequest('/api/v1/complaints/mine', {
      method: 'GET',
    });
  },

  async processComplaint(name, email, complaint) {
    return await apiRequest('/api/v1/process-complaint', {
      method: 'POST',
      body: JSON.stringify({ name, email, complaint }),
    });
  },
};
