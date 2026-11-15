import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { ComplaintStatusBadge } from '../complaints/ComplaintStatusBadge';
import { formatConfidence } from '../../utils/formatConfidence';
import { adminService } from '../../services/adminService';

export function ComplaintDetailsModal({ complaint, onClose }) {
  const [redirectionHistory, setRedirectionHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  useEffect(() => {
    if (complaint?.id) {
      setLoadingHistory(true);
      adminService
        .getComplaintRedirections(complaint.id)
        .then((data) => setRedirectionHistory(Array.isArray(data) ? data : []))
        .catch(() => setRedirectionHistory([]))
        .finally(() => setLoadingHistory(false));
    }
  }, [complaint?.id]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (!complaint) return null;

  const formatDate = (isoString) => {
    if (!isoString) return '—';
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    } catch {
      return isoString;
    }
  };

  const confidenceText = formatConfidence(complaint.confidence);

  return (
    <div
      className="ad-modal-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="complaint-modal-title"
    >
      <div
        className="ad-modal ad-complaint-modal"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="ad-complaint-modal-header">
          <div className="ad-complaint-modal-header-left">
            <span className="ad-complaint-modal-title" id="complaint-modal-title">
              Complaint Details
            </span>
            <span className="ad-complaint-modal-id">#{complaint.id}</span>
            <ComplaintStatusBadge status={complaint.status} />
          </div>
          <button
            type="button"
            className="ad-modal-close"
            onClick={onClose}
            aria-label="Close complaint details"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="ad-complaint-modal-body">
          {/* Section 1 — Complaint Information */}
          <div className="ad-modal-section">
            <div className="ad-modal-section-title">Complaint Information</div>
            <div className="ad-complaint-text-box">
              {complaint.complaint_text}
            </div>
            <div className="ad-modal-grid-3">
              <div className="ad-modal-field">
                <span className="ad-modal-field-label">Submitted On</span>
                <span className="ad-modal-field-value">{formatDate(complaint.create_at)}</span>
              </div>
              <div className="ad-modal-field">
                <span className="ad-modal-field-label">Status</span>
                <span className="ad-modal-field-value">
                  <ComplaintStatusBadge status={complaint.status} />
                </span>
              </div>
              {confidenceText && (
                <div className="ad-modal-field">
                  <span className="ad-modal-field-label">AI Confidence</span>
                  <span className="ad-modal-field-value" style={{ fontWeight: 600, color: '#3A6943' }}>
                    {confidenceText}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Section 2 — Customer Information */}
          <div className="ad-modal-section">
            <div className="ad-modal-section-title">Customer Information</div>
            <div className="ad-modal-grid-2">
              <div className="ad-modal-field">
                <span className="ad-modal-field-label">Customer Name</span>
                <span className="ad-modal-field-value" style={{ fontWeight: 600 }}>
                  {complaint.user_name || 'Customer'}
                </span>
              </div>
              <div className="ad-modal-field">
                <span className="ad-modal-field-label">Customer Email</span>
                <span className="ad-modal-field-value" style={{ color: '#5A6668' }}>
                  {complaint.user_email || 'Email unavailable'}
                </span>
              </div>
            </div>
          </div>

          {/* Section 3 — Department Information */}
          <div className="ad-modal-section">
            <div className="ad-modal-section-title">Department Information</div>
            <div className="ad-modal-grid-2">
              <div className="ad-modal-field">
                <span className="ad-modal-field-label">AI-Predicted Department</span>
                <span className="ad-modal-field-value" style={{ fontWeight: 600 }}>
                  {complaint.predicted_department || '—'}
                </span>
              </div>
              <div className="ad-modal-field">
                <span className="ad-modal-field-label">Current Assigned Department</span>
                <span className="ad-modal-field-value" style={{ fontWeight: 700, color: 'var(--fk-text-primary)' }}>
                  {complaint.current_department || '—'}
                </span>
              </div>
            </div>
          </div>

          {/* Section 4 — Redirection History */}
          <div className="ad-modal-section">
            <div className="ad-modal-section-title">Redirection History</div>
            {loadingHistory ? (
              <div style={{ fontSize: '13px', color: '#828F91', padding: '10px 0' }}>
                Loading redirection history...
              </div>
            ) : redirectionHistory.length === 0 ? (
              <div style={{ fontSize: '13px', color: '#828F91', fontStyle: 'italic', padding: '10px 0' }}>
                No redirection events for this complaint.
              </div>
            ) : (
              <div className="ad-modal-redirection-list">
                {redirectionHistory.map((item) => (
                  <div key={item.id} className="ad-modal-redirection-item">
                    <div className="ad-modal-redirection-route">
                      <span>{item.from_department}</span>
                      <span style={{ margin: '0 8px', color: '#828F91' }}>→</span>
                      <span>{item.to_department}</span>
                    </div>
                    <div className="ad-modal-redirection-meta">
                      <span
                        style={{
                          fontWeight: 600,
                          fontSize: '11.5px',
                          color: item.reason === 'model_fault' ? '#C05B4B' : '#4558A6',
                        }}
                      >
                        {item.reason === 'model_fault' ? 'Model fault' : 'Further processing'}
                      </span>
                      <span style={{ color: '#828F91', fontSize: '11.5px' }}>
                        {formatDate(item.created_at)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default ComplaintDetailsModal;
