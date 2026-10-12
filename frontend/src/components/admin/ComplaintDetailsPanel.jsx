import React, { useState, useEffect } from 'react';
import { adminService } from '../../services/adminService';
import { ComplaintStatusBadge } from '../complaints/ComplaintStatusBadge';

export function ComplaintDetailsPanel({ complaint, onClose }) {
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

  return (
    <div className="ad-details-panel">
      <div className="ad-details-panel-header">
        <div>
          <div className="ad-details-panel-title">Complaint Details</div>
          <div style={{ fontSize: '11px', color: '#909B9D', fontWeight: '700', textTransform: 'uppercase' }}>
            Read-Only Admin View
          </div>
        </div>
        {onClose && (
          <button className="ad-btn-reset" style={{ height: '30px', padding: '0 10px' }} onClick={onClose}>
            Close
          </button>
        )}
      </div>

      <div className="ad-details-panel-body">
        <div className="ad-detail-item">
          <span className="ad-detail-label">Complaint ID</span>
          <span className="ad-detail-value" style={{ fontFamily: 'monospace', fontWeight: '700' }}>
            #{complaint.id}
          </span>
        </div>

        <div className="ad-detail-item">
          <span className="ad-detail-label">Complaint Text</span>
          <div className="ad-detail-box">{complaint.complaint_text}</div>
        </div>

        <div className="ad-detail-item">
          <span className="ad-detail-label">Customer</span>
          <span className="ad-detail-value">
            <strong>{complaint.user_name || 'Registered Customer'}</strong>
            <div style={{ fontSize: '12px', color: '#637073' }}>
              {complaint.user_email || `User #${complaint.user_id}`}
            </div>
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          <div className="ad-detail-item">
            <span className="ad-detail-label">AI-Predicted Dept</span>
            <span className="ad-detail-value" style={{ fontWeight: '600' }}>
              {complaint.predicted_department || '—'}
            </span>
          </div>
          <div className="ad-detail-item">
            <span className="ad-detail-label">Current Dept</span>
            <span className="ad-detail-value" style={{ fontWeight: '700' }}>
              {complaint.current_department || '—'}
            </span>
          </div>
        </div>

        <div className="ad-detail-item">
          <span className="ad-detail-label">Status & Confidence</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '2px' }}>
            <ComplaintStatusBadge status={complaint.status} />
            <span style={{ fontSize: '12px', color: '#637073' }}>
              {complaint.confidence ? `${complaint.confidence} confidence` : 'No confidence score'}
            </span>
          </div>
        </div>

        <div className="ad-detail-item">
          <span className="ad-detail-label">Submitted On</span>
          <span className="ad-detail-value">{formatDate(complaint.create_at)}</span>
        </div>

        <div className="ad-detail-item">
          <span className="ad-detail-label">Redirection History</span>
          {loadingHistory ? (
            <div style={{ fontSize: '12px', color: '#909B9D', padding: '6px 0' }}>Loading audit trail...</div>
          ) : redirectionHistory.length === 0 ? (
            <div style={{ fontSize: '12px', color: '#909B9D', fontStyle: 'italic', padding: '6px 0' }}>
              No redirection events for this complaint.
            </div>
          ) : (
            <div className="ad-audit-trail">
              {redirectionHistory.map((item) => (
                <div key={item.id} className="ad-audit-item">
                  <div>
                    <strong>{item.from_department}</strong> → <strong>{item.to_department}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '2px' }}>
                    <span style={{ color: item.reason === 'model_fault' ? '#C05B4B' : '#4558A6' }}>
                      {item.reason === 'model_fault' ? 'Model fault' : 'Further processing'}
                    </span>
                    <span style={{ color: '#909B9D' }}>{formatDate(item.created_at)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default ComplaintDetailsPanel;
