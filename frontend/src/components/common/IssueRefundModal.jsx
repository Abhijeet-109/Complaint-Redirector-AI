import React, { useState, useEffect } from 'react';
import { X, Lock, CheckCircle2, AlertTriangle, ShieldCheck } from 'lucide-react';
import { adminService } from '../../services/adminService';
import { handlerService } from '../../services/handlerService';

function formatINR(amount) {
  const num = parseFloat(amount) || 0;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
}

export function IssueRefundModal({
  open,
  onClose,
  onSuccess,
  source = 'admin', // 'admin' | 'return_handoff'
  initialValues = null,
}) {
  const isReturnLinked = source === 'return_handoff' && Boolean(initialValues);

  const [refundType, setRefundType] = useState('razorpay'); // 'razorpay' | 'cod'
  const [refundOrderNumber, setRefundOrderNumber] = useState('');
  const [orderLookup, setOrderLookup] = useState(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState('');
  const [selectedAttemptId, setSelectedAttemptId] = useState(null);
  const [refundAmount, setRefundAmount] = useState('');
  const [refundReason, setRefundReason] = useState('');
  const [refundExternalRef, setRefundExternalRef] = useState('');
  const [refundMethod, setRefundMethod] = useState('manual_cod');
  const [processingRefund, setProcessingRefund] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Initialize or reset form state when modal opens or initialValues change
  useEffect(() => {
    if (!open) return;

    setErrorMessage('');
    setLookupError('');

    if (isReturnLinked && initialValues) {
      const isCod = (initialValues.payment_method || initialValues.original_payment_method || '').toLowerCase() === 'cod';
      setRefundType(isCod ? 'cod' : 'razorpay');
      setRefundOrderNumber(initialValues.order_number || '');
      const amt = initialValues.amount ?? initialValues.eligible_amount ?? '';
      setRefundAmount(amt !== '' ? String(amt) : '');
      const reasonText = initialValues.reason || initialValues.return_reason ||
        (initialValues.claim_number ? `Return request ${initialValues.claim_number}: approved` : 'Return refund');
      setRefundReason(reasonText);
      setSelectedAttemptId(initialValues.captured_payment_attempt_id || null);
      setRefundExternalRef(initialValues.external_reference || '');
      setRefundMethod(isCod ? 'manual_cod' : 'manual_bank');
      setOrderLookup(null);
    } else {
      setRefundType('razorpay');
      setRefundOrderNumber('');
      setOrderLookup(null);
      setSelectedAttemptId(null);
      setRefundAmount('');
      setRefundReason('');
      setRefundExternalRef('');
      setRefundMethod('manual_cod');
    }
  }, [open, isReturnLinked, initialValues]);

  if (!open) return null;

  const handleOrderLookup = async () => {
    if (!refundOrderNumber.trim()) return;
    setLookupLoading(true);
    setLookupError('');
    setOrderLookup(null);
    setSelectedAttemptId(null);
    try {
      const res = await adminService.lookupOrderForRefund(refundOrderNumber.trim());
      setOrderLookup(res);
      if (res.captured_attempts && res.captured_attempts.length === 1) {
        setSelectedAttemptId(res.captured_attempts[0].id);
        if (!refundAmount) {
          setRefundAmount(String(res.captured_attempts[0].refundable_amount || res.captured_attempts[0].amount));
        }
      } else if (res.total_amount && !refundAmount) {
        setRefundAmount(String(res.total_amount));
      }
      if (res.payment_method === 'cod') {
        setRefundType('cod');
      } else {
        setRefundType('razorpay');
      }
    } catch (err) {
      setLookupError(err.message || 'Order not found');
    } finally {
      setLookupLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage('');

    if (!refundAmount || parseFloat(refundAmount) <= 0) {
      setErrorMessage('Please specify a valid refund amount greater than zero.');
      return;
    }

    if (!isReturnLinked) {
      if (!orderLookup) {
        setErrorMessage('Please look up and verify the order number first.');
        return;
      }
      if (refundType === 'razorpay' && !selectedAttemptId) {
        setErrorMessage('Please select a captured payment transaction to refund.');
        return;
      }
    }

    setProcessingRefund(true);
    try {
      if (isReturnLinked) {
        // Return-linked refund executed through Payments department API
        const handoffId = initialValues.id || initialValues.handoff_id;
        const refNote = refundType === 'cod' ? refundExternalRef.trim() : (refundExternalRef.trim() || refundReason.trim());
        const result = await handlerService.processPaymentRefund(handoffId, refNote || null);
        if (onSuccess) onSuccess(result);
        onClose();
      } else {
        // Standalone admin refund executed through admin API
        let result;
        if (refundType === 'razorpay') {
          result = await adminService.processRazorpayRefund({
            order_number: refundOrderNumber.trim(),
            payment_attempt_id: parseInt(selectedAttemptId, 10),
            amount: parseFloat(refundAmount),
            reason: refundReason.trim(),
          });
        } else {
          result = await adminService.recordCODRefund({
            order_number: refundOrderNumber.trim(),
            amount: parseFloat(refundAmount),
            refund_method: refundMethod,
            external_reference: refundExternalRef.trim(),
            reason: refundReason.trim(),
          });
        }
        if (onSuccess) onSuccess(result);
        onClose();
      }
    } catch (err) {
      console.error('Refund processing failed:', err);
      setErrorMessage(err.message || 'Refund processing failed.');
    } finally {
      setProcessingRefund(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(18,45,41,0.45)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        className="sd-card"
        style={{
          width: '100%',
          maxWidth: 520,
          maxHeight: '92vh',
          overflowY: 'auto',
          padding: 24,
          boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2), 0 10px 10px -5px rgba(0,0,0,0.1)',
          background: '#FFFFFF',
          borderRadius: 12,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#122D29' }}>
              Issue Refund
            </div>
            {isReturnLinked && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    fontSize: 11,
                    fontWeight: 600,
                    color: '#0F766E',
                    background: '#CCFBF1',
                    padding: '2px 8px',
                    borderRadius: 4,
                  }}
                >
                  <ShieldCheck size={13} />
                  Return Claim: {initialValues.claim_number || `HND-${initialValues.id || initialValues.handoff_id}`}
                </span>
                <span style={{ fontSize: 11, color: '#68726E' }}>
                  Prefilled &amp; verified from authorized return
                </span>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#5C5A54', padding: 4 }}
            aria-label="Close modal"
          >
            <X size={20} />
          </button>
        </div>

        {errorMessage && (
          <div
            style={{
              padding: '10px 14px',
              backgroundColor: '#FEE2E2',
              border: '1px solid #FCA5A5',
              borderRadius: 6,
              color: '#991B1B',
              fontSize: 12.5,
              marginBottom: 14,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <AlertTriangle size={16} flexShrink={0} />
            <span>{errorMessage}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Refund Channel selector */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: '#78827E', display: 'block', marginBottom: 5 }}>
              Refund Channel
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                disabled={isReturnLinked}
                onClick={() => setRefundType('razorpay')}
                style={{
                  flex: 1,
                  padding: '9px 12px',
                  borderRadius: 6,
                  background: refundType === 'razorpay' ? '#122D29' : '#FFFFFF',
                  color: refundType === 'razorpay' ? '#FFFFFF' : '#122D29',
                  border: '1px solid #E5DFC8',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: isReturnLinked ? 'default' : 'pointer',
                  opacity: isReturnLinked && refundType !== 'razorpay' ? 0.45 : 1,
                }}
              >
                Razorpay Online
              </button>
              <button
                type="button"
                disabled={isReturnLinked}
                onClick={() => setRefundType('cod')}
                style={{
                  flex: 1,
                  padding: '9px 12px',
                  borderRadius: 6,
                  background: refundType === 'cod' ? '#122D29' : '#FFFFFF',
                  color: refundType === 'cod' ? '#FFFFFF' : '#122D29',
                  border: '1px solid #E5DFC8',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: isReturnLinked ? 'default' : 'pointer',
                  opacity: isReturnLinked && refundType !== 'cod' ? 0.45 : 1,
                }}
              >
                COD / Manual
              </button>
            </div>
          </div>

          {/* Order Number */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: '#5C5A54', display: 'block', marginBottom: 4 }}>
              Order Number {isReturnLinked && <Lock size={12} style={{ display: 'inline', marginLeft: 4, color: '#8E9894' }} />}
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="text"
                placeholder="e.g. FK-20261109-88964AF8"
                required
                readOnly={isReturnLinked}
                value={refundOrderNumber}
                onChange={(e) => {
                  if (!isReturnLinked) {
                    setRefundOrderNumber(e.target.value);
                    setOrderLookup(null);
                    setLookupError('');
                  }
                }}
                style={{
                  flex: 1,
                  height: 38,
                  padding: '0 10px',
                  borderRadius: 6,
                  border: '1px solid #E5DFC8',
                  fontSize: 13,
                  backgroundColor: isReturnLinked ? '#F9F8F5' : '#FFFFFF',
                  color: '#122D29',
                  cursor: isReturnLinked ? 'not-allowed' : 'text',
                }}
              />
              {!isReturnLinked && (
                <button
                  type="button"
                  onClick={handleOrderLookup}
                  disabled={lookupLoading || !refundOrderNumber.trim()}
                  style={{
                    height: 38,
                    padding: '0 14px',
                    borderRadius: 6,
                    border: '1px solid #C2A15A',
                    background: '#FAF7F2',
                    color: '#122D29',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: lookupLoading || !refundOrderNumber.trim() ? 'not-allowed' : 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {lookupLoading ? 'Looking up…' : 'Look up'}
                </button>
              )}
            </div>
            {lookupError && (
              <div style={{ color: '#C03E33', fontSize: 12, marginTop: 4 }}>{lookupError}</div>
            )}
          </div>

          {/* Standalone Order Dossier Preview */}
          {orderLookup && !isReturnLinked && (
            <div style={{ padding: '10px 12px', borderRadius: 8, background: '#F5F0E8', border: '1px solid #E5DFC8', fontSize: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontWeight: 600, color: '#122D29' }}>{orderLookup.order_number}</span>
                <span style={{ fontWeight: 600, color: '#122D29' }}>{formatINR(orderLookup.total_amount)}</span>
              </div>
              <div style={{ color: '#5C5A54', marginBottom: 2 }}>
                Customer: <strong>{orderLookup.customer_name}</strong> {orderLookup.customer_email ? `(${orderLookup.customer_email})` : ''}
              </div>
              <div style={{ color: '#5C5A54', marginBottom: 2 }}>
                Method: <strong style={{ textTransform: 'uppercase' }}>{orderLookup.payment_method}</strong> · Payment: <strong style={{ textTransform: 'capitalize' }}>{orderLookup.payment_status}</strong> · Order: <strong style={{ textTransform: 'capitalize' }}>{orderLookup.order_status}</strong>
              </div>
              <div style={{ color: '#8B8578', marginTop: 4, fontSize: 11, borderTop: '1px dashed #E5DFC8', paddingTop: 4 }}>
                Items: {orderLookup.products}
              </div>
            </div>
          )}

          {/* Captured Payment Transaction */}
          {refundType === 'razorpay' ? (
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: '#5C5A54', display: 'block', marginBottom: 4 }}>
                Captured Payment Transaction {isReturnLinked && <Lock size={12} style={{ display: 'inline', marginLeft: 4, color: '#8E9894' }} />}
              </label>
              {isReturnLinked ? (
                <div style={{ padding: '9px 12px', borderRadius: 6, background: '#E8F5E9', border: '1px solid #C8E6C9', fontSize: 12, color: '#2E7D32' }}>
                  ✓ {initialValues.provider_payment_id || initialValues.original_payment?.provider_payment_id || `Attempt #${initialValues.captured_payment_attempt_id || 'Captured'}`} — Verified Original Captured Payment
                </div>
              ) : !orderLookup ? (
                <div style={{ fontSize: 12, color: '#8B8578', padding: '8px 10px', background: '#FAF7F2', borderRadius: 6, border: '1px dashed #E5DFC8' }}>
                  Enter Order Number and click "Look up" to select eligible payment transactions.
                </div>
              ) : (!orderLookup.captured_attempts || orderLookup.captured_attempts.length === 0) ? (
                <div style={{ fontSize: 12, color: '#C03E33', padding: '8px 10px', background: '#FDEDED', borderRadius: 6, border: '1px solid #F5C6CB' }}>
                  No captured payment attempts found for this order. Only captured online payments can be refunded.
                </div>
              ) : orderLookup.captured_attempts.length === 1 ? (
                <div style={{ padding: '8px 10px', borderRadius: 6, background: '#E8F5E9', border: '1px solid #C8E6C9', fontSize: 12, color: '#2E7D32' }}>
                  ✓ {orderLookup.captured_attempts[0].provider_payment_id} — {formatINR(orderLookup.captured_attempts[0].amount)} (Refundable: {formatINR(orderLookup.captured_attempts[0].refundable_amount)})
                </div>
              ) : (
                <select
                  value={selectedAttemptId || ''}
                  onChange={(e) => {
                    const attId = parseInt(e.target.value, 10);
                    setSelectedAttemptId(attId);
                    const chosen = orderLookup.captured_attempts.find((a) => a.id === attId);
                    if (chosen && !refundAmount) {
                      setRefundAmount(String(chosen.refundable_amount || chosen.amount));
                    }
                  }}
                  style={{ width: '100%', height: 38, padding: '0 10px', borderRadius: 6, border: '1px solid #E5DFC8', fontSize: 13 }}
                >
                  <option value="">Select a captured transaction…</option>
                  {orderLookup.captured_attempts.map((att) => (
                    <option key={att.id} value={att.id}>
                      {att.provider_payment_id} — {formatINR(att.amount)} (Refundable: {formatINR(att.refundable_amount)})
                    </option>
                  ))}
                </select>
              )}
            </div>
          ) : (
            <>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: '#5C5A54', display: 'block', marginBottom: 4 }}>
                  External Transaction Reference
                </label>
                <input
                  type="text"
                  placeholder="e.g. BANK-REF-98421 or CASH-VOUCHER-01"
                  required={!isReturnLinked}
                  value={refundExternalRef}
                  onChange={(e) => setRefundExternalRef(e.target.value)}
                  style={{ width: '100%', height: 38, padding: '0 10px', borderRadius: 6, border: '1px solid #E5DFC8', fontSize: 13, boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: '#5C5A54', display: 'block', marginBottom: 4 }}>
                  Refund Method
                </label>
                <select
                  value={refundMethod}
                  onChange={(e) => setRefundMethod(e.target.value)}
                  style={{ width: '100%', height: 38, padding: '0 10px', borderRadius: 6, border: '1px solid #E5DFC8', fontSize: 13 }}
                >
                  <option value="manual_cod">Manual Cash</option>
                  <option value="manual_bank">Bank Transfer (NEFT/IMPS)</option>
                  <option value="manual_upi">Direct UPI</option>
                </select>
              </div>
            </>
          )}

          {/* Refund Amount */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: '#78827E', display: 'block', marginBottom: 4 }}>
              Refund Amount (INR) {isReturnLinked && <Lock size={12} style={{ display: 'inline', marginLeft: 4, color: '#8E9894' }} />}
            </label>
            <input
              type="number"
              step="0.01"
              placeholder="0.00"
              required
              readOnly={isReturnLinked}
              value={refundAmount}
              onChange={(e) => {
                if (!isReturnLinked) setRefundAmount(e.target.value);
              }}
              style={{
                width: '100%',
                height: 38,
                padding: '0 10px',
                borderRadius: 6,
                border: '1px solid #E5DFC8',
                fontSize: 13,
                backgroundColor: isReturnLinked ? '#F9F8F5' : '#FFFFFF',
                color: '#122D29',
                cursor: isReturnLinked ? 'not-allowed' : 'text',
                boxSizing: 'border-box',
              }}
            />
            {isReturnLinked && (
              <span style={{ fontSize: 11, color: '#68726E', marginTop: 3, display: 'block' }}>
                Approved refundable amount calculated by backend from claimed item.
              </span>
            )}
          </div>

          {/* Refund Reason */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: '#78827E', display: 'block', marginBottom: 4 }}>
              Refund Reason
            </label>
            <input
              type="text"
              placeholder="e.g. Defective item returned / Customer request"
              required
              value={refundReason}
              onChange={(e) => setRefundReason(e.target.value)}
              style={{ width: '100%', height: 38, padding: '0 10px', borderRadius: 6, border: '1px solid #E5DFC8', fontSize: 13, boxSizing: 'border-box' }}
            />
          </div>

          {/* Modal Actions */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
            <button
              type="button"
              onClick={onClose}
              disabled={processingRefund}
              style={{
                padding: '9px 18px',
                borderRadius: 6,
                background: '#F5F0E8',
                border: '1px solid #E5DFC8',
                fontSize: 13,
                fontWeight: 600,
                color: '#5C5A54',
                cursor: processingRefund ? 'not-allowed' : 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={processingRefund}
              style={{
                padding: '9px 20px',
                borderRadius: 6,
                background: '#991B1B',
                border: 'none',
                fontSize: 13,
                fontWeight: 700,
                color: '#FFFFFF',
                cursor: processingRefund ? 'not-allowed' : 'pointer',
                opacity: processingRefund ? 0.7 : 1,
              }}
            >
              {processingRefund ? 'Processing...' : 'Process Refund'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default IssueRefundModal;
