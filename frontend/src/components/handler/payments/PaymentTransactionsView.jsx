import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Search,
  RefreshCw,
  X,
  CreditCard,
  Calendar,
  User,
  ArrowRight,
  Filter,
  CheckCircle2,
  Clock,
  AlertTriangle,
  RotateCcw,
  Receipt,
  ExternalLink,
} from 'lucide-react';
import { handlerService } from '../../../services/handlerService';
import { HandlerPagination } from '../HandlerPagination';

function formatINR(amount) {
  const num = parseFloat(amount) || 0;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(num);
}

function StatusBadge({ status }) {
  const statusConfig = {
    captured: { bg: '#DCFCE7', color: '#15803D', label: 'Captured' },
    completed: { bg: '#DCFCE7', color: '#15803D', label: 'Completed' },
    processed: { bg: '#DCFCE7', color: '#15803D', label: 'Processed' },
    pending: { bg: '#FEF3C7', color: '#B45309', label: 'Pending' },
    failed: { bg: '#FEE2E2', color: '#991B1B', label: 'Failed' },
    cancelled: { bg: '#F5F5F4', color: '#78716C', label: 'Cancelled' },
    refunded: { bg: '#EDE9FE', color: '#6D28D9', label: 'Refunded' },
  };
  const key = String(status || '').toLowerCase().replace(/\s+/g, '_');
  const config = statusConfig[key] || { bg: '#F5F5F4', color: '#78716C', label: status || 'Unknown' };

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '3px 9px',
        borderRadius: 4,
        fontSize: 11,
        fontWeight: 600,
        backgroundColor: config.bg,
        color: config.color,
        whiteSpace: 'nowrap',
      }}
    >
      {config.label}
    </span>
  );
}

export function PaymentTransactionsView({ onNavigate, highlightId }) {
  const [transactions, setTransactions] = useState([]);
  const [totalItems, setTotalItems] = useState(0);
  const [summary, setSummary] = useState({
    total_attempts: 0,
    captured: 0,
    pending: 0,
    failed: 0,
    refunded: 0,
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [methodFilter, setMethodFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);

  // Detail Drawer
  const [selectedAttemptId, setSelectedAttemptId] = useState(null);
  const [detailData, setDetailData] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState(null);

  const fetchTransactions = useCallback(async () => {
    try {
      const params = {
        limit: pageSize,
        offset: (page - 1) * pageSize,
      };
      if (searchTerm.trim()) params.search = searchTerm.trim();
      if (typeFilter !== 'all') params.transaction_type = typeFilter;
      if (statusFilter !== 'all') params.payment_status = statusFilter;
      if (methodFilter !== 'all') params.payment_method = methodFilter;

      const res = await handlerService.getPaymentTransactions(params);
      setTransactions(res.items || []);
      setTotalItems(res.total || 0);
      if (res.summary || res.kpis) setSummary(res.summary || res.kpis);
      setError(null);
    } catch (err) {
      console.error('Failed to load payment transactions:', err);
      setError(err.message || 'Failed to load payment transactions');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [page, pageSize, searchTerm, statusFilter, methodFilter, typeFilter]);

  useEffect(() => {
    setLoading(true);
    fetchTransactions();
  }, [fetchTransactions]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchTransactions();
  };

  const handleResetFilters = () => {
    setSearchTerm('');
    setStatusFilter('all');
    setMethodFilter('all');
    setTypeFilter('all');
    setPage(1);
  };

  const handleOpenDetail = async (attemptId) => {
    setSelectedAttemptId(attemptId);
    setDetailLoading(true);
    setDetailError(null);
    setDetailData(null);
    try {
      const data = await handlerService.getPaymentTransactionDetails(attemptId);
      setDetailData(data);
    } catch (err) {
      console.error('Failed to load transaction details:', err);
      setDetailError(err.message || 'Failed to load transaction details');
    } finally {
      setDetailLoading(false);
    }
  };

  const handleCloseDetail = () => {
    setSelectedAttemptId(null);
    setDetailData(null);
    setDetailError(null);
  };

  return (
    <div style={{ padding: '0 4px 30px' }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 18,
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: '#122D29', margin: 0, letterSpacing: '-0.02em' }}>
            Payment Transactions
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#68726E' }}>
            Review payment attempts, provider responses, and transaction statuses.
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            style={{
              background: '#FFFFFF',
              border: '1px solid #E8E4D8',
              borderRadius: 6,
              padding: '6px 12px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 12,
              fontWeight: 600,
              color: '#183A34',
              cursor: refreshing ? 'not-allowed' : 'pointer',
            }}
          >
            <RefreshCw size={13} style={{ animation: refreshing ? 'spin 0.8s linear infinite' : 'none' }} />
            Refresh
          </button>
        </div>
      </div>

      {/* KPI Strip */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 12,
          marginBottom: 18,
        }}
      >
        {[
          { label: 'Total Attempts', value: summary.total_attempts, icon: Receipt, color: '#183A34', bg: '#F4EFE6' },
          { label: 'Captured', value: summary.captured, icon: CheckCircle2, color: '#15803D', bg: '#DCFCE7' },
          { label: 'Pending', value: summary.pending, icon: Clock, color: '#B45309', bg: '#FEF3C7' },
          { label: 'Failed', value: summary.failed, icon: AlertTriangle, color: '#991B1B', bg: '#FEE2E2' },
          { label: 'Refunded', value: summary.refunded, icon: RotateCcw, color: '#6D28D9', bg: '#EDE9FE' },
        ].map((kpi, idx) => {
          const Icon = kpi.icon;
          return (
            <div
              key={idx}
              style={{
                background: '#FFFFFF',
                border: '1px solid #ECE7DC',
                borderRadius: 8,
                padding: '12px 16px',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
              }}
            >
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 6,
                  backgroundColor: kpi.bg,
                  color: kpi.color,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <Icon size={18} />
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#78827E', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  {kpi.label}
                </div>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#122D29', marginTop: 2 }}>
                  {kpi.value.toLocaleString()}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Toolbar */}
      <div
        style={{
          background: '#FFFFFF',
          border: '1px solid #ECE7DC',
          borderRadius: 8,
          padding: '12px 16px',
          marginBottom: 16,
          display: 'flex',
          flexWrap: 'wrap',
          gap: 12,
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', flex: 1 }}>
          {/* Search */}
          <div
            style={{
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
              minWidth: 260,
              maxWidth: 360,
              flex: 1,
            }}
          >
            <Search size={14} style={{ position: 'absolute', left: 10, color: '#8E9894' }} />
            <input
              type="text"
              placeholder="Search by Attempt ID, Order #, Provider Ref..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setPage(1);
              }}
              style={{
                width: '100%',
                padding: '7px 10px 7px 32px',
                fontSize: 12,
                borderRadius: 6,
                border: '1px solid #E8E4D8',
                backgroundColor: '#FAF8F4',
                color: '#122D29',
                outline: 'none',
              }}
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => {
                  setSearchTerm('');
                  setPage(1);
                }}
                style={{
                  position: 'absolute',
                  right: 8,
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  color: '#8E9894',
                  padding: 2,
                }}
              >
                <X size={13} />
              </button>
            )}
          </div>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            style={{
              padding: '7px 10px',
              fontSize: 12,
              borderRadius: 6,
              border: '1px solid #E8E4D8',
              backgroundColor: '#FAF8F4',
              color: '#122D29',
              cursor: 'pointer',
            }}
          >
            <option value="all">All Statuses</option>
            <option value="captured">Captured</option>
            <option value="pending">Pending</option>
            <option value="failed">Failed</option>
            <option value="cancelled">Cancelled</option>
            <option value="refunded">Refunded</option>
          </select>

          <select
            value={typeFilter}
            onChange={(e) => {
              setTypeFilter(e.target.value);
              setPage(1);
            }}
            style={{
              padding: '7px 10px',
              fontSize: 12,
              borderRadius: 6,
              border: '1px solid #E8E4D8',
              backgroundColor: '#FAF8F4',
              color: '#122D29',
              cursor: 'pointer',
            }}
          >
            <option value="all">All Types</option>
            <option value="payment">Payments</option>
            <option value="refund">Refunds</option>
          </select>

          {/* Method Filter */}
          <select
            value={methodFilter}
            onChange={(e) => {
              setMethodFilter(e.target.value);
              setPage(1);
            }}
            style={{
              padding: '7px 10px',
              fontSize: 12,
              borderRadius: 6,
              border: '1px solid #E8E4D8',
              backgroundColor: '#FAF8F4',
              color: '#122D29',
              cursor: 'pointer',
            }}
          >
            <option value="all">All Methods</option>
            <option value="upi">UPI</option>
            <option value="card">Card</option>
            <option value="netbanking">Net Banking</option>
            <option value="wallet">Wallet</option>
            <option value="cod">Cash on Delivery</option>
          </select>

          {(searchTerm || statusFilter !== 'all' || methodFilter !== 'all' || typeFilter !== 'all') && (
            <button
              type="button"
              onClick={handleResetFilters}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#8E9894',
                fontSize: 12,
                cursor: 'pointer',
                textDecoration: 'underline',
                padding: '4px 6px',
              }}
            >
              Reset Filters
            </button>
          )}
        </div>

        <div style={{ fontSize: 12, color: '#68726E' }}>
          Total: <strong>{totalItems}</strong> transactions
        </div>
      </div>

      {/* Table Container */}
      <div
        style={{
          background: '#FFFFFF',
          border: '1px solid #ECE7DC',
          borderRadius: 8,
          overflow: 'hidden',
        }}
      >
        <div style={{ overflowX: 'auto' }}>
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              textAlign: 'left',
              fontSize: 12.5,
            }}
          >
            <thead>
              <tr style={{ background: '#F9F8F3', borderBottom: '1px solid #ECE7DC', color: '#68726E' }}>
                <th style={{ padding: '10px 14px', fontWeight: 600 }}>Transaction ID</th>
                <th style={{ padding: '10px 14px', fontWeight: 600 }}>Order #</th>
                <th style={{ padding: '10px 14px', fontWeight: 600 }}>Type</th>
                <th style={{ padding: '10px 14px', fontWeight: 600 }}>Customer</th>
                <th style={{ padding: '10px 14px', fontWeight: 600 }}>Amount</th>
                <th style={{ padding: '10px 14px', fontWeight: 600 }}>Method</th>
                <th style={{ padding: '10px 14px', fontWeight: 600 }}>Provider / Ref</th>
                <th style={{ padding: '10px 14px', fontWeight: 600 }}>Status</th>
                <th style={{ padding: '10px 14px', fontWeight: 600 }}>Created Date</th>
                <th style={{ padding: '10px 14px', fontWeight: 600, textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={10} style={{ padding: '40px 16px', textAlign: 'center', color: '#68726E' }}>
                    <RefreshCw size={18} style={{ animation: 'spin 1s linear infinite', marginBottom: 8 }} />
                    <div>Loading payment transactions...</div>
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={10} style={{ padding: '40px 16px', textAlign: 'center', color: '#991B1B' }}>
                    <AlertTriangle size={18} style={{ marginBottom: 8 }} />
                    <div>{error}</div>
                  </td>
                </tr>
              ) : transactions.length === 0 ? (
                <tr>
                  <td colSpan={10} style={{ padding: '50px 16px', textAlign: 'center', color: '#78827E' }}>
                    <Receipt size={28} style={{ marginBottom: 8, color: '#A0AAA6' }} />
                    <div style={{ fontWeight: 600, fontSize: 14, color: '#183A34' }}>No payment transactions found</div>
                    <div style={{ fontSize: 12, marginTop: 4 }}>
                      {searchTerm || statusFilter !== 'all' || methodFilter !== 'all' || typeFilter !== 'all'
                        ? 'Try modifying your search or filters.'
                        : 'No payment attempts have been recorded yet.'}
                    </div>
                  </td>
                </tr>
              ) : (
                transactions.map((tx) => {
                  const isHighlighted = highlightId && (
                    String(tx.id) === String(highlightId) ||
                    String(tx.attempt_id) === String(highlightId) ||
                    String(tx.order_id) === String(highlightId)
                  );

                  return (
                    <tr
                      key={tx.id}
                      ref={(el) => {
                        if (el && isHighlighted) {
                          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        }
                      }}
                      onClick={() => handleOpenDetail(tx.id)}
                      className={isHighlighted ? 'hd-row-highlighted' : ''}
                      style={{
                        borderBottom: '1px solid #F1ECE1',
                        cursor: 'pointer',
                        transition: 'background-color 0.15s ease',
                      }}
                      onMouseEnter={(e) => {
                        if (!isHighlighted) e.currentTarget.style.backgroundColor = '#FCFBF8';
                      }}
                      onMouseLeave={(e) => {
                        if (!isHighlighted) e.currentTarget.style.backgroundColor = 'transparent';
                      }}
                    >
                      <td style={{ padding: '10px 14px', fontWeight: 600, color: '#183A34', fontFamily: 'monospace' }}>
                        {tx.transaction_id || tx.attempt_id || `ATT-${tx.id}`}
                      </td>
                      <td style={{ padding: '10px 14px', color: '#122D29', fontWeight: 500 }}>
                        {tx.order_number || (tx.order_id ? `#${tx.order_id}` : '—')}
                      </td>
                      <td style={{ padding: '10px 14px', color: '#2C3A36' }}>{tx.type || 'Payment'}</td>
                      <td style={{ padding: '10px 14px', color: '#2C3A36' }}>
                        {tx.customer_name || 'Customer'}
                      </td>
                      <td style={{ padding: '10px 14px', fontWeight: 700, color: '#122D29' }}>
                        {formatINR(tx.amount)}
                      </td>
                      <td style={{ padding: '10px 14px', color: '#5A6561' }}>
                        {tx.payment_method ? tx.payment_method.toUpperCase() : '—'}
                      </td>
                      <td style={{ padding: '10px 14px', color: '#68726E', fontSize: 11.5 }}>
                        <div style={{ fontWeight: 500, color: '#183A34' }}>{tx.provider || 'Gateway'}</div>
                        <div style={{ fontFamily: 'monospace', color: '#8E9894' }}>
                          {tx.provider_reference ? tx.provider_reference.slice(0, 16) : '—'}
                        </div>
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <StatusBadge status={tx.status} />
                      </td>
                      <td style={{ padding: '10px 14px', color: '#68726E', fontSize: 11.5 }}>
                        {tx.created_at
                          ? new Date(tx.created_at).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                            })
                          : '—'}
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenDetail(tx.id);
                          }}
                          style={{
                            background: '#FAF8F4',
                            border: '1px solid #ECE7DC',
                            borderRadius: 4,
                            padding: '4px 8px',
                            fontSize: 11,
                            fontWeight: 600,
                            color: '#183A34',
                            cursor: 'pointer',
                          }}
                        >
                          View Details
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <HandlerPagination
          currentPage={page}
          pageSize={pageSize}
          totalItems={totalItems}
          onPageChange={(nextPage) => setPage(nextPage)}
          onPageSizeChange={(nextSize) => {
            setPageSize(nextSize);
            setPage(1);
          }}
          pageSizeOptions={[10, 15, 25, 50]}
        />
      </div>

      {/* Centered 2-Column Detail Modal */}
      {selectedAttemptId && (
        <div
          className="pay-modal-backdrop"
          onClick={handleCloseDetail}
        >
          <div
            className="pay-modal-container"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="pay-modal-header">
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#78827E', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Transaction Overview
                </div>
                <div style={{ fontSize: 17, fontWeight: 800, color: '#183A34', fontFamily: 'monospace', marginTop: 2 }}>
                  {detailData?.attempt_id || `ATT-${selectedAttemptId}`}
                </div>
              </div>
              <button
                type="button"
                onClick={handleCloseDetail}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#68726E',
                  cursor: 'pointer',
                  padding: 6,
                  borderRadius: 6,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                aria-label="Close details"
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Body: 2 Columns */}
            {detailLoading ? (
              <div style={{ padding: '80px 0', textAlign: 'center', color: '#68726E' }}>
                <RefreshCw size={24} style={{ animation: 'spin 1s linear infinite', marginBottom: 10 }} />
                <div style={{ fontSize: 13, fontWeight: 500 }}>Loading transaction details...</div>
              </div>
            ) : detailError ? (
              <div style={{ padding: 24, margin: 24, backgroundColor: '#FEE2E2', borderRadius: 8, color: '#991B1B' }}>
                <AlertTriangle size={20} style={{ marginBottom: 8 }} />
                <div style={{ fontWeight: 600 }}>{detailError}</div>
              </div>
            ) : detailData ? (
              <div className="pay-modal-body">
                {/* Left Column: Context, Customer, Order, Instrument, Siblings */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {/* Customer Information (Masked) */}
                  <div style={{ background: '#FFFFFF', border: '1px solid #ECE7DC', borderRadius: 8, padding: 16 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: '#183A34', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <User size={15} />
                      Customer Information
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, fontSize: 12 }}>
                      <div>
                        <div style={{ color: '#78827E', fontSize: 11 }}>Customer Name</div>
                        <div style={{ fontWeight: 600, color: '#122D29', marginTop: 3 }}>
                          {detailData.customer?.name || 'Customer'}
                        </div>
                      </div>
                      <div>
                        <div style={{ color: '#78827E', fontSize: 11 }}>Phone (Masked)</div>
                        <div style={{ fontWeight: 600, color: '#122D29', marginTop: 3 }}>
                          {detailData.customer?.phone_masked || '—'}
                        </div>
                      </div>
                      <div style={{ gridColumn: 'span 2' }}>
                        <div style={{ color: '#78827E', fontSize: 11 }}>Email (Masked)</div>
                        <div style={{ fontWeight: 600, color: '#122D29', marginTop: 3 }}>
                          {detailData.customer?.email_masked || detailData.customer?.masked_email || '—'}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Linked Order */}
                  <div style={{ background: '#FFFFFF', border: '1px solid #ECE7DC', borderRadius: 8, padding: 16 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: '#183A34', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Receipt size={15} />
                      Linked Order Context
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, fontSize: 12 }}>
                      <div>
                        <div style={{ color: '#78827E', fontSize: 11 }}>Order Number</div>
                        <div style={{ fontWeight: 700, color: '#183A34', marginTop: 3 }}>
                          {detailData.order_number || detailData.order?.order_number || (detailData.order_id ? `#${detailData.order_id}` : '—')}
                        </div>
                      </div>
                      <div>
                        <div style={{ color: '#78827E', fontSize: 11 }}>Order Status</div>
                        <div style={{ fontWeight: 600, color: '#122D29', marginTop: 3, textTransform: 'capitalize' }}>
                          {detailData.order?.status || '—'}
                        </div>
                      </div>
                      <div>
                        <div style={{ color: '#78827E', fontSize: 11 }}>Items Count</div>
                        <div style={{ fontWeight: 600, color: '#122D29', marginTop: 3 }}>
                          {detailData.order?.items?.length || detailData.order?.item_count || 1}
                        </div>
                      </div>
                      <div>
                        <div style={{ color: '#78827E', fontSize: 11 }}>Order Total</div>
                        <div style={{ fontWeight: 700, color: '#122D29', marginTop: 3 }}>
                          {formatINR(detailData.order?.total_amount || detailData.amount)}
                        </div>
                      </div>
                    </div>

                    {detailData.order?.items && detailData.order.items.length > 0 && (
                      <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid #F1ECE1' }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: '#78827E', marginBottom: 6 }}>Items in Order:</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {detailData.order.items.map((item, idx) => (
                            <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: '#122D29' }}>
                              <span>{item.quantity}x {item.product_name} ({item.variant_name || 'Standard'})</span>
                              <span style={{ fontWeight: 600 }}>{formatINR(item.total_price)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Payment Gateway & Instrument */}
                  <div style={{ background: '#FFFFFF', border: '1px solid #ECE7DC', borderRadius: 8, padding: 16 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: '#183A34', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <CreditCard size={15} />
                      Gateway Provider & Instrument
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, fontSize: 12 }}>
                      <div>
                        <div style={{ color: '#78827E', fontSize: 11 }}>Payment Method</div>
                        <div style={{ fontWeight: 600, color: '#122D29', marginTop: 3 }}>
                          {(detailData.payment_method || detailData.order?.payment_method || 'online').toUpperCase()}
                        </div>
                      </div>
                      <div>
                        <div style={{ color: '#78827E', fontSize: 11 }}>Gateway Provider</div>
                        <div style={{ fontWeight: 600, color: '#122D29', marginTop: 3 }}>
                          {detailData.provider || 'Razorpay'}
                        </div>
                      </div>
                      <div style={{ gridColumn: 'span 2' }}>
                        <div style={{ color: '#78827E', fontSize: 11 }}>Provider Reference ID</div>
                        <div style={{ fontWeight: 600, color: '#183A34', fontFamily: 'monospace', marginTop: 3, wordBreak: 'break-all' }}>
                          {detailData.provider_reference || detailData.provider_payment_id || detailData.provider_order_id || '—'}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Sibling Attempts */}
                  {detailData.related_attempts && detailData.related_attempts.length > 0 && (
                    <div style={{ background: '#FFFFFF', border: '1px solid #ECE7DC', borderRadius: 8, padding: 16 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#183A34', marginBottom: 10 }}>
                        Other Attempts on this Order ({detailData.related_attempts.length})
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {detailData.related_attempts.map((sib, sIdx) => (
                          <div key={sIdx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11.5, padding: '6px 10px', background: '#FAF8F4', borderRadius: 4 }}>
                            <span>Attempt #{sib.id} · {sib.provider}</span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={{ fontWeight: 600 }}>{formatINR(sib.amount)}</span>
                              <StatusBadge status={sib.status} />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Related Refunds */}
                  {detailData.related_refunds && detailData.related_refunds.length > 0 && (
                    <div style={{ background: '#FFFFFF', border: '1px solid #ECE7DC', borderRadius: 8, padding: 16 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#183A34', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <RotateCcw size={14} />
                        Related Refunds ({detailData.related_refunds.length})
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {detailData.related_refunds.map((ref, idx) => (
                          <div
                            key={idx}
                            style={{
                              padding: '8px 12px',
                              background: '#FAF8F4',
                              borderRadius: 6,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              fontSize: 12,
                            }}
                          >
                            <div>
                              <div style={{ fontWeight: 600, color: '#183A34' }}>{ref.provider_refund_id || `REF-${ref.id}`}</div>
                              <div style={{ fontSize: 11, color: '#78827E' }}>{ref.created_at ? new Date(ref.created_at).toLocaleDateString() : '—'}</div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                              <div style={{ fontWeight: 700, color: '#991B1B' }}>-{formatINR(ref.amount)}</div>
                              <StatusBadge status={ref.status} />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Right Column: Sticky Summary & Status Card */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div
                    style={{
                      background: '#FFFFFF',
                      border: '1px solid #ECE7DC',
                      borderRadius: 8,
                      padding: 18,
                      position: 'sticky',
                      top: 0,
                    }}
                  >
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#78827E', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      {detailData.type === 'Refund' ? 'Refund Amount' : 'Captured Amount'}
                    </div>
                    <div style={{ fontSize: 26, fontWeight: 800, color: '#122D29', marginTop: 4, marginBottom: 12 }}>
                      {formatINR(detailData.amount)}
                    </div>

                    <div style={{ marginBottom: 16 }}>
                      <StatusBadge status={detailData.status} />
                    </div>

                    {detailData.failure_reason && (
                      <div style={{ padding: '10px 12px', background: '#FEE2E2', borderRadius: 6, color: '#991B1B', fontSize: 12, marginBottom: 16 }}>
                        <div style={{ fontWeight: 700, marginBottom: 2 }}>Failure Reason:</div>
                        <div>{detailData.failure_reason}</div>
                      </div>
                    )}

                    <div style={{ borderTop: '1px solid #ECE7DC', paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 8, fontSize: 11.5, color: '#68726E' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>Created:</span>
                        <span style={{ fontWeight: 500, color: '#122D29' }}>
                          {detailData.created_at ? new Date(detailData.created_at).toLocaleString() : '—'}
                        </span>
                      </div>
                      {detailData.paid_at && (
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span>Paid At:</span>
                          <span style={{ fontWeight: 500, color: '#122D29' }}>
                            {new Date(detailData.paid_at).toLocaleString()}
                          </span>
                        </div>
                      )}
                      {detailData.updated_at && (
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span>Updated:</span>
                          <span style={{ fontWeight: 500, color: '#122D29' }}>
                            {new Date(detailData.updated_at).toLocaleString()}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

export default PaymentTransactionsView;
