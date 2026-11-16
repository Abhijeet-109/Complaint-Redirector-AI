import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  HelpCircle,
  FileText,
  Clock,
  ArrowLeftRight,
  X,
  Truck,
  CreditCard,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  Check,
  AlertCircle,
  Calendar,
} from 'lucide-react';
import { handlerService } from '../../services/handlerService';
import { HandlerStatusBadge } from './HandlerStatusBadge';

export function HandlerRequestDetailView({ requestId, claimId: claimIdProp, onBack, onNavigate, onRefresh }) {
  const rawId = requestId || claimIdProp;
  const displayIdMatch = String(rawId ?? '').match(/^trn-(\d+)$/i);
  const resolvedId = displayIdMatch ? displayIdMatch[1] : rawId;
  const [claim, setClaim] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionNote, setActionNote] = useState('');
  const [refundTiming, setRefundTiming] = useState('');
  const [submittingAction, setSubmittingAction] = useState(false);
  const [resolvingClaim, setResolvingClaim] = useState(false);
  const [resolveNote, setResolveNote] = useState('');
  const [showResolveModal, setShowResolveModal] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);
  const [evidencePreviews, setEvidencePreviews] = useState({});
  const [evidenceLoading, setEvidenceLoading] = useState(false);
  const [selectedEvidence, setSelectedEvidence] = useState(null);
  const [showDetailedAudit, setShowDetailedAudit] = useState(false);

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
    Promise.all(
      evidence.map(async (item) => {
        try {
          const blob = await handlerService.getReturnEvidenceBlob(resolvedId, item.id);
          const url = URL.createObjectURL(blob);
          objectUrls.push(url);
          return [item.id, url];
        } catch {
          return [item.id, null];
        }
      })
    ).then((entries) => {
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

  const handleRetryEvidence = async (evidenceId) => {
    try {
      const blob = await handlerService.getReturnEvidenceBlob(resolvedId, evidenceId);
      const url = URL.createObjectURL(blob);
      setEvidencePreviews((prev) => ({ ...prev, [evidenceId]: url }));
    } catch (err) {
      console.warn('Evidence retry failed:', err);
    }
  };

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
      alert('Please enter a decision note or justification.');
      return;
    }
    if (decisionType === 'approved' && claim?.resolution_type === 'refund' && !refundTiming) {
      alert('Please select a refund timing option (Refund before collection or Refund after collection).');
      return;
    }
    setSubmittingAction(true);
    try {
      if (decisionType === 'approved') {
        await handlerService.approveClaim(resolvedId, actionNote, refundTiming || null);
        setToastMessage({ type: 'success', text: 'Return claim approved successfully!' });
      } else if (decisionType === 'rejected') {
        await handlerService.rejectClaim(resolvedId, actionNote);
        setToastMessage({ type: 'success', text: 'Return claim rejected.' });
      } else if (decisionType === 'info') {
        await handlerService.requestInformation(resolvedId, actionNote);
        setToastMessage({ type: 'success', text: 'Information request sent to customer.' });
      }
      setActionNote('');
      setRefundTiming('');
      await loadClaim();
      if (onRefresh) onRefresh();
    } catch (err) {
      console.error(`Failed to execute ${decisionType}:`, err);
      setToastMessage({ type: 'error', text: err.message || 'Operation failed.' });
    } finally {
      setSubmittingAction(false);
    }
  };

  const handleResolveClaim = async () => {
    setResolvingClaim(true);
    try {
      await handlerService.resolveReturnClaim(resolvedId, resolveNote);
      setToastMessage({ type: 'success', text: 'Return claim successfully resolved and completed!' });
      setShowResolveModal(false);
      setResolveNote('');
      await loadClaim();
      if (onRefresh) onRefresh();
    } catch (err) {
      console.error('Failed to resolve claim:', err);
      setToastMessage({ type: 'error', text: err.message || 'Failed to resolve claim.' });
    } finally {
      setResolvingClaim(false);
    }
  };

  if (loading) {
    return (
      <div className="hd-detail-loading" style={{ padding: 40, textAlign: 'center', color: '#666' }}>
        Loading claim details for TRN-{resolvedId}...
      </div>
    );
  }

  if (error || !claim) {
    return (
      <div className="hd-detail-error" style={{ padding: 40, textAlign: 'center' }}>
        <p style={{ color: '#DC2626', fontWeight: 600 }}>{error || 'Claim not found.'}</p>
        <button
          type="button"
          className="hd-back-link"
          onClick={handleBack}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 16, cursor: 'pointer', background: 'none', border: 'none', color: '#0F3024', fontWeight: 600 }}
        >
          <ArrowLeft size={16} /> Back to Requests
        </button>
      </div>
    );
  }

  const isPendingReview = ['submitted', 'under_review', 'information_requested'].includes(claim.workflow_status);
  const isApproved = claim.workflow_status === 'approved';
  const isTerminal = ['approved', 'rejected', 'completed', 'resolved', 'cancelled'].includes(claim.workflow_status);

  // Check downstream progress
  const orderDeliveryHandoff = (claim.handoff_history || []).find((h) =>
    ['refund_pickup', 'replacement_fulfillment'].includes(h.type)
  );
  const paymentsHandoff = (claim.handoff_history || []).find((h) =>
    h.type === 'refund_processing'
  );

  const isOrderDeliveryDone = orderDeliveryHandoff?.status === 'completed';
  const isPaymentsDone = claim.resolution_type === 'replacement' || paymentsHandoff?.status === 'completed';
  const canResolve = isApproved && isOrderDeliveryDone && isPaymentsDone;

  // Build humanized primary milestones for workflow timeline
  const milestones = [];

  // Milestone 1: Request Submitted
  milestones.push({
    id: 'submitted',
    title: 'Return Request Submitted',
    status: 'completed',
    date: claim.requested_at,
    actor: 'Customer',
    note: claim.description ? `Reason: ${claim.reason || claim.reason_code} - "${claim.description}"` : `Reason: ${claim.reason || claim.reason_code}`,
  });

  // Milestone 2: Returns & Replacement Decision
  if (isApproved) {
    milestones.push({
      id: 'decision',
      title: 'Department Approved',
      status: 'completed',
      date: claim.decided_at,
      actor: 'Returns & Replacement',
      note: claim.decision_note ? `Note: ${claim.decision_note}` : 'Claim approved for processing',
      extra: claim.resolution_type === 'refund' && claim.refund_timing
        ? `Refund Timing: ${claim.refund_timing === 'immediate' ? 'Refund before collection' : 'Refund after collection'}`
        : null,
    });
  } else if (claim.workflow_status === 'rejected') {
    milestones.push({
      id: 'decision',
      title: 'Claim Rejected',
      status: 'failed',
      date: claim.decided_at,
      actor: 'Returns & Replacement',
      note: claim.decision_note ? `Reason: ${claim.decision_note}` : 'Claim rejected after review',
    });
  } else {
    milestones.push({
      id: 'decision',
      title: 'Department Review',
      status: 'in_progress',
      date: null,
      actor: 'Returns & Replacement',
      note: 'Pending verification and authorization',
    });
  }

  // Milestone 3: Order & Delivery (Pickup or Replacement delivery)
  if (isApproved) {
    const isPickup = claim.resolution_type !== 'replacement';
    const label = isPickup ? 'Item Pickup & Inspection' : 'Replacement Delivery';
    if (isOrderDeliveryDone) {
      milestones.push({
        id: 'delivery',
        title: `${label} Completed`,
        status: 'completed',
        date: orderDeliveryHandoff?.completed_at || orderDeliveryHandoff?.updated_at,
        actor: 'Order & Delivery',
        note: isPickup ? 'Returned item collected from customer' : 'Replacement item delivered',
      });
    } else if (orderDeliveryHandoff) {
      milestones.push({
        id: 'delivery',
        title: `${label} In Progress`,
        status: 'in_progress',
        date: orderDeliveryHandoff?.created_at,
        actor: 'Order & Delivery',
        note: `Status: ${orderDeliveryHandoff.status?.replace('_', ' ')}`,
      });
    } else {
      milestones.push({
        id: 'delivery',
        title: `${label} Scheduled`,
        status: 'pending',
        date: null,
        actor: 'Order & Delivery',
        note: 'Handoff queued for logistics routing',
      });
    }
  }

  // Milestone 4: Payment Refund (Refunds only)
  if (isApproved && claim.resolution_type === 'refund') {
    if (paymentsHandoff?.status === 'completed') {
      milestones.push({
        id: 'payments',
        title: 'Refund Processed',
        status: 'completed',
        date: paymentsHandoff?.completed_at || paymentsHandoff?.updated_at,
        actor: 'Payments & Refunds',
        note: 'Payment reversed / customer credit issued',
      });
    } else if (paymentsHandoff) {
      milestones.push({
        id: 'payments',
        title: 'Refund In Progress',
        status: 'in_progress',
        date: paymentsHandoff?.created_at,
        actor: 'Payments & Refunds',
        note: `Handoff status: ${paymentsHandoff.status?.replace('_', ' ')}`,
      });
    } else if (claim.refund_timing === 'after_collection' && !isOrderDeliveryDone) {
      milestones.push({
        id: 'payments',
        title: 'Refund Pending Pickup',
        status: 'pending',
        date: null,
        actor: 'Payments & Refunds',
        note: 'Scheduled to initiate once item pickup is confirmed',
      });
    } else {
      milestones.push({
        id: 'payments',
        title: 'Refund Pending Initiation',
        status: 'pending',
        date: null,
        actor: 'Payments & Refunds',
        note: 'Queued for payments department processing',
      });
    }
  }

  // Milestone 5: Claim Resolution
  if (claim.workflow_status === 'resolved' || claim.status === 'completed') {
    milestones.push({
      id: 'resolved',
      title: 'Claim Resolved & Closed',
      status: 'completed',
      date: claim.updated_at,
      actor: 'Returns & Replacement',
      note: 'All fulfillment and payment actions completed successfully',
    });
  }

  return (
    <div className="hd-detail-container" style={{ padding: '24px 32px', maxWidth: 1400, margin: '0 auto' }}>
      {/* Toast Alert */}
      {toastMessage && (
        <div
          style={{
            marginBottom: 20,
            padding: '12px 18px',
            borderRadius: 8,
            backgroundColor: toastMessage.type === 'error' ? '#FEE2E2' : '#D1FAE5',
            color: toastMessage.type === 'error' ? '#B91C1C' : '#065F46',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: 14,
            fontWeight: 500,
            boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
          }}
        >
          <span>{toastMessage.text}</span>
          <button
            type="button"
            onClick={() => setToastMessage(null)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontWeight: 'bold' }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Header Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 24,
          paddingBottom: 16,
          borderBottom: '1px solid #E5E7EB',
        }}
      >
        <div>
          <button
            type="button"
            onClick={handleBack}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              background: 'none',
              border: 'none',
              color: '#4B5563',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              marginBottom: 8,
            }}
          >
            <ArrowLeft size={16} /> Back to Claims List
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, color: '#111827' }}>
              Claim TRN-{claim.id}
            </h1>
            <HandlerStatusBadge status={claim.workflow_status} />
            <span
              style={{
                fontSize: 12,
                fontWeight: 600,
                textTransform: 'uppercase',
                padding: '3px 10px',
                borderRadius: 12,
                background: claim.resolution_type === 'refund' ? '#EFF6FF' : '#F3E8FF',
                color: claim.resolution_type === 'refund' ? '#1D4ED8' : '#7E22CE',
              }}
            >
              {claim.resolution_type === 'refund' ? 'Refund Claim' : 'Replacement Claim'}
            </span>
          </div>
          <p style={{ margin: '4px 0 0 0', fontSize: 13, color: '#6B7280' }}>
            Order #{claim.order?.order_number || 'N/A'} • Submitted {claim.requested_at ? new Date(claim.requested_at).toLocaleString() : 'N/A'}
          </p>
        </div>

        <button
          type="button"
          onClick={loadClaim}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            background: '#F3F4F6',
            border: '1px solid #D1D5DB',
            borderRadius: 6,
            padding: '8px 14px',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
            color: '#374151',
          }}
        >
          <RotateCcw size={14} /> Refresh
        </button>
      </div>

      {/* Main 2-Column Content */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1.1fr)', gap: 24, alignItems: 'start' }}>
        {/* Left Column: Claim Documentation & Context */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Claim & Product Summary Card */}
          <div className="hd-card" style={{ background: '#FFF', borderRadius: 8, border: '1px solid #E5E7EB', padding: 20 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 16px 0', color: '#111827', display: 'flex', alignItems: 'center', gap: 8 }}>
              <FileText size={18} color="#0F3024" /> Claimed Item Details
            </h3>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14, marginBottom: 16 }}>
              <div>
                <span style={{ fontSize: 12, color: '#6B7280', display: 'block', fontWeight: 500 }}>Product Name</span>
                <span style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>{claim.product?.product_name || 'Item'}</span>
              </div>
              <div>
                <span style={{ fontSize: 12, color: '#6B7280', display: 'block', fontWeight: 500 }}>Variant / SKU</span>
                <span style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>
                  {claim.product?.variant_name ? `${claim.product.variant_name} (${claim.product.sku || 'N/A'})` : claim.product?.sku || 'N/A'}
                </span>
              </div>
              <div>
                <span style={{ fontSize: 12, color: '#6B7280', display: 'block', fontWeight: 500 }}>Quantity</span>
                <span style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>{claim.quantity || 1}</span>
              </div>
              <div>
                <span style={{ fontSize: 12, color: '#6B7280', display: 'block', fontWeight: 500 }}>Unit Price</span>
                <span style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>
                  {claim.product?.unit_price ? `₹${parseFloat(claim.product.unit_price).toFixed(2)}` : 'N/A'}
                </span>
              </div>
            </div>

            <div style={{ borderTop: '1px solid #F3F4F6', paddingTop: 14 }}>
              <span style={{ fontSize: 12, color: '#6B7280', display: 'block', fontWeight: 500 }}>Return Reason</span>
              <span style={{ fontSize: 14, fontWeight: 600, color: '#B45309' }}>
                {claim.reason || claim.reason_code || 'Unspecified'}
              </span>
              {claim.description && (
                <div style={{ marginTop: 8, padding: 12, background: '#F9FAFB', borderRadius: 6, border: '1px solid #E5E7EB', fontSize: 13, color: '#374151' }}>
                  <span style={{ fontWeight: 600, display: 'block', marginBottom: 2 }}>Customer Statement:</span>
                  {claim.description}
                </div>
              )}
            </div>
          </div>

          {/* Photographic Evidence Card */}
          <div className="hd-card" style={{ background: '#FFF', borderRadius: 8, border: '1px solid #E5E7EB', padding: 20 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 16px 0', color: '#111827', display: 'flex', alignItems: 'center', gap: 8 }}>
              Photographic Evidence ({claim.evidence?.length || 0})
            </h3>
            {claim.evidence && claim.evidence.length > 0 ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 14 }}>
                {claim.evidence.map((ev) => (
                  <div
                    key={ev.id}
                    style={{
                      border: '1px solid #E5E7EB',
                      borderRadius: 6,
                      overflow: 'hidden',
                      background: '#F9FAFB',
                      display: 'flex',
                      flexDirection: 'column',
                    }}
                  >
                    {evidencePreviews[ev.id] ? (
                      <div
                        style={{ height: 110, cursor: 'pointer', overflow: 'hidden' }}
                        onClick={() => setSelectedEvidence({ id: ev.id, url: evidencePreviews[ev.id], filename: ev.filename })}
                      >
                        <img
                          src={evidencePreviews[ev.id]}
                          alt={ev.filename || 'Evidence'}
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                      </div>
                    ) : (
                      <div
                        style={{
                          height: 110,
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          justifyContent: 'center',
                          padding: 8,
                          textAlign: 'center',
                        }}
                      >
                        <span style={{ fontSize: 11, color: '#B45309', fontWeight: 600, marginBottom: 4 }}>
                          {evidenceLoading ? 'Loading...' : 'Unavailable'}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleRetryEvidence(ev.id)}
                          style={{
                            fontSize: 11,
                            padding: '3px 8px',
                            background: '#FFF',
                            border: '1px solid #D1D5DB',
                            borderRadius: 4,
                            cursor: 'pointer',
                          }}
                        >
                          Retry
                        </button>
                      </div>
                    )}
                    <div style={{ padding: '6px 8px', fontSize: 11, color: '#6B7280', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {ev.filename || 'Evidence image'}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ margin: 0, fontSize: 13, color: '#6B7280' }}>No photographic evidence uploaded for this claim.</p>
            )}
          </div>

          {/* Physical Inspections History */}
          {claim.inspection_history && claim.inspection_history.length > 0 && (
            <div className="hd-card" style={{ background: '#FFF', borderRadius: 8, border: '1px solid #E5E7EB', padding: 20 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 14px 0', color: '#111827', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Clock size={16} color="#0F3024" /> Physical Inspections
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {claim.inspection_history.map((ins) => (
                  <div key={ins.id} style={{ padding: 12, background: '#F9FAFB', borderRadius: 6, border: '1px solid #E5E7EB' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, textTransform: 'capitalize', color: '#111827' }}>
                        {ins.type?.replace('_', ' ')}: <strong style={{ color: ins.outcome === 'pass' ? '#059669' : '#DC2626' }}>{ins.outcome}</strong>
                      </span>
                      <span style={{ fontSize: 11, color: '#9CA3AF' }}>
                        {ins.inspected_at ? new Date(ins.inspected_at).toLocaleString() : ''}
                      </span>
                    </div>
                    {ins.notes && <p style={{ margin: 0, fontSize: 12, color: '#4B5563' }}>{ins.notes}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Actions, Authoritative Summary & Downstream Progress */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Conditional Decision Form or Summary */}
          {isPendingReview ? (
            <div className="hd-card" style={{ background: '#FFF', borderRadius: 8, border: '1px solid #0F3024', padding: 20, boxShadow: '0 2px 8px rgba(15, 48, 36, 0.08)' }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 4px 0', color: '#0F3024' }}>
                Department Decision &amp; Authorization
              </h3>
              <p style={{ margin: '0 0 16px 0', fontSize: 12.5, color: '#6B7280' }}>
                Review claim documentation and record an authorized return workflow decision.
              </p>

              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: '#374151', marginBottom: 6 }}>
                  Decision Note / Justification <span style={{ color: '#DC2626' }}>*</span>
                </label>
                <textarea
                  rows={3}
                  placeholder="Enter required notes, inspection findings, or justification..."
                  value={actionNote}
                  onChange={(e) => setActionNote(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 6,
                    border: '1px solid #D1D5DB',
                    fontSize: 13,
                    boxSizing: 'border-box',
                    outline: 'none',
                    resize: 'vertical',
                  }}
                />
              </div>

              {/* Selectable Cards for Refund Timing (Refund claims only) */}
              {claim.resolution_type === 'refund' && (
                <div style={{ marginBottom: 20 }}>
                  <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: '#374151', marginBottom: 8 }}>
                    Refund Timing Selection <span style={{ color: '#DC2626' }}>*</span>
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 10 }}>
                    {/* Card 1: Refund before collection */}
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => setRefundTiming('immediate')}
                      onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') setRefundTiming('immediate'); }}
                      style={{
                        padding: '12px 14px',
                        borderRadius: 8,
                        border: refundTiming === 'immediate' ? '2px solid #0F3024' : '1px solid #D1D5DB',
                        background: refundTiming === 'immediate' ? '#F0FDF4' : '#FFFFFF',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ fontSize: 13.5, fontWeight: 700, color: refundTiming === 'immediate' ? '#0F3024' : '#111827' }}>
                          Refund before collection
                        </span>
                        <div
                          style={{
                            width: 18,
                            height: 18,
                            borderRadius: '50%',
                            border: refundTiming === 'immediate' ? '5px solid #0F3024' : '2px solid #9CA3AF',
                            background: '#FFF',
                          }}
                        />
                      </div>
                      <p style={{ margin: 0, fontSize: 12, color: '#4B5563', lineHeight: 1.4 }}>
                        Initiate refund handoff to Payments immediately upon approval. Best for low-risk claims, high-trust customers, or quick resolution.
                      </p>
                    </div>

                    {/* Card 2: Refund after collection */}
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => setRefundTiming('after_collection')}
                      onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') setRefundTiming('after_collection'); }}
                      style={{
                        padding: '12px 14px',
                        borderRadius: 8,
                        border: refundTiming === 'after_collection' ? '2px solid #0F3024' : '1px solid #D1D5DB',
                        background: refundTiming === 'after_collection' ? '#F0FDF4' : '#FFFFFF',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ fontSize: 13.5, fontWeight: 700, color: refundTiming === 'after_collection' ? '#0F3024' : '#111827' }}>
                          Refund after collection
                        </span>
                        <div
                          style={{
                            width: 18,
                            height: 18,
                            borderRadius: '50%',
                            border: refundTiming === 'after_collection' ? '5px solid #0F3024' : '2px solid #9CA3AF',
                            background: '#FFF',
                          }}
                        />
                      </div>
                      <p style={{ margin: 0, fontSize: 12, color: '#4B5563', lineHeight: 1.4 }}>
                        Hold refund handoff until Logistics confirms item collection and condition inspection. Protects against missing or non-compliant returns.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {claim.resolution_type === 'replacement' && (
                <div style={{ marginBottom: 16, padding: '10px 14px', background: '#F3F4F6', borderRadius: 6, fontSize: 12.5, color: '#4B5563' }}>
                  <strong>Replacement Claim:</strong> Approving will route directly to Order &amp; Delivery for replacement shipment. Refund timing is not applicable.
                </div>
              )}

              {/* Action Buttons */}
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', gap: 10 }}>
                <button
                  type="button"
                  disabled={submittingAction}
                  onClick={() => handleDecision('approved')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    padding: '10px 14px',
                    borderRadius: 6,
                    border: 'none',
                    background: '#0F3024',
                    color: '#FFF',
                    fontWeight: 700,
                    fontSize: 13,
                    cursor: submittingAction ? 'not-allowed' : 'pointer',
                    opacity: submittingAction ? 0.7 : 1,
                  }}
                >
                  <CheckCircle2 size={16} /> Approve
                </button>
                <button
                  type="button"
                  disabled={submittingAction}
                  onClick={() => handleDecision('rejected')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    padding: '10px 14px',
                    borderRadius: 6,
                    border: 'none',
                    background: '#DC2626',
                    color: '#FFF',
                    fontWeight: 700,
                    fontSize: 13,
                    cursor: submittingAction ? 'not-allowed' : 'pointer',
                    opacity: submittingAction ? 0.7 : 1,
                  }}
                >
                  <XCircle size={16} /> Reject
                </button>
                <button
                  type="button"
                  disabled={submittingAction}
                  onClick={() => handleDecision('info')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    padding: '10px 14px',
                    borderRadius: 6,
                    border: '1px solid #D1D5DB',
                    background: '#FFF',
                    color: '#374151',
                    fontWeight: 700,
                    fontSize: 13,
                    cursor: submittingAction ? 'not-allowed' : 'pointer',
                    opacity: submittingAction ? 0.7 : 1,
                  }}
                >
                  <HelpCircle size={16} /> Request Info
                </button>
              </div>
            </div>
          ) : (
            /* Post-Approval / Terminal Authoritative Decision Summary */
            <div className="hd-card" style={{ background: '#FFF', borderRadius: 8, border: '1px solid #E5E7EB', padding: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: '#111827' }}>
                  Department Decision Summary
                </h3>
                <HandlerStatusBadge status={claim.workflow_status} />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #F3F4F6', paddingBottom: 8 }}>
                  <span style={{ color: '#6B7280' }}>Decided At</span>
                  <span style={{ fontWeight: 600, color: '#111827' }}>
                    {claim.decided_at ? new Date(claim.decided_at).toLocaleString() : 'Timestamp not recorded'}
                  </span>
                </div>

                {claim.resolution_type === 'refund' && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #F3F4F6', paddingBottom: 8 }}>
                    <span style={{ color: '#6B7280' }}>Authorized Refund Timing</span>
                    <span style={{ fontWeight: 700, color: '#0F3024' }}>
                      {claim.refund_timing === 'immediate'
                        ? 'Refund before collection (Immediate)'
                        : claim.refund_timing === 'after_collection'
                        ? 'Refund after collection (Post-Inspection)'
                        : claim.refund_timing || 'Not Specified'}
                    </span>
                  </div>
                )}

                <div style={{ borderBottom: '1px solid #F3F4F6', paddingBottom: 8 }}>
                  <span style={{ color: '#6B7280', display: 'block', marginBottom: 4 }}>Decision Note</span>
                  <p style={{ margin: 0, color: '#1F2937', fontStyle: claim.decision_note ? 'normal' : 'italic' }}>
                    {claim.decision_note || 'No decision note recorded.'}
                  </p>
                </div>
              </div>

              {/* Resolve Button when in Approved state */}
              {isApproved && (
                <div style={{ marginTop: 18, borderTop: '1px solid #E5E7EB', paddingTop: 14 }}>
                  {canResolve ? (
                    <div>
                      <div style={{ padding: '8px 12px', background: '#ECFDF5', borderRadius: 6, marginBottom: 10, fontSize: 12.5, color: '#065F46' }}>
                        ✓ All downstream logistics and payment handoffs are completed. This claim is ready for final resolution.
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowResolveModal(true)}
                        style={{
                          width: '100%',
                          padding: '10px 16px',
                          borderRadius: 6,
                          border: 'none',
                          background: '#0F3024',
                          color: '#FFF',
                          fontWeight: 700,
                          fontSize: 13,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 8,
                        }}
                      >
                        <CheckCircle2 size={16} /> Resolve Return Request
                      </button>
                    </div>
                  ) : (
                    <div style={{ padding: '10px 12px', background: '#F9FAFB', borderRadius: 6, fontSize: 12, color: '#6B7280' }}>
                      <span style={{ fontWeight: 600, display: 'block', color: '#374151', marginBottom: 4 }}>
                        Awaiting Downstream Handoff Completion:
                      </span>
                      <ul style={{ margin: 0, paddingLeft: 16 }}>
                        <li>Order &amp; Delivery Pickup: {isOrderDeliveryDone ? 'Completed' : 'Pending / In Progress'}</li>
                        {claim.resolution_type === 'refund' && (
                          <li>Payments &amp; Refunds: {isPaymentsDone ? 'Completed' : 'Pending'}</li>
                        )}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Operational Progress Card */}
          <div className="hd-card" style={{ background: '#FFF', borderRadius: 8, border: '1px solid #E5E7EB', padding: 20 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 14px 0', color: '#111827', display: 'flex', alignItems: 'center', gap: 8 }}>
              Downstream Operational Progress
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* Logistics Section */}
              <div style={{ padding: 12, borderRadius: 6, border: '1px solid #E5E7EB', background: '#FAFAFA' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Truck size={16} color="#4B5563" />
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>
                      {claim.resolution_type === 'replacement' ? 'Order & Delivery (Replacement)' : 'Order & Delivery (Pickup)'}
                    </span>
                  </div>
                  {orderDeliveryHandoff ? (
                    <HandlerStatusBadge status={orderDeliveryHandoff.status} />
                  ) : (
                    <span style={{ fontSize: 11, color: '#9CA3AF' }}>Not Assigned</span>
                  )}
                </div>
                <div style={{ fontSize: 12, color: '#6B7280' }}>
                  {orderDeliveryHandoff?.status === 'completed'
                    ? 'Logistics task successfully executed'
                    : orderDeliveryHandoff
                    ? `Task ID #${orderDeliveryHandoff.id} • Assigned to logistics team`
                    : 'Awaiting authorization'}
                </div>
              </div>

              {/* Payments Section */}
              <div style={{ padding: 12, borderRadius: 6, border: '1px solid #E5E7EB', background: '#FAFAFA' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <CreditCard size={16} color="#4B5563" />
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>Payments &amp; Refunds</span>
                  </div>
                  {claim.resolution_type === 'replacement' ? (
                    <span style={{ fontSize: 11, fontWeight: 600, color: '#6B7280', background: '#E5E7EB', padding: '2px 8px', borderRadius: 4 }}>
                      N/A (Replacement)
                    </span>
                  ) : paymentsHandoff ? (
                    <HandlerStatusBadge status={paymentsHandoff.status} />
                  ) : (
                    <span style={{ fontSize: 11, color: '#9CA3AF' }}>Pending Trigger</span>
                  )}
                </div>
                <div style={{ fontSize: 12, color: '#6B7280' }}>
                  {claim.resolution_type === 'replacement'
                    ? 'No refund transaction required for replacement fulfillment'
                    : paymentsHandoff?.status === 'completed'
                    ? 'Refund successfully disbursed'
                    : paymentsHandoff
                    ? `Handoff #${paymentsHandoff.id} • Visible in Payments & Refunds queue`
                    : claim.refund_timing === 'after_collection'
                    ? 'Will trigger automatically after item collection'
                    : 'Awaiting trigger'}
                </div>
              </div>
            </div>
          </div>

          {/* Department Routing Handoff History */}
          <div className="hd-card" style={{ background: '#FFF', borderRadius: 8, border: '1px solid #E5E7EB', padding: 20 }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 12px 0', color: '#111827', display: 'flex', alignItems: 'center', gap: 8 }}>
              <ArrowLeftRight size={16} color="#0F3024" /> Department Routing Log
            </h3>
            {claim.handoff_history && claim.handoff_history.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {claim.handoff_history.map((h) => (
                  <div key={h.id} style={{ padding: '8px 12px', background: '#F9FAFB', borderRadius: 6, border: '1px solid #E5E7EB', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <span style={{ fontSize: 12.5, fontWeight: 600, color: '#111827', display: 'block' }}>
                        {h.source_department || 'Department'} → {h.destination_department || 'Department'}
                      </span>
                      <span style={{ fontSize: 11, color: '#6B7280' }}>
                        {h.type?.replace(/_/g, ' ')} • {h.created_at ? new Date(h.created_at).toLocaleDateString() : ''}
                      </span>
                    </div>
                    <HandlerStatusBadge status={h.status} />
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ margin: 0, fontSize: 12.5, color: '#6B7280' }}>No department handoffs initiated yet.</p>
            )}
          </div>
        </div>
      </div>

      {/* Full-Width Section: Phase 3 Workflow Timeline & Collapsed Detailed Activity */}
      <div style={{ marginTop: 32 }}>
        <div className="hd-card" style={{ background: '#FFF', borderRadius: 8, border: '1px solid #E5E7EB', padding: 24 }}>
          {/* Primary Workflow Timeline */}
          <div style={{ marginBottom: 24 }}>
            <h3 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 6px 0', color: '#111827' }}>
              Workflow Timeline
            </h3>
            <p style={{ margin: '0 0 20px 0', fontSize: 13, color: '#6B7280' }}>
              Key milestone progression across department boundaries.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {milestones.map((ms, index) => {
                const isCompleted = ms.status === 'completed';
                const isInProgress = ms.status === 'in_progress';
                const isFailed = ms.status === 'failed';

                return (
                  <div key={ms.id || index} style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
                    {/* Step Indicator Dot */}
                    <div
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: isCompleted ? '#ECFDF5' : isFailed ? '#FEF2F2' : isInProgress ? '#EFF6FF' : '#F3F4F6',
                        color: isCompleted ? '#059669' : isFailed ? '#DC2626' : isInProgress ? '#2563EB' : '#9CA3AF',
                        border: `2px solid ${isCompleted ? '#059669' : isFailed ? '#DC2626' : isInProgress ? '#2563EB' : '#D1D5DB'}`,
                        flexShrink: 0,
                      }}
                    >
                      {isCompleted ? <Check size={16} /> : isFailed ? <X size={16} /> : isInProgress ? <Clock size={16} /> : <span style={{ fontSize: 12, fontWeight: 700 }}>{index + 1}</span>}
                    </div>

                    {/* Step Body */}
                    <div style={{ flex: 1, paddingBottom: 12, borderBottom: index < milestones.length - 1 ? '1px solid #F3F4F6' : 'none' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 14.5, fontWeight: 700, color: '#111827' }}>{ms.title}</span>
                        <span style={{ fontSize: 12, color: '#9CA3AF' }}>
                          {ms.date ? new Date(ms.date).toLocaleString() : ms.status === 'pending' ? 'Pending' : 'In Progress'}
                        </span>
                      </div>
                      <div style={{ fontSize: 12, color: '#4B5563', marginTop: 2 }}>
                        <span style={{ fontWeight: 600, color: '#374151' }}>{ms.actor}</span>
                        {ms.note && ` — ${ms.note}`}
                      </div>
                      {ms.extra && (
                        <div style={{ marginTop: 4, fontSize: 12, fontWeight: 600, color: '#0F3024' }}>
                          {ms.extra}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Collapsible Detailed Activity Log Accordion */}
          <div style={{ borderTop: '1px solid #E5E7EB', paddingTop: 16 }}>
            <button
              type="button"
              onClick={() => setShowDetailedAudit(!showDetailedAudit)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                width: '100%',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '8px 0',
                color: '#4B5563',
                fontSize: 13.5,
                fontWeight: 600,
              }}
            >
              <span>View Detailed Activity ({claim.audit_history?.length || 0} granular events)</span>
              {showDetailedAudit ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
            </button>

            {showDetailedAudit && (
              <div style={{ marginTop: 14, background: '#F9FAFB', borderRadius: 6, padding: 14, border: '1px solid #E5E7EB' }}>
                {claim.audit_history && claim.audit_history.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {claim.audit_history.map((ev) => (
                      <div
                        key={ev.id}
                        style={{
                          padding: '10px 12px',
                          background: '#FFF',
                          borderRadius: 6,
                          border: '1px solid #E5E7EB',
                          fontSize: 12.5,
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                          <span style={{ fontWeight: 700, color: '#111827', textTransform: 'uppercase', fontSize: 11 }}>
                            {ev.type?.replace(/_/g, ' ')}
                          </span>
                          <span style={{ color: '#9CA3AF', fontSize: 11 }}>
                            {ev.created_at ? new Date(ev.created_at).toLocaleString() : ''}
                          </span>
                        </div>
                        {(ev.previous_status || ev.new_status) && (
                          <div style={{ color: '#4B5563', marginBottom: 2 }}>
                            Transition: <span style={{ fontWeight: 600 }}>{ev.previous_status || 'start'} → {ev.new_status}</span>
                          </div>
                        )}
                        {ev.note && (
                          <div style={{ color: '#6B7280', fontStyle: 'italic', marginTop: 2 }}>
                            Note: "{ev.note}"
                          </div>
                        )}
                        <div style={{ color: '#9CA3AF', fontSize: 11, marginTop: 4 }}>
                          Actor: {ev.actor_name || (ev.actor_user_id ? `User #${ev.actor_user_id}` : 'System')}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p style={{ margin: 0, fontSize: 12.5, color: '#6B7280' }}>No detailed audit records available.</p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Resolve Claim Confirmation Modal */}
      {showResolveModal && (
        <div
          role="presentation"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          onMouseDown={(e) => { if (e.target === e.currentTarget) setShowResolveModal(false); }}
        >
          <div
            role="dialog"
            aria-modal="true"
            style={{
              background: '#FFF',
              borderRadius: 8,
              padding: 24,
              maxWidth: 480,
              width: '90%',
              boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
            }}
          >
            <h3 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 8px 0', color: '#111827' }}>
              Resolve Return Request TRN-{claim.id}
            </h3>
            <p style={{ margin: '0 0 16px 0', fontSize: 13, color: '#4B5563' }}>
              All logistics and payment actions are complete. Mark this claim as officially resolved and closed in the system.
            </p>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
                Resolution Note (Optional)
              </label>
              <textarea
                rows={3}
                placeholder="Optional final notes on this resolved claim..."
                value={resolveNote}
                onChange={(e) => setResolveNote(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: 6,
                  border: '1px solid #D1D5DB',
                  fontSize: 13,
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                type="button"
                onClick={() => setShowResolveModal(false)}
                style={{
                  padding: '8px 14px',
                  borderRadius: 6,
                  border: '1px solid #D1D5DB',
                  background: '#FFF',
                  color: '#374151',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={resolvingClaim}
                onClick={handleResolveClaim}
                style={{
                  padding: '8px 16px',
                  borderRadius: 6,
                  border: 'none',
                  background: '#0F3024',
                  color: '#FFF',
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: resolvingClaim ? 'not-allowed' : 'pointer',
                  opacity: resolvingClaim ? 0.7 : 1,
                }}
              >
                {resolvingClaim ? 'Resolving...' : 'Confirm Resolution'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lightbox Evidence Modal */}
      {selectedEvidence && (
        <div
          className="hd-evidence-lightbox"
          role="presentation"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          onMouseDown={(e) => { if (e.target === e.currentTarget) setSelectedEvidence(null); }}
        >
          <section
            className="hd-evidence-lightbox-panel"
            role="dialog"
            aria-modal="true"
            aria-label={`Evidence image: ${selectedEvidence.filename}`}
            style={{
              position: 'relative',
              background: '#FFF',
              borderRadius: 8,
              padding: 16,
              maxWidth: '85vw',
              maxHeight: '85vh',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <button
              type="button"
              className="hd-evidence-lightbox-close"
              aria-label="Close image preview"
              onClick={() => setSelectedEvidence(null)}
              style={{
                position: 'absolute',
                top: 10,
                right: 10,
                background: 'rgba(0,0,0,0.5)',
                border: 'none',
                borderRadius: '50%',
                color: '#FFF',
                width: 32,
                height: 32,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <X size={20} />
            </button>
            <h3 style={{ margin: '0 0 10px 0', fontSize: 15, fontWeight: 600 }}>{selectedEvidence.filename}</h3>
            <div style={{ flex: 1, overflow: 'auto', display: 'flex', justifyContent: 'center' }}>
              <img
                src={selectedEvidence.url}
                alt={`Evidence: ${selectedEvidence.filename}`}
                style={{ maxWidth: '100%', maxHeight: '70vh', objectFit: 'contain' }}
              />
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

export default HandlerRequestDetailView;
