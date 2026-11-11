import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  MessageCircle,
  Building2,
  GitCompare,
  CheckCircle2,
  Send,
  History,
} from 'lucide-react';
import { handlerService } from '../../services/handlerService';
import { HandlerStatusBadge } from './HandlerStatusBadge';

export function HandlerComplaintDetailView({ complaintId, onBack, onNavigate, onRefresh }) {
  const handleBack = () => {
    if (onBack) onBack();
    else if (onNavigate) onNavigate('handler-dashboard', '/handler/complaints');
  };
  const [complaint, setComplaint] = useState(null);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Status update state
  const [newStatus, setNewStatus] = useState('pending');
  const [updatingStatus, setUpdatingStatus] = useState(false);

  // Redirection state
  const [targetDeptId, setTargetDeptId] = useState('');
  const [redirectReason, setRedirectReason] = useState('further_processing');
  const [redirecting, setRedirecting] = useState(false);

  // History state
  const [historyList, setHistoryList] = useState([]);
  const [toastMessage, setToastMessage] = useState(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [compData, deptsData, histData] = await Promise.all([
        handlerService.getComplaintDetails(complaintId),
        handlerService.getDepartments().catch(() => []),
        handlerService.getRedirectionHistory(complaintId).catch(() => []),
      ]);
      setComplaint(compData);
      setNewStatus(compData.status || 'pending');
      setDepartments(Array.isArray(deptsData) ? deptsData : []);
      setHistoryList(Array.isArray(histData) ? histData : []);
    } catch (err) {
      console.error('Failed to load complaint details:', err);
      setError(err.message || 'Failed to load complaint details.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (complaintId) {
      loadData();
    }
  }, [complaintId]);

  const handleStatusUpdate = async () => {
    setUpdatingStatus(true);
    try {
      const updated = await handlerService.updateComplaintStatus(complaintId, newStatus);
      setComplaint(updated);
      setToastMessage({ type: 'success', text: `Status updated to ${newStatus}.` });
    } catch (err) {
      console.error('Failed to update status:', err);
      setToastMessage({ type: 'error', text: err.message || 'Status update failed.' });
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleRedirect = async () => {
    if (!targetDeptId) {
      alert('Please select a target department.');
      return;
    }
    setRedirecting(true);
    try {
      await handlerService.redirectComplaint(complaintId, targetDeptId, redirectReason);
      setToastMessage({ type: 'success', text: 'Complaint redirected successfully.' });
      await loadData();
    } catch (err) {
      console.error('Failed to redirect complaint:', err);
      setToastMessage({ type: 'error', text: err.message || 'Redirection failed.' });
    } finally {
      setRedirecting(false);
    }
  };

  if (loading) {
    return (
      <div className="hd-detail-loading">
        Loading complaint CMP-{complaintId}...
      </div>
    );
  }

  if (error || !complaint) {
    return (
      <div className="hd-detail-error">
        <p>{error || 'Complaint not found.'}</p>
        <button
          type="button"
          className="hd-back-link"
          onClick={handleBack}
        >
          <ArrowLeft size={16} /> Back to Complaints
        </button>
      </div>
    );
  }

  return (
    <div className="hd-page hd-detail-page">
      <div className="hd-detail-header-nav">
        <button
          type="button"
          className="hd-back-btn"
          onClick={handleBack}
        >
          <ArrowLeft size={16} />
          <span>Back to Complaints</span>
        </button>
      </div>

      {toastMessage && (
        <div className={`hd-toast hd-toast-${toastMessage.type}`}>
          {toastMessage.text}
        </div>
      )}

      {/* Main Title Card */}
      <div className="hd-detail-title-card">
        <div>
          <div className="hd-detail-id-row">
            <h2 className="hd-detail-id">Complaint CMP-{complaint.id}</h2>
            <HandlerStatusBadge status={complaint.status} />
          </div>
          <span className="hd-detail-meta">
            Raised on{' '}
            {complaint.create_at
              ? new Date(complaint.create_at).toLocaleString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                })
              : 'N/A'}
          </span>
        </div>
      </div>

      {/* 2 Column Details Layout */}
      <div className="hd-detail-grid">
        {/* Left Column: Customer, Complaint Text, AI Predictions */}
        <div className="hd-detail-left-col">
          {/* Customer Card */}
          <div className="hd-card hd-detail-section-card">
            <h3 className="hd-detail-section-title">
              <MessageCircle size={17} /> Customer Details
            </h3>
            <div className="hd-info-fields-grid">
              <div className="hd-info-field">
                <span className="hd-info-label">Customer Name</span>
                <span className="hd-info-value hd-font-bold">{complaint.user_name || 'Customer'}</span>
              </div>
              <div className="hd-info-field">
                <span className="hd-info-label">Customer Email</span>
                <span className="hd-info-value">{complaint.user_email || 'Not provided'}</span>
              </div>
              <div className="hd-info-field">
                <span className="hd-info-label">Customer ID</span>
                <span className="hd-info-value">#{complaint.user_id}</span>
              </div>
              <div className="hd-info-field">
                <span className="hd-info-label">Current Department</span>
                <span className="hd-info-value">{complaint.current_department || 'Returns & Replacement'}</span>
              </div>
            </div>
          </div>

          {/* Complaint Text */}
          <div className="hd-card hd-detail-section-card">
            <h3 className="hd-detail-section-title">
              <MessageCircle size={17} /> Complaint Message
            </h3>
            <div className="hd-reason-block">
              <p className="hd-reason-desc">{complaint.complaint_text || 'No text provided.'}</p>
            </div>
          </div>

          {/* Department Classification */}
          <div className="hd-card hd-detail-section-card">
            <h3 className="hd-detail-section-title">
              <Building2 size={17} /> Classification & Routing
            </h3>
            <div className="hd-info-fields-grid">
              <div className="hd-info-field">
                <span className="hd-info-label">Predicted Department</span>
                <span className="hd-info-value">{complaint.predicted_department || 'Returns & Replacement'}</span>
              </div>
              <div className="hd-info-field">
                <span className="hd-info-label">Model Confidence</span>
                <span className="hd-info-value">
                  {complaint.confidence ? `${Math.round(complaint.confidence * 100)}%` : 'Direct Assigned'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Actions (Update Status, Redirect) and Redirection History */}
        <div className="hd-detail-right-col">
          {/* Status Update Card */}
          <div className="hd-card hd-actions-card">
            <h3 className="hd-detail-section-title">Update Complaint Status</h3>
            <div className="hd-action-form">
              <label className="hd-form-label">Workflow Status</label>
              <select
                className="hd-select"
                value={newStatus}
                onChange={(e) => setNewStatus(e.target.value)}
              >
                <option value="pending">Pending</option>
                <option value="followed_up">In Progress (Followed Up)</option>
                <option value="resolved">Resolved</option>
              </select>

              <button
                type="button"
                className="hd-btn-approve"
                style={{ marginTop: '12px' }}
                disabled={updatingStatus}
                onClick={handleStatusUpdate}
              >
                <CheckCircle2 size={16} /> Save Status Update
              </button>
            </div>
          </div>

          {/* Department Redirection Card */}
          <div className="hd-card hd-actions-card">
            <h3 className="hd-detail-section-title">Redirect to Another Department</h3>
            <div className="hd-action-form">
              <label className="hd-form-label">Target Department</label>
              <select
                className="hd-select"
                value={targetDeptId}
                onChange={(e) => setTargetDeptId(e.target.value)}
              >
                <option value="">Select Department...</option>
                {departments
                  .filter((d) => d.name !== complaint.current_department)
                  .map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
              </select>

              <label className="hd-form-label" style={{ marginTop: '10px' }}>Redirection Reason</label>
              <input
                type="text"
                className="hd-search-input"
                style={{ border: '1px solid var(--hd-border-strong)', padding: '8px 12px', borderRadius: '8px', background: '#fff' }}
                placeholder="Reason for redirecting this complaint..."
                value={redirectReason}
                onChange={(e) => setRedirectReason(e.target.value)}
              />

              <button
                type="button"
                className="hd-btn-info"
                style={{ marginTop: '12px' }}
                disabled={redirecting || !targetDeptId}
                onClick={handleRedirect}
              >
                <Send size={16} /> Redirect Complaint
              </button>
            </div>
          </div>

          {/* Redirection History */}
          <div className="hd-card hd-detail-section-card">
            <h3 className="hd-detail-section-title">
              <History size={17} /> Redirection History
            </h3>
            {historyList && historyList.length > 0 ? (
              <div className="hd-timeline">
                {historyList.map((h, idx) => (
                  <div key={idx} className="hd-timeline-item">
                    <div className="hd-timeline-marker" />
                    <div className="hd-timeline-content">
                      <span className="hd-timeline-type">
                        {h.from_department_name} → {h.to_department_name}
                      </span>
                      <p className="hd-timeline-notes">{h.reason}</p>
                      <span className="hd-timeline-time">
                        {h.redirected_at ? new Date(h.redirected_at).toLocaleString() : ''}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="hd-empty-text">No prior redirections for this complaint.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default HandlerComplaintDetailView;

