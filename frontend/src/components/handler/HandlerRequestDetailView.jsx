import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  HelpCircle,
  FileText,
  User,
  ShoppingBag,
  Clock,
  ShieldAlert,
  ArrowLeftRight,
  X,
} from 'lucide-react';
import { handlerService } from '../../services/handlerService';
import { HandlerStatusBadge } from './HandlerStatusBadge';

export function HandlerRequestDetailView({ requestId, claimId: claimIdProp, onBack, onNavigate, onRefresh }) {
  // Support both prop names for compatibility
  const resolvedId = requestId || claimIdProp;
  const [claim, setClaim] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionNote, setActionNote] = useState('');
  const [submittingAction, setSubmittingAction] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);
  const [evidencePreviews, setEvidencePreviews] = useState({});
  const [evidenceLoading, setEvidenceLoading] = useState(false);
  const [selectedEvidence, setSelectedEvidence] = useState(null);
  const evidenceIds = (claim?.evidence || []).map((item) => item.id).join(',');

  useEffect(() => {
    let active = true;
    const objectUrls = [];
    const evidence = claim?.evidence || [];
    if (!evidence.length) {
      setEvidencePreviews({});
      return () => {};
    }
    setEvidenceLoading(true);
    setEvidencePreviews({});
    Promise.all(evidence.map(async (item) => {
      try {
        const blob = await handlerService.getReturnEvidenceBlob(resolvedId, item.id);
        const url = URL.createObjectURL(blob);
        objectUrls.push(url);
        return [item.id, url];
      } catch {
        return [item.id, null];
      }
    })).then((entries) => {
      if (active) setEvidencePreviews(Object.fromEntries(entries));
    }).finally(() => {
      if (active) setEvidenceLoading(false);
    });
    return () => {
      active = false;
      objectUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [resolvedId, evidenceIds]);

  useEffect(() => {
    if (!selectedEvidence) return undefined;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setSelectedEvidence(null);
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [selectedEvidence]);

  const handleBack = () => {
    if (onBack) onBack();
    else if (onNavigate) onNavigate('handler-dashboard', '/handler/requests');
  };

  const loadClaim = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await handlerService.getClaimDetails(resolvedId);
      setClaim(data);
    } catch (err) {
      console.error('Failed to load claim details:', err);
      setError(err.message || 'Failed to load return claim details.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (resolvedId) {
      loadClaim();
    }
  }, [resolvedId]);

  const handleDecision = async (decisionType) => {
    if (!actionNote.trim()) {
      alert('Please enter a note or reason for this decision.');
      return;
    }
    setSubmittingAction(true);
    try {
      if (decisionType === 'approved') {
        await handlerService.approveClaim(resolvedId, actionNote);
        setToastMessage({ type: 'success', text: 'Return claim approved successfully!' });
      } else if (decisionType === 'rejected') {
        await handlerService.rejectClaim(resolvedId, actionNote);
        setToastMessage({ type: 'success', text: 'Return claim rejected.' });
      } else if (decisionType === 'info') {
        await handlerService.requestInformation(resolvedId, actionNote);
        setToastMessage({ type: 'success', text: 'Information request sent to customer.' });
      }
      setActionNote('');
      await loadClaim();
      if (onRefresh) onRefresh();
    } catch (err) {
      console.error(`Failed to execute ${decisionType}:`, err);
      setToastMessage({ type: 'error', text: err.message || 'Operation failed.' });
    } finally {
      setSubmittingAction(false);
    }
  };

  if (loading) {
    return (
      <div className="hd-detail-loading">
        Loading claim details for TRN-{resolvedId}...
      </div>
    );
  }

  if (error || !claim) {
    return (
      <div className="hd-detail-error">
        <p>{error || 'Claim not found.'}</p>
        <button
          type="button"
          className="hd-back-link"
          onClick={handleBack}
        >
          <ArrowLeft size={16} /> Back to Requests
        </button>
      </div>
    );
  }

  const order = claim.order;
  const product = claim.product;

  return (
    <div className="hd-page hd-detail-page">
      {/* Back button and Header */}
      <div className="hd-detail-header-nav">
        <button
          type="button"
          className="hd-back-btn"
          onClick={handleBack}
        >
          <ArrowLeft size={16} />
          <span>Back to Requests</span>
        </button>
      </div>

      {toastMessage && (
        <div className={`hd-toast hd-toast-${toastMessage.type}`}>
          {toastMessage.text}
        </div>
      )}

      {/* Main Title & Status Row */}
      <div className="hd-detail-title-card">
        <div>
          <div className="hd-detail-id-row">
            <h2 className="hd-detail-id">Request TRN-{1000 + claim.id}</h2>
            <HandlerStatusBadge status={claim.workflow_status} />
          </div>
          <span className="hd-detail-meta">
            Submitted on{' '}
            {claim.requested_at
              ? new Date(claim.requested_at).toLocaleString('en-US', {
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
        {/* Left Column: Dossier, Product, Reason, Evidence */}
        <div className="hd-detail-left-col">
          {/* Customer & Order Card */}
          <div className="hd-card hd-detail-section-card">
            <h3 className="hd-detail-section-title">
              <ShoppingBag size={17} /> Order & Customer Information
            </h3>
            <div className="hd-info-fields-grid">
              <div className="hd-info-field">
                <span className="hd-info-label">Order Number</span>
                <span className="hd-info-value">{order?.order_number || 'N/A'}</span>
              </div>
              <div className="hd-info-field">
                <span className="hd-info-label">Order Status</span>
                <span className="hd-info-value hd-capitalize">{order?.status || 'N/A'}</span>
              </div>
              <div className="hd-info-field">
                <span className="hd-info-label">Customer ID</span>
                <span className="hd-info-value">{order?.user_id || 'Registered Customer'}</span>
              </div>
              <div className="hd-info-field">
                <span className="hd-info-label">Requested Resolution</span>
                <span className="hd-info-value hd-capitalize">{claim.resolution_type || 'Refund'}</span>
              </div>
            </div>
          </div>

          {/* Product Details Card */}
          <div className="hd-card hd-detail-section-card">
            <h3 className="hd-detail-section-title">
              <FileText size={17} /> Product Claimed
            </h3>
            <div className="hd-info-fields-grid">
              <div className="hd-info-field">
                <span className="hd-info-label">Product Name</span>
                <span className="hd-info-value hd-font-bold">{product?.product_name || 'Product'}</span>
              </div>
              <div className="hd-info-field">
                <span className="hd-info-label">Variant</span>
                <span className="hd-info-value">{product?.variant_name || 'Standard'}</span>
              </div>
              <div className="hd-info-field">
                <span className="hd-info-label">SKU</span>
                <span className="hd-info-value">{product?.sku || 'N/A'}</span>
              </div>
              <div className="hd-info-field">
                <span className="hd-info-label">Quantity Claimed</span>
                <span className="hd-info-value">{claim.quantity}</span>
              </div>
            </div>
          </div>

          {/* Stated Reason & Description Card */}
          <div className="hd-card hd-detail-section-card">
            <h3 className="hd-detail-section-title">
              <HelpCircle size={17} /> Claim Reason & Description
            </h3>
            <div className="hd-reason-block">
              <span className="hd-info-label">Reason Code</span>
              <p className="hd-reason-code">{claim.reason_code || claim.reason || 'Not specified'}</p>
            </div>
            <div className="hd-reason-block" style={{ marginTop: '12px' }}>
              <span className="hd-info-label">Customer Description</span>
              <p className="hd-reason-desc">{claim.description || claim.reason || 'No detailed note provided by customer.'}</p>
            </div>
          </div>

          {/* Customer Uploaded Evidence */}
          <div className="hd-card hd-detail-section-card">
            <h3 className="hd-detail-section-title">
              <ShieldAlert size={17} /> Attached Evidence Photos
            </h3>
            {claim.evidence && claim.evidence.length > 0 ? (
              <div className="hd-evidence-grid">
                {claim.evidence.map((ev) => (
                  <div key={ev.id} className="hd-evidence-item">
                    {evidencePreviews[ev.id] ? (
                      <button type="button" className="hd-evidence-preview-button"
                        onClick={() => setSelectedEvidence({ ...ev, url: evidencePreviews[ev.id] })}
                        aria-label={`View evidence image: ${ev.filename}`}>
                        <img className="hd-evidence-preview" src={evidencePreviews[ev.id]} alt={`Evidence: ${ev.filename}`} />
                      </button>
                    ) : (
                      <div className="hd-evidence-preview hd-evidence-unavailable" role="status">
                        {evidenceLoading ? 'Loading image…' : 'Image unavailable'}
                      </div>
                    )}
                    <div className="hd-evidence-info">
                      <span className="hd-evidence-filename">{ev.filename}</span>
                      <span className="hd-evidence-size">
                        {Math.round(ev.size_bytes / 1024)} KB • {ev.content_type}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="hd-empty-text">No photographic evidence attached to this claim.</p>
            )}
          </div>
        </div>

        {/* Right Column: Actions, Inspections, Handoffs, Audit Trail */}
        <div className="hd-detail-right-col">
          {/* Action Decision Form */}
          <div className="hd-card hd-actions-card">
            <h3 className="hd-detail-section-title">Department Decision & Actions</h3>
            <p className="hd-card-desc">
              Review claim documentation and record an authorized return workflow decision.
            </p>

            <div className="hd-action-form">
              <label className="hd-form-label">Decision Note / Justification</label>
              <textarea
                className="hd-textarea"
                rows={3}
                placeholder="Enter mandatory decision notes or requests for information..."
                value={actionNote}
                onChange={(e) => setActionNote(e.target.value)}
              />

              <div className="hd-action-btn-row">
                <button
                  type="button"
                  className="hd-btn-approve"
                  disabled={submittingAction}
                  onClick={() => handleDecision('approved')}
                >
                  <CheckCircle2 size={16} /> Approve
                </button>
                <button
                  type="button"
                  className="hd-btn-reject"
                  disabled={submittingAction}
                  onClick={() => handleDecision('rejected')}
                >
                  <XCircle size={16} /> Reject
                </button>
                <button
                  type="button"
                  className="hd-btn-info"
                  disabled={submittingAction}
                  onClick={() => handleDecision('info')}
                >
                  <HelpCircle size={16} /> Request Info
                </button>
              </div>
            </div>
          </div>

          {/* Approval & Department Routing */}
          <div className="hd-card hd-detail-section-card">
            <h3 className="hd-detail-section-title">
              <ArrowLeftRight size={17} /> Approval &amp; Department Routing
            </h3>
            {claim.workflow_status === 'approved' && (
              <div className="hd-info-fields-grid hd-routing-approval-summary">
                <div className="hd-info-field"><span className="hd-info-label">Decision</span><HandlerStatusBadge status="approved" /></div>
                <div className="hd-info-field"><span className="hd-info-label">Approved At</span><span className="hd-info-value">{claim.decided_at ? new Date(claim.decided_at).toLocaleString() : 'Timestamp unavailable'}</span></div>
                <div className="hd-info-field"><span className="hd-info-label">Decision Note</span><span className="hd-info-value">{claim.decision_note || 'No decision note recorded.'}</span></div>
              </div>
            )}
            {claim.handoff_history && claim.handoff_history.length > 0 ? (
              <div className="hd-timeline">
                {claim.handoff_history.map((h) => (
                  <div key={h.id} className="hd-timeline-item">
                    <div className="hd-timeline-marker" />
                    <div className="hd-timeline-content">
                      <span className="hd-timeline-type hd-capitalize">{h.source_department || 'Department'} → {h.destination_department || 'Department'} · {h.type?.replace(/_/g, ' ')}</span>
                      <HandlerStatusBadge status={h.status} />
                      <span className="hd-timeline-time">
                        {h.created_at ? new Date(h.created_at).toLocaleString() : ''}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="hd-empty-text">No downstream department handoffs initiated yet.</p>
            )}
          </div>

          {/* Inspection History */}
          <div className="hd-card hd-detail-section-card">
            <h3 className="hd-detail-section-title">
              <Clock size={17} /> Inspection History
            </h3>
            {claim.inspection_history && claim.inspection_history.length > 0 ? (
              <div className="hd-timeline">
                {claim.inspection_history.map((ins) => (
                  <div key={ins.id} className="hd-timeline-item">
                    <div className="hd-timeline-marker" />
                    <div className="hd-timeline-content">
                      <span className="hd-timeline-type hd-capitalize">{ins.type?.replace('_', ' ')}: {ins.outcome}</span>
                      <p className="hd-timeline-notes">{ins.notes}</p>
                      <span className="hd-timeline-time">
                        {ins.inspected_at ? new Date(ins.inspected_at).toLocaleString() : ''}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="hd-empty-text">No physical inspections recorded yet.</p>
            )}
          </div>

          {/* Audit Trail */}
          <div className="hd-card hd-detail-section-card">
            <h3 className="hd-detail-section-title">
              <FileText size={17} /> Audit Trail
            </h3>
            {claim.audit_history && claim.audit_history.length > 0 ? (
              <div className="hd-timeline">
                {claim.audit_history.map((ev) => (
                  <div key={ev.id} className="hd-timeline-item">
                    <div className="hd-timeline-marker" />
                    <div className="hd-timeline-content">
                      <span className="hd-timeline-type">{ev.type?.replace(/_/g, ' ').toUpperCase()}</span>
                      {(ev.previous_status || ev.new_status) && (
                        <p className="hd-timeline-notes">{ev.previous_status ? `${ev.previous_status} → ` : ''}{ev.new_status || ''}</p>
                      )}
                      {ev.note && <p className="hd-timeline-notes">{ev.note}</p>}
                      <span className="hd-timeline-time">{ev.actor_name || (ev.actor_user_id ? `User ${ev.actor_user_id}` : 'System')}</span>
                      <span className="hd-timeline-time">
                        {ev.created_at ? new Date(ev.created_at).toLocaleString() : ''}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="hd-empty-text">No audit history available.</p>
            )}
          </div>
        </div>
      </div>
      {selectedEvidence && (
        <div className="hd-evidence-lightbox" role="presentation"
          onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedEvidence(null); }}>
          <section className="hd-evidence-lightbox-panel" role="dialog" aria-modal="true"
            aria-label={`Evidence image: ${selectedEvidence.filename}`}>
            <button type="button" className="hd-evidence-lightbox-close" aria-label="Close image preview"
              onClick={() => setSelectedEvidence(null)}>
              <X size={22} />
            </button>
            <h3 className="hd-evidence-lightbox-title">{selectedEvidence.filename}</h3>
            <div className="hd-evidence-lightbox-image-wrap">
              <img className="hd-evidence-lightbox-image" src={selectedEvidence.url}
                alt={`Evidence: ${selectedEvidence.filename}`} />
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

export default HandlerRequestDetailView;

