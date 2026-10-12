import React from 'react';
import { formatConfidence } from '../../utils/formatConfidence';
import { X, Calendar, Building2, Sparkles, FileText, CheckCircle2 } from 'lucide-react';
import { ComplaintStatusBadge } from './ComplaintStatusBadge';

export function ComplaintDetailsModal({ complaint, onClose }) {
  if (!complaint) return null;

  const formatDate = (dateStr) => {
    if (!dateStr) return 'N/A';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  };

  const formattedId = `CMP-${new Date(complaint.create_at || Date.now()).getFullYear()}-${String(complaint.id).padStart(5, '0')}`;

  return (
    <div
      className="fk-complaint-modal-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="details-modal-title"
    >
      <div
        className="fk-complaint-details-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="fk-complaint-details-header">
          <div>
            <div className="fk-complaint-details-sub">Complaint Reference</div>
            <h3 id="details-modal-title" className="fk-complaint-details-title">
              {formattedId}
            </h3>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <ComplaintStatusBadge status={complaint.status} />
            <button
              className="fk-complaint-modal-close"
              onClick={onClose}
              aria-label="Close details"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="fk-complaint-details-body">
          {/* Metadata Grid */}
          <div className="fk-complaint-meta-grid">
            <div className="fk-complaint-meta-item">
              <div className="fk-meta-label">
                <Building2 size={14} color="var(--fk-olive)" />
                <span>Current Department</span>
              </div>
              <div className="fk-meta-val">
                {complaint.current_department || complaint.predicted_department || 'Unassigned'}
              </div>
            </div>

            <div className="fk-complaint-meta-item">
              <div className="fk-meta-label">
                <Calendar size={14} color="var(--fk-olive)" />
                <span>Submitted On</span>
              </div>
              <div className="fk-meta-val">{formatDate(complaint.create_at)}</div>
            </div>

            {complaint.predicted_department && (
              <div className="fk-complaint-meta-item">
                <div className="fk-meta-label">
                  <Sparkles size={14} color="var(--fk-gold)" />
                  <span>AI Predicted Route</span>
                </div>
                <div className="fk-meta-val">{complaint.predicted_department}</div>
              </div>
            )}

            {complaint.confidence !== null && complaint.confidence !== undefined && complaint.confidence !== '' && (
              <div className="fk-complaint-meta-item">
                <div className="fk-meta-label">
                  <Sparkles size={14} color="var(--fk-gold)" />
                  <span>Routing Confidence</span>
                </div>
                <div className="fk-meta-val">
                  {formatConfidence(complaint.confidence) || 'Confidence unavailable'}
                </div>
              </div>
            )}
          </div>

          {/* Issue Description */}
          <div className="fk-complaint-issue-section">
            <div className="fk-meta-label" style={{ marginBottom: '8px' }}>
              <FileText size={15} color="var(--fk-text-primary)" />
              <span style={{ fontWeight: '700' }}>Issue Description</span>
            </div>
            <div className="fk-complaint-issue-content">
              {complaint.complaint_text}
            </div>
          </div>

          {/* Status Tracker Info */}
          <div className="fk-complaint-tracker-info">
            <CheckCircle2 size={16} color="var(--fk-olive)" />
            <span>
              Our customer resolution team is actively managing this ticket. You will receive updates via email.
            </span>
          </div>

          {/* Action Row */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
            <button
              className="fk-complaint-close-btn"
              onClick={onClose}
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ComplaintDetailsModal;
