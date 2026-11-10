import React, { useState, useEffect, useCallback } from 'react';
import {
  CreditCard, Search, Filter, Download, RefreshCw, CheckSquare,
  Square, Calendar, AlertCircle, FileText, CheckCircle2,
} from 'lucide-react';
import { adminService } from '../../services/adminService';

function formatINR(amount) {
  const num = parseFloat(amount) || 0;
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num);
}

const STATUS_CONFIG = {
  captured: { bg: '#DCFCE7', color: '#15803D', label: 'Captured' },
  failed: { bg: '#FEF2F2', color: '#991B1B', label: 'Failed' },
  pending: { bg: '#FEF3C7', color: '#B45309', label: 'Pending' },
  created: { bg: '#FEF3C7', color: '#B45309', label: 'Created' },
  cancelled: { bg: '#F5F5F4', color: '#78716C', label: 'Cancelled' },
  expired: { bg: '#F5F5F4', color: '#78716C', label: 'Expired' },
  refunded: { bg: '#FEF2F2', color: '#991B1B', label: 'Refunded' },
  partially_refunded: { bg: '#FEF3C7', color: '#B45309', label: 'Partially Refunded' },
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

export function PaymentHistory({ focusedPaymentId = null, onClearFocusedPayment }) {
  const [payments, setPayments] = useState([]);
  const [total, setTotal] = useState(0);
  const [nextCursor, setNextCursor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [toast, setToast] = useState(null);
  const [highlightId, setHighlightId] = useState(focusedPaymentId);

  // Filters
  const [search, setSearch] = useState('');
  const [paymentStatus, setPaymentStatus] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [shipmentStatus, setShipmentStatus] = useState('');

  // Selection
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [selectAllFiltered, setSelectAllFiltered] = useState(false);

  const showToast = (type, message) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchPayments = useCallback(async (isLoadMore = false, cursor = null) => {
    if (isLoadMore) setLoadingMore(true);
    else setLoading(true);

    try {
      const params = { limit: 20 };
      if (search.trim()) params.search = search.trim();
      if (paymentStatus) params.payment_status = paymentStatus;
      if (paymentMethod) params.payment_method = paymentMethod;
      if (shipmentStatus) params.shipment_status = shipmentStatus;
      if (cursor) params.cursor_id = cursor;

      const res = await adminService.getPayments(params);
      if (isLoadMore) {
        setPayments(prev => [...prev, ...(res.items || [])]);
      } else {
        setPayments(res.items || []);
        setTotal(res.total != null ? res.total : (res.total_count || 0));
        setSelectedIds(new Set());
        setSelectAllFiltered(false);
      }
      setNextCursor(res.next_cursor || null);
    } catch (err) {
      showToast('error', err.message || 'Failed to load payments ledger');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [search, paymentStatus, paymentMethod, shipmentStatus]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchPayments(false, null);
    }, 250);
    return () => clearTimeout(timer);
  }, [fetchPayments]);

  // Handle focused payment auto-scroll & highlight
  useEffect(() => {
    if (focusedPaymentId) {
      setHighlightId(focusedPaymentId);
      const timer = setTimeout(() => {
        const el = document.getElementById(`payment-row-${focusedPaymentId}`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 150);
      const clearTimer = setTimeout(() => {
        setHighlightId(null);
        if (onClearFocusedPayment) onClearFocusedPayment();
      }, 2500);
      return () => {
        clearTimeout(timer);
        clearTimeout(clearTimer);
      };
    }
  }, [focusedPaymentId, payments, onClearFocusedPayment]);

  // Selection handlers
  const toggleRow = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setSelectAllFiltered(false);
  };

  const togglePageAll = () => {
    if (selectedIds.size === payments.length && payments.length > 0) {
      setSelectedIds(new Set());
      setSelectAllFiltered(false);
    } else {
      setSelectedIds(new Set(payments.map(p => p.id)));
    }
  };

  const handleSelectAllFiltered = () => {
    setSelectAllFiltered(true);
    setSelectedIds(new Set(payments.map(p => p.id)));
  };

  const handleClearSelection = () => {
    setSelectedIds(new Set());
    setSelectAllFiltered(false);
  };

  // CSV Export
  const handleExport = (mode) => {
    const params = new URLSearchParams();
    params.append('mode', mode);

    if (mode === 'selected') {
      if (selectedIds.size === 0) {
        showToast('error', 'No payments selected for export');
        return;
      }
      params.append('selected_ids', Array.from(selectedIds).join(','));
    } else {
      // Filtered mode
      if (search.trim()) params.append('search', search.trim());
      if (paymentStatus) params.append('payment_status', paymentStatus);
      if (paymentMethod) params.append('payment_method', paymentMethod);
      if (shipmentStatus) params.append('shipment_status', shipmentStatus);
    }

    const url = `/api/admin/commerce/payments/export/csv?${params.toString()}`;
    window.open(url, '_blank');
  };

  const isAllPageSelected = payments.length > 0 && payments.every(p => selectedIds.has(p.id));

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
          <h1 className="sd-page-title">Payment History</h1>
          <p className="sd-page-subtitle">Full transaction ledger across captured, pending, and failed payment attempts</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="sd-refresh-btn" onClick={() => fetchPayments(false, null)} disabled={loading}>
            <RefreshCw size={15} className={loading ? 'sd-spinning' : ''} />
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Toolbar: Search, Filters & Export */}
      <div className="sd-card" style={{ marginBottom: 16, padding: '12px 16px' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
          
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flex: 1, minWidth: 0, flexWrap: 'wrap' }}>
            {/* Search */}
            <div style={{ position: 'relative', width: 200, flexShrink: 0 }}>
              <Search size={15} color="#A8A293" style={{ position: 'absolute', left: 10, top: 11 }} />
              <input
                type="text"
                placeholder="Search payments..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{
                  width: '100%', height: 36, padding: '0 10px 0 32px',
                  borderRadius: 8, border: '1px solid #E5DFC8',
                  fontSize: 12, background: '#FFFFFF', color: '#1D1C17',
                }}
              />
            </div>

            {/* Payment Status */}
            <select
              value={paymentStatus}
              onChange={e => setPaymentStatus(e.target.value)}
              style={{ height: 36, padding: '0 8px', borderRadius: 8, border: '1px solid #E5DFC8', fontSize: 12, background: '#FFFFFF', color: '#1D1C17' }}
            >
              <option value="">All Payment Statuses</option>
              <option value="captured">Captured / Success</option>
              <option value="pending">Pending</option>
              <option value="failed">Failed</option>
              <option value="refunded">Refunded</option>
              <option value="expired">Expired</option>
            </select>

            {/* Payment Method */}
            <select
              value={paymentMethod}
              onChange={e => setPaymentMethod(e.target.value)}
              style={{ height: 36, padding: '0 8px', borderRadius: 8, border: '1px solid #E5DFC8', fontSize: 12, background: '#FFFFFF', color: '#1D1C17' }}
            >
              <option value="">All Methods</option>
              <option value="razorpay">Razorpay</option>
              <option value="upi">UPI</option>
              <option value="netbanking">Net Banking</option>
              <option value="cod">Cash on Delivery</option>
            </select>

            {/* Shipment Status */}
            <select
              value={shipmentStatus}
              onChange={e => setShipmentStatus(e.target.value)}
              style={{ height: 36, padding: '0 8px', borderRadius: 8, border: '1px solid #E5DFC8', fontSize: 12, background: '#FFFFFF', color: '#1D1C17' }}
            >
              <option value="">All Shipment States</option>
              <option value="pending">Pending</option>
              <option value="shipped">Shipped</option>
              <option value="out_for_delivery">Out for Delivery</option>
              <option value="delivered">Delivered</option>
            </select>
          </div>

          {/* Export Buttons */}
          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            <button
              onClick={() => handleExport('selected')}
              disabled={selectedIds.size === 0}
              title="Download selected transactions"
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '0 10px', height: 36, borderRadius: 8,
                background: selectedIds.size > 0 ? '#122D29' : '#F5F0E8',
                color: selectedIds.size > 0 ? '#FFFFFF' : '#A8A293',
                border: '1px solid #E5DFC8', fontSize: 11, fontWeight: 600,
                cursor: selectedIds.size > 0 ? 'pointer' : 'not-allowed',
                whiteSpace: 'nowrap',
              }}
            >
              <Download size={13} />
              Export Selected ({selectedIds.size})
            </button>
            <button
              onClick={() => handleExport('filtered')}
              title="Download all filtered transactions"
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '0 10px', height: 36, borderRadius: 8,
                background: '#FFFFFF', color: '#122D29',
                border: '1px solid #E5DFC8', fontSize: 11, fontWeight: 600,
                cursor: 'pointer', whiteSpace: 'nowrap',
              }}
            >
              <Download size={13} />
              Export Filtered ({total})
            </button>
          </div>

        </div>
      </div>

      {/* Select-All Banner */}
      {selectedIds.size > 0 && (
        <div style={{
          background: '#FDFCFA', border: '1px solid #E5DFC8', borderRadius: 8,
          padding: '10px 16px', marginBottom: 16, display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', fontSize: 13,
        }}>
          <div>
            {selectAllFiltered ? (
              <span>All <strong>{total}</strong> filtered transactions selected across all pages.</span>
            ) : (
              <span><strong>{selectedIds.size}</strong> transaction(s) selected on this page.</span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            {!selectAllFiltered && total > payments.length && (
              <button
                onClick={handleSelectAllFiltered}
                style={{ background: 'none', border: 'none', color: '#122D29', fontWeight: 600, cursor: 'pointer', fontSize: 13, textDecoration: 'underline' }}
              >
                Select all {total} matching transactions
              </button>
            )}
            <button
              onClick={handleClearSelection}
              style={{ background: 'none', border: 'none', color: '#8B8578', cursor: 'pointer', fontSize: 13 }}
            >
              Clear selection
            </button>
          </div>
        </div>
      )}

      {/* Transactions Table Card */}
      <div className="sd-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #F0EBDC', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#122D29' }}>
            Transactions ({total} total attempts)
          </span>
        </div>

        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 48, gap: 10 }}>
            <div style={{ width: 24, height: 24, border: '2px solid #E5DFC8', borderTopColor: '#122D29', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
            <span style={{ color: '#8B8578', fontSize: 13 }}>Loading transaction ledger...</span>
          </div>
        ) : payments.length === 0 ? (
          <div className="sd-empty" style={{ padding: 48 }}>No payment attempts found matching the filters.</div>
        ) : (
          <div style={{ overflowX: 'auto', maxWidth: '100%' }}>
            <table style={{ width: '100%', minWidth: '900px', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13, tableLayout: 'fixed' }}>
              <colgroup>
                <col style={{ width: '38px' }} />
                <col style={{ width: '15%' }} />
                <col style={{ width: '13%' }} />
                <col style={{ width: '14%' }} />
                <col style={{ width: '12%' }} />
                <col style={{ width: '9%' }} />
                <col style={{ width: '8%' }} />
                <col style={{ width: '10%' }} />
                <col style={{ width: '8%' }} />
                <col style={{ width: '11%' }} />
              </colgroup>
              <thead>
                <tr style={{ background: '#FDFCFA', borderBottom: '1px solid #E5DFC8', color: 'rgba(18,45,41,0.6)', textTransform: 'uppercase', fontSize: 11, letterSpacing: '0.04em' }}>
                  <th style={{ padding: '10px 10px', width: 38 }}>
                    <input
                      type="checkbox"
                      checked={isAllPageSelected}
                      onChange={togglePageAll}
                      style={{ cursor: 'pointer', width: 15, height: 15, accentColor: '#122D29' }}
                    />
                  </th>
                  <th style={{ padding: '10px 10px' }}>Transaction / Attempt ID</th>
                  <th style={{ padding: '10px 10px' }}>Order Number</th>
                  <th style={{ padding: '10px 10px' }}>Product</th>
                  <th style={{ padding: '10px 10px' }}>Customer</th>
                  <th style={{ padding: '10px 10px', textAlign: 'right' }}>Amount</th>
                  <th style={{ padding: '10px 10px' }}>Method</th>
                  <th style={{ padding: '10px 10px' }}>Payment Status</th>
                  <th style={{ padding: '10px 10px' }}>Shipment</th>
                  <th style={{ padding: '10px 10px' }}>Date</th>
                </tr>
              </thead>
              <tbody>
                {payments.map(pay => {
                  const isSelected = selectedIds.has(pay.id);
                  const isHighlighted = Boolean(
                    highlightId != null && (
                      highlightId === pay.id ||
                      (pay.attempt_id != null && highlightId === pay.attempt_id) ||
                      (pay.id != null && highlightId === `attempt-${pay.id}`) ||
                      (pay.order_id != null && highlightId === `cod-${pay.order_id}`)
                    )
                  );
                  return (
                    <tr
                      id={`payment-row-${pay.id}`}
                      key={pay.id}
                      style={{
                        borderBottom: '1px solid #F0EBDC',
                        background: isHighlighted ? '#FEF9C3' : (isSelected ? '#FAF7F2' : 'transparent'),
                        boxShadow: isHighlighted ? 'inset 3px 0 0 #C2A15A' : 'none',
                        transition: 'background 0.2s ease',
                      }}
                    >
                      <td style={{ padding: '10px 10px' }}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleRow(pay.id)}
                          style={{ cursor: 'pointer', width: 15, height: 15, accentColor: '#122D29' }}
                        />
                      </td>
                      <td style={{ padding: '10px 10px', overflow: 'hidden' }}>
                        <div style={{ fontWeight: 600, color: '#122D29', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={pay.transaction_id || `ATTEMPT-${pay.id}`}>{pay.transaction_id || `ATTEMPT-${pay.id}`}</div>
                        {pay.provider_payment_id && (
                          <div style={{ fontSize: 10, color: '#8B8578', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>RZP: {pay.provider_payment_id}</div>
                        )}
                        {pay.failure_reason && (
                          <div style={{ fontSize: 11, color: '#991B1B', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={pay.failure_reason}>{pay.failure_reason}</div>
                        )}
                      </td>
                      <td style={{ padding: '10px 10px', fontWeight: 600, color: '#122D29', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={pay.order_number}>
                        {pay.order_number}
                      </td>
                      <td style={{ padding: '10px 10px', color: '#5C5A54', overflow: 'hidden' }}>
                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={pay.product_summary || 'Order Items'}>
                          {pay.product_summary || 'Order Items'}
                        </div>
                      </td>
                      <td style={{ padding: '10px 10px', color: '#1D1C17', overflow: 'hidden' }}>
                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={pay.customer_name || 'Customer'}>{pay.customer_name || 'Customer'}</div>
                        <div style={{ fontSize: 11, color: '#8B8578', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={pay.customer_email || ''}>{pay.customer_email || ''}</div>
                      </td>
                      <td style={{ padding: '10px 10px', textAlign: 'right', fontWeight: 700, color: '#122D29', fontVariantNumeric: 'tabular-nums' }}>
                        {formatINR(pay.amount)}
                      </td>
                      <td style={{ padding: '10px 10px', textTransform: 'uppercase', fontSize: 11, fontWeight: 600, color: '#5C5A54', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {pay.payment_method || '—'}
                      </td>
                      <td style={{ padding: '10px 10px' }}>
                        <StatusBadge status={pay.status} />
                      </td>
                      <td style={{ padding: '10px 10px' }}>
                        <StatusBadge status={pay.shipment_status || 'pending'} />
                      </td>
                      <td style={{ padding: '10px 10px', color: '#8B8578', fontSize: 12, whiteSpace: 'nowrap' }}>
                        {pay.created_at ? new Date(pay.created_at).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' }) : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Load More Button */}
        {nextCursor && (
          <div style={{ padding: '16px 20px', textAlign: 'center', borderTop: '1px solid #F0EBDC' }}>
            <button
              onClick={() => fetchPayments(true, nextCursor)}
              disabled={loadingMore}
              style={{
                background: '#FFFFFF', border: '1px solid #E5DFC8', borderRadius: 8,
                padding: '8px 24px', fontSize: 13, fontWeight: 600, color: '#122D29',
                cursor: 'pointer',
              }}
            >
              {loadingMore ? 'Loading more...' : 'Load More Transactions'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default PaymentHistory;

