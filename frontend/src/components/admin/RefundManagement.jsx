import React, { useState, useEffect, useCallback } from 'react';
import {
  RotateCcw, RefreshCw, CheckCircle2, AlertCircle, X,
  ArrowRight, ShieldCheck, DollarSign,
} from 'lucide-react';
import { adminService } from '../../services/adminService';

function formatINR(amount) {
  const num = parseFloat(amount) || 0;
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num);
}

const STATUS_CONFIG = {
  requested: { bg: '#FEF3C7', color: '#B45309', label: 'Requested' },
  approved: { bg: '#CCFBF1', color: '#0F766E', label: 'Approved' },
  rejected: { bg: '#FEF2F2', color: '#991B1B', label: 'Rejected' },
  item_received: { bg: '#EDE9FE', color: '#6D28D9', label: 'Item Received' },
  inspected: { bg: '#CFFAFE', color: '#0E7490', label: 'Inspected' },
  completed: { bg: '#DCFCE7', color: '#15803D', label: 'Completed' },
  processed: { bg: '#DCFCE7', color: '#15803D', label: 'Processed' },
  pending: { bg: '#FEF3C7', color: '#B45309', label: 'Pending' },
  failed: { bg: '#FEF2F2', color: '#991B1B', label: 'Failed' },
};

function StatusBadge({ status }) {
  const config = STATUS_CONFIG[status?.toLowerCase()] || { bg: '#F5F5F4', color: '#78716C', label: status || 'Unknown' };
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      backgroundColor: config.bg, color: config.color,
      padding: '2px 8px', borderRadius: 9999, fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap',
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: config.color, flexShrink: 0 }} />
      {config.label}
    </span>
  );
}

const VALID_RETURN_TRANSITIONS = {
  requested: ['approved', 'rejected'],
  approved: ['item_received'],
  rejected: [],
  item_received: ['inspected'],
  inspected: ['completed'],
  completed: [],
};

export function RefundManagement() {
  const [activeTab, setActiveTab] = useState('returns'); // 'returns' | 'refunds'
  const [returns, setReturns] = useState([]);
  const [refunds, setRefunds] = useState([]);
  const [totalReturns, setTotalReturns] = useState(0);
  const [totalRefunds, setTotalRefunds] = useState(0);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);

  // Status transition modal
  const [selectedReturn, setSelectedReturn] = useState(null);
  const [targetStatus, setTargetStatus] = useState('');
  const [restock, setRestock] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  // Refund issuance modal
  const [isRefundModalOpen, setIsRefundModalOpen] = useState(false);
  const [refundType, setRefundType] = useState('razorpay'); // 'razorpay' | 'cod'
  const [refundOrderId, setRefundOrderId] = useState('');
  const [refundAttemptId, setRefundAttemptId] = useState('');
  const [refundAmount, setRefundAmount] = useState('');
  const [refundReason, setRefundReason] = useState('');
  const [refundExternalRef, setRefundExternalRef] = useState('');
  const [refundMethod, setRefundMethod] = useState('manual_cod');
  const [processingRefund, setProcessingRefund] = useState(false);

  const showToast = (type, message) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchReturns = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminService.getReturnRequests({ limit: 50 });
      setReturns(res.items || []);
      setTotalReturns(res.total || 0);
    } catch (err) {
      showToast('error', err.message || 'Failed to load return requests');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchRefunds = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminService.getRefunds({ limit: 50 });
      setRefunds(res.items || []);
      setTotalRefunds(res.total || 0);
    } catch (err) {
      showToast('error', err.message || 'Failed to load refund transactions');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'returns') {
      fetchReturns();
    } else {
      fetchRefunds();
    }
  }, [activeTab, fetchReturns, fetchRefunds]);

  const handleUpdateReturn = async () => {
    if (!selectedReturn || !targetStatus) return;
    setUpdatingStatus(true);
    try {
      await adminService.updateReturnStatus(selectedReturn.id, targetStatus, restock);
      showToast('success', `Return status updated to ${targetStatus}`);
      setSelectedReturn(null);
      setTargetStatus('');
      setRestock(false);
      fetchReturns();
    } catch (err) {
      showToast('error', err.message || 'Failed to update return status');
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleIssueRefund = async (e) => {
    e.preventDefault();
    setProcessingRefund(true);
    try {
      if (refundType === 'razorpay') {
        await adminService.processRazorpayRefund({
          order_id: parseInt(refundOrderId, 10),
          payment_attempt_id: parseInt(refundAttemptId, 10),
          amount: parseFloat(refundAmount),
          reason: refundReason,
        });
        showToast('success', 'Razorpay refund initiated successfully');
      } else {
        await adminService.recordCODRefund({
          order_id: parseInt(refundOrderId, 10),
          amount: parseFloat(refundAmount),
          refund_method: refundMethod,
          external_reference: refundExternalRef,
          reason: refundReason,
        });
        showToast('success', 'COD refund recorded successfully');
      }
      setIsRefundModalOpen(false);
      setRefundOrderId('');
      setRefundAttemptId('');
      setRefundAmount('');
      setRefundReason('');
      setRefundExternalRef('');
      if (activeTab === 'refunds') fetchRefunds();
    } catch (err) {
      showToast('error', err.message || 'Refund processing failed');
    } finally {
      setProcessingRefund(false);
    }
  };

  const nextValidStates = selectedReturn ? (VALID_RETURN_TRANSITIONS[selectedReturn.status] || []) : [];

  return (
    <div className="sd-dashboard">
      {/* Toast Alert */}
      {toast && (
        <div className={`hd-toast ${toast.type}`}>
          <span>{toast.message}</span>
          <button className="hd-toast-close" onClick={() => setToast(null)}>✕</button>
        </div>
      )}

      {/* Page Header */}
      <div className="sd-page-header">
        <div>
          <h1 className="sd-page-title">Returns & Refunds</h1>
          <p className="sd-page-subtitle">Inspect customer return lifecycle and process verified online/offline refunds</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={() => setIsRefundModalOpen(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 16px', borderRadius: 8, background: '#122D29',
              color: '#FFFFFF', border: 'none', fontSize: 13, fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <DollarSign size={15} />
            Issue Refund
          </button>
          <button
            className="sd-refresh-btn"
            onClick={() => activeTab === 'returns' ? fetchReturns() : fetchRefunds()}
            disabled={loading}
          >
            <RefreshCw size={15} className={loading ? 'sd-spinning' : ''} />
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button
          onClick={() => setActiveTab('returns')}
          style={{
            padding: '8px 16px', borderRadius: 8, border: 'none',
            background: activeTab === 'returns' ? '#122D29' : '#FFFFFF',
            color: activeTab === 'returns' ? '#FFFFFF' : '#122D29',
            fontWeight: 600, fontSize: 13, cursor: 'pointer',
            border: activeTab === 'returns' ? '1px solid #122D29' : '1px solid #E5DFC8',
          }}
        >
          Return Requests ({totalReturns})
        </button>
        <button
          onClick={() => setActiveTab('refunds')}
          style={{
            padding: '8px 16px', borderRadius: 8, border: 'none',
            background: activeTab === 'refunds' ? '#122D29' : '#FFFFFF',
            color: activeTab === 'refunds' ? '#FFFFFF' : '#122D29',
            fontWeight: 600, fontSize: 13, cursor: 'pointer',
            border: activeTab === 'refunds' ? '1px solid #122D29' : '1px solid #E5DFC8',
          }}
        >
          Refund Transactions ({totalRefunds})
        </button>
      </div>

      {activeTab === 'returns' ? (
        /* Return Requests Table Card */
        <div className="sd-card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #F0EBDC' }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#122D29' }}>
              Customer Return Requests
            </span>
          </div>

          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 48, gap: 10 }}>
              <div style={{ width: 24, height: 24, border: '2px solid #E5DFC8', borderTopColor: '#122D29', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
              <span style={{ color: '#8B8578', fontSize: 13 }}>Loading return requests...</span>
            </div>
          ) : returns.length === 0 ? (
            <div className="sd-empty" style={{ padding: 48 }}>No return requests found.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#FDFCFA', borderBottom: '1px solid #E5DFC8', color: 'rgba(18,45,41,0.6)', textTransform: 'uppercase', fontSize: 11, letterSpacing: '0.04em' }}>
                    <th style={{ padding: '12px 16px' }}>Request ID</th>
                    <th style={{ padding: '12px 16px' }}>Order Number</th>
                    <th style={{ padding: '12px 16px' }}>Customer</th>
                    <th style={{ padding: '12px 16px' }}>Product / SKU</th>
                    <th style={{ padding: '12px 16px', textAlign: 'right' }}>Qty</th>
                    <th style={{ padding: '12px 16px' }}>Reason</th>
                    <th style={{ padding: '12px 16px' }}>Status</th>
                    <th style={{ padding: '12px 16px' }}>Date</th>
                    <th style={{ padding: '12px 16px', textAlign: 'right' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {returns.map(ret => (
                    <tr key={ret.id} style={{ borderBottom: '1px solid #F0EBDC' }}>
                      <td style={{ padding: '12px 16px', fontWeight: 600, color: '#122D29' }}>
                        #{ret.id}
                      </td>
                      <td style={{ padding: '12px 16px', fontWeight: 600, color: '#122D29' }}>
                        {ret.order_number}
                      </td>
                      <td style={{ padding: '12px 16px', color: '#1D1C17' }}>
                        <div>{ret.customer_name || 'Customer'}</div>
                        <div style={{ fontSize: 11, color: '#8B8578' }}>{ret.customer_email}</div>
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ fontWeight: 600, color: '#122D29' }}>{ret.product_name}</div>
                        <div style={{ fontSize: 11, color: '#8B8578' }}>{ret.sku}</div>
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600 }}>
                        {ret.quantity}
                      </td>
                      <td style={{ padding: '12px 16px', color: '#5C5A54', maxWidth: 220 }}>
                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {ret.reason}
                        </div>
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <StatusBadge status={ret.status} />
                      </td>
                      <td style={{ padding: '12px 16px', color: '#8B8578', fontSize: 12 }}>
                        {ret.requested_at ? new Date(ret.requested_at).toLocaleDateString('en-IN') : '—'}
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                        <button
                          onClick={() => {
                            setSelectedReturn(ret);
                            setTargetStatus('');
                            setRestock(false);
                          }}
                          style={{
                            background: '#F5F0E8', border: '1px solid #E5DFC8', borderRadius: 6,
                            padding: '4px 10px', fontSize: 12, fontWeight: 600, color: '#122D29',
                            cursor: 'pointer',
                          }}
                        >
                          Process
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        /* Refund Transactions Table Card */
        <div className="sd-card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #F0EBDC' }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#122D29' }}>
              Processed & Pending Refunds
            </span>
          </div>

          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 48, gap: 10 }}>
              <div style={{ width: 24, height: 24, border: '2px solid #E5DFC8', borderTopColor: '#122D29', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
              <span style={{ color: '#8B8578', fontSize: 13 }}>Loading refund transactions...</span>
            </div>
          ) : refunds.length === 0 ? (
            <div className="sd-empty" style={{ padding: 48 }}>No refund records found.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#FDFCFA', borderBottom: '1px solid #E5DFC8', color: 'rgba(18,45,41,0.6)', textTransform: 'uppercase', fontSize: 11, letterSpacing: '0.04em' }}>
                    <th style={{ padding: '12px 16px' }}>Refund ID</th>
                    <th style={{ padding: '12px 16px' }}>Order Number</th>
                    <th style={{ padding: '12px 16px', textAlign: 'right' }}>Amount</th>
                    <th style={{ padding: '12px 16px' }}>Method</th>
                    <th style={{ padding: '12px 16px' }}>Provider Reference</th>
                    <th style={{ padding: '12px 16px' }}>Reason</th>
                    <th style={{ padding: '12px 16px' }}>Status</th>
                    <th style={{ padding: '12px 16px' }}>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {refunds.map(ref => (
                    <tr key={ref.id} style={{ borderBottom: '1px solid #F0EBDC' }}>
                      <td style={{ padding: '12px 16px', fontWeight: 600, color: '#122D29' }}>
                        #{ref.id}
                      </td>
                      <td style={{ padding: '12px 16px', fontWeight: 600, color: '#122D29' }}>
                        {ref.order_number}
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, color: '#991B1B', fontVariantNumeric: 'tabular-nums' }}>
                        -{formatINR(ref.amount)}
                      </td>
                      <td style={{ padding: '12px 16px', textTransform: 'uppercase', fontSize: 11, fontWeight: 600, color: '#5C5A54' }}>
                        {ref.refund_method}
                      </td>
                      <td style={{ padding: '12px 16px', color: '#5C5A54', fontSize: 12 }}>
                        {ref.provider_refund_id || ref.external_reference || '—'}
                      </td>
                      <td style={{ padding: '12px 16px', color: '#5C5A54', maxWidth: 200 }}>
                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {ref.reason}
                        </div>
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <StatusBadge status={ref.status} />
                      </td>
                      <td style={{ padding: '12px 16px', color: '#8B8578', fontSize: 12 }}>
                        {ref.created_at ? new Date(ref.created_at).toLocaleDateString('en-IN') : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Return Status Transition Modal */}
      {selectedReturn && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(18,45,41,0.4)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
        }}>
          <div className="sd-card" style={{ width: '100%', maxWidth: 480, padding: 24, boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#122D29' }}>
                Update Return #{selectedReturn.id}
              </div>
              <button
                onClick={() => setSelectedReturn(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#5C5A54' }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ marginBottom: 16, fontSize: 13, color: '#5C5A54' }}>
              <div><strong>Order:</strong> {selectedReturn.order_number}</div>
              <div><strong>Product:</strong> {selectedReturn.product_name} ({selectedReturn.quantity} unit)</div>
              <div><strong>Current Status:</strong> <StatusBadge status={selectedReturn.status} /></div>
            </div>

            {nextValidStates.length === 0 ? (
              <div style={{ color: '#8B8578', fontSize: 13, padding: '12px 0' }}>
                This return request is in terminal state ({selectedReturn.status}) and cannot be transitioned further.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: '#8B8578', display: 'block', marginBottom: 6 }}>
                    Next Return Status
                  </label>
                  <select
                    value={targetStatus}
                    onChange={e => setTargetStatus(e.target.value)}
                    style={{ width: '100%', height: 38, padding: '0 12px', borderRadius: 8, border: '1px solid #E5DFC8', fontSize: 13 }}
                  >
                    <option value="">Select status...</option>
                    {nextValidStates.map(s => (
                      <option key={s} value={s}>{s.replace(/_/g, ' ').toUpperCase()}</option>
                    ))}
                  </select>
                </div>

                {targetStatus === 'completed' && (
                  <div style={{ background: '#FAF7F2', padding: 12, borderRadius: 8, border: '1px solid #E5DFC8' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: '#122D29', fontWeight: 600 }}>
                      <input
                        type="checkbox"
                        checked={restock}
                        onChange={e => setRestock(e.target.checked)}
                        style={{ accentColor: '#122D29', width: 16, height: 16 }}
                      />
                      Restock units into available inventory
                    </label>
                    <div style={{ fontSize: 11, color: '#8B8578', marginTop: 4, marginLeft: 24 }}>
                      Only check if goods have been inspected and are eligible for resale.
                    </div>
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
                  <button
                    onClick={() => setSelectedReturn(null)}
                    style={{ padding: '8px 16px', borderRadius: 8, background: '#F5F0E8', border: '1px solid #E5DFC8', fontSize: 13, fontWeight: 600, color: '#5C5A54', cursor: 'pointer' }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleUpdateReturn}
                    disabled={!targetStatus || updatingStatus}
                    style={{
                      padding: '8px 18px', borderRadius: 8, background: '#122D29',
                      border: 'none', fontSize: 13, fontWeight: 600, color: '#FFFFFF',
                      cursor: targetStatus ? 'pointer' : 'not-allowed', opacity: targetStatus ? 1 : 0.6,
                    }}
                  >
                    {updatingStatus ? 'Updating...' : 'Confirm Transition'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Issue Refund Modal */}
      {isRefundModalOpen && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(18,45,41,0.4)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
        }}>
          <div className="sd-card" style={{ width: '100%', maxWidth: 500, padding: 24, boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#122D29' }}>
                Issue Refund
              </div>
              <button
                onClick={() => setIsRefundModalOpen(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#5C5A54' }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleIssueRefund} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* Type selector */}
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: '#8B8578', display: 'block', marginBottom: 4 }}>
                  Refund Channel
                </label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => setRefundType('razorpay')}
                    style={{
                      flex: 1, padding: '8px 12px', borderRadius: 8,
                      background: refundType === 'razorpay' ? '#122D29' : '#FFFFFF',
                      color: refundType === 'razorpay' ? '#FFFFFF' : '#122D29',
                      border: '1px solid #E5DFC8', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                    }}
                  >
                    Razorpay Online
                  </button>
                  <button
                    type="button"
                    onClick={() => setRefundType('cod')}
                    style={{
                      flex: 1, padding: '8px 12px', borderRadius: 8,
                      background: refundType === 'cod' ? '#122D29' : '#FFFFFF',
                      color: refundType === 'cod' ? '#FFFFFF' : '#122D29',
                      border: '1px solid #E5DFC8', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                    }}
                  >
                    COD / Manual
                  </button>
                </div>
              </div>

              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: '#8B8578', display: 'block', marginBottom: 4 }}>
                  Order ID (Database ID)
                </label>
                <input
                  type="number"
                  placeholder="e.g. 1"
                  required
                  value={refundOrderId}
                  onChange={e => setRefundOrderId(e.target.value)}
                  style={{ width: '100%', height: 36, padding: '0 10px', borderRadius: 6, border: '1px solid #E5DFC8', fontSize: 13 }}
                />
              </div>

              {refundType === 'razorpay' ? (
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: '#8B8578', display: 'block', marginBottom: 4 }}>
                    Payment Attempt ID (Captured Razorpay Attempt)
                  </label>
                  <input
                    type="number"
                    placeholder="e.g. 1"
                    required
                    value={refundAttemptId}
                    onChange={e => setRefundAttemptId(e.target.value)}
                    style={{ width: '100%', height: 36, padding: '0 10px', borderRadius: 6, border: '1px solid #E5DFC8', fontSize: 13 }}
                  />
                </div>
              ) : (
                <>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 600, color: '#8B8578', display: 'block', marginBottom: 4 }}>
                      External Transaction Reference
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. BANK-REF-98421 or CASH-VOUCHER-01"
                      required
                      value={refundExternalRef}
                      onChange={e => setRefundExternalRef(e.target.value)}
                      style={{ width: '100%', height: 36, padding: '0 10px', borderRadius: 6, border: '1px solid #E5DFC8', fontSize: 13 }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 600, color: '#8B8578', display: 'block', marginBottom: 4 }}>
                      Refund Method
                    </label>
                    <select
                      value={refundMethod}
                      onChange={e => setRefundMethod(e.target.value)}
                      style={{ width: '100%', height: 36, padding: '0 10px', borderRadius: 6, border: '1px solid #E5DFC8', fontSize: 13 }}
                    >
                      <option value="manual_cod">Manual Cash</option>
                      <option value="manual_bank">Bank Transfer (NEFT/IMPS)</option>
                      <option value="manual_upi">Direct UPI</option>
                    </select>
                  </div>
                </>
              )}

              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: '#8B8578', display: 'block', marginBottom: 4 }}>
                  Refund Amount (INR)
                </label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  required
                  value={refundAmount}
                  onChange={e => setRefundAmount(e.target.value)}
                  style={{ width: '100%', height: 36, padding: '0 10px', borderRadius: 6, border: '1px solid #E5DFC8', fontSize: 13 }}
                />
              </div>

              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: '#8B8578', display: 'block', marginBottom: 4 }}>
                  Refund Reason
                </label>
                <input
                  type="text"
                  placeholder="e.g. Defective item returned / Customer request"
                  required
                  value={refundReason}
                  onChange={e => setRefundReason(e.target.value)}
                  style={{ width: '100%', height: 36, padding: '0 10px', borderRadius: 6, border: '1px solid #E5DFC8', fontSize: 13 }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
                <button
                  type="button"
                  onClick={() => setIsRefundModalOpen(false)}
                  style={{ padding: '8px 16px', borderRadius: 8, background: '#F5F0E8', border: '1px solid #E5DFC8', fontSize: 13, fontWeight: 600, color: '#5C5A54', cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={processingRefund}
                  style={{
                    padding: '8px 18px', borderRadius: 8, background: '#991B1B',
                    border: 'none', fontSize: 13, fontWeight: 600, color: '#FFFFFF',
                    cursor: 'pointer',
                  }}
                >
                  {processingRefund ? 'Processing...' : 'Process Refund'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default RefundManagement;

