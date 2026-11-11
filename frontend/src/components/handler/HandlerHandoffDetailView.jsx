import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  ArrowLeftRight,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Building2,
  User,
} from 'lucide-react';
import { handlerService } from '../../services/handlerService';
import { HandlerStatusBadge } from './HandlerStatusBadge';

export function HandlerHandoffDetailView({ handoffId, onBack, onNavigate, onRefresh }) {
  const handleBack = () => {
    if (onBack) onBack();
    else if (onNavigate) onNavigate('handler-dashboard', '/handler/tracking');
  };
  const [handoff, setHandoff] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [newStatus, setNewStatus] = useState('');
  const [statusNote, setStatusNote] = useState('');
  const [updating, setUpdating] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);

  const loadHandoff = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await handlerService.getHandoffDetails(handoffId);
      setHandoff(data);
      setNewStatus(data.status || 'pending');
    } catch (err) {
      console.error('Failed to load handoff details:', err);
      setError(err.message || 'Failed to load handoff details.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (handoffId) {
      loadHandoff();
    }
  }, [handoffId]);

  const handleUpdateStatus = async () => {
    if (!newStatus || newStatus === handoff.status) {
      alert('Please select a different next status.');
      return;
    }
    setUpdating(true);
    try {
      await handlerService.updateHandoffStatus(handoffId, newStatus, statusNote);
      setToastMessage({ type: 'success', text: `Handoff status transitioned to ${newStatus}.` });
      setStatusNote('');
      await loadHandoff();
    } catch (err) {
      console.error('Failed to update handoff status:', err);
      setToastMessage({ type: 'error', text: err.message || 'Transition failed. Check authorization.' });
    } finally {
      setUpdating(false);
    }
  };

  if (loading) {
    return (
      <div className="hd-detail-loading">
        Loading handoff #{handoffId}...
      </div>
    );
  }

  if (error || !handoff) {
    return (
      <div className="hd-detail-error">
        <p>{error || 'Handoff not found.'}</p>
        <button
          type="button"
          className="hd-back-link"
          onClick={handleBack}
        >
          <ArrowLeft size={16} /> Back to Tracking & Handoffs
        </button>
      </div>
    );
  }

  // Allowed transitions
  const allowedTransitions = {
    pending: ['accepted', 'failed'],
    accepted: ['in_progress', 'failed'],
    in_progress: ['completed', 'failed'],
  }[handoff.status] || [];

  return (
    <div className="hd-page hd-detail-page">
      <div className="hd-detail-header-nav">
        <button
          type="button"
          className="hd-back-btn"
          onClick={handleBack}
        >
          <ArrowLeft size={16} />
          <span>Back to Tracking & Handoffs</span>
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
            <h2 className="hd-detail-id">Handoff #{handoff.id} ({handoff.request_id})</h2>
            <HandlerStatusBadge status={handoff.status} />
          </div>
          <span className="hd-detail-meta">
            Associated with {handoff.order_number} • Last updated{' '}
            {handoff.last_updated
              ? new Date(handoff.last_updated).toLocaleString('en-US', {
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

      <div className="hd-detail-grid">
        {/* Left Column: Route, Customer, Order, Timestamps */}
        <div className="hd-detail-left-col">
          <div className="hd-card hd-detail-section-card">
            <h3 className="hd-detail-section-title">
              <ArrowLeftRight size={17} /> Handoff Route
            </h3>
            <div className="hd-info-fields-grid">
              <div className="hd-info-field">
                <span className="hd-info-label">Source Department</span>
                <span className="hd-info-value hd-font-bold">{handoff.handoff_from}</span>
              </div>
              <div className="hd-info-field">
                <span className="hd-info-label">Destination Department</span>
                <span className="hd-info-value hd-font-bold">{handoff.current_owner}</span>
              </div>
              <div className="hd-info-field">
                <span className="hd-info-label">Handoff Type</span>
                <span className="hd-info-value hd-capitalize">{handoff.handoff_type?.replace(/_/g, ' ')}</span>
              </div>
              <div className="hd-info-field">
                <span className="hd-info-label">Customer</span>
                <span className="hd-info-value">{handoff.customer_name}</span>
              </div>
            </div>
          </div>

          <div className="hd-card hd-detail-section-card">
            <h3 className="hd-detail-section-title">
              <Clock size={17} /> Lifecycle Timestamps
            </h3>
            <div className="hd-info-fields-grid">
              <div className="hd-info-field">
                <span className="hd-info-label">Created At</span>
                <span className="hd-info-value">{handoff.created_at ? new Date(handoff.created_at).toLocaleString() : 'N/A'}</span>
              </div>
              <div className="hd-info-field">
                <span className="hd-info-label">Last Updated</span>
                <span className="hd-info-value">{handoff.last_updated ? new Date(handoff.last_updated).toLocaleString() : 'N/A'}</span>
              </div>
              <div className="hd-info-field">
                <span className="hd-info-label">Completed At</span>
                <span className="hd-info-value">{handoff.completed_at ? new Date(handoff.completed_at).toLocaleString() : 'Pending completion'}</span>
              </div>
            </div>
            {handoff.failure_reason && (
              <div className="hd-failure-alert" style={{ marginTop: '14px', padding: '10px 14px', background: '#FEE2E2', borderRadius: '8px', color: '#991B1B' }}>
                <span className="hd-font-bold">Failure Reason:</span> {handoff.failure_reason}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Actions (Status Transition) */}
        <div className="hd-detail-right-col">
          <div className="hd-card hd-actions-card">
            <h3 className="hd-detail-section-title">Transition Handoff Status</h3>
            <p className="hd-card-desc">
              Allowed status transitions are restricted by department authority.
            </p>

            {allowedTransitions.length > 0 ? (
              <div className="hd-action-form">
                <label className="hd-form-label">Next Permitted Status</label>
                <select
                  className="hd-select"
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value)}
                >
                  <option value={handoff.status}>Select transition...</option>
                  {allowedTransitions.map((st) => (
                    <option key={st} value={st}>
                      {st.replace(/_/g, ' ').toUpperCase()}
                    </option>
                  ))}
                </select>

                <label className="hd-form-label" style={{ marginTop: '10px' }}>Transition Note</label>
                <textarea
                  className="hd-textarea"
                  rows={2}
                  placeholder="Mandatory transition notes..."
                  value={statusNote}
                  onChange={(e) => setStatusNote(e.target.value)}
                />

                <button
                  type="button"
                  className="hd-btn-approve"
                  style={{ marginTop: '12px' }}
                  disabled={updating || !newStatus || newStatus === handoff.status}
                  onClick={handleUpdateStatus}
                >
                  <CheckCircle2 size={16} /> Save Status Transition
                </button>
              </div>
            ) : (
              <p className="hd-empty-text">
                This handoff is currently in <strong>{handoff.status}</strong> state with no further transitions available.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default HandlerHandoffDetailView;

