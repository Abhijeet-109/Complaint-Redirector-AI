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

export function PaymentTransactionsView({ onNavigate }) {
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
  }, [page, pageSize, searchTerm, statusFilter, methodFilter]);

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

          {(searchTerm || statusFilter !== 'all' || methodFilter !== 'all') && (
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
                <th style={{ padding: '10px 14px', fontWeight: 600 }}>Attempt ID</th>
                <th style={{ padding: '10px 14px', fontWeight: 600 }}>Order #</th>
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
                  <td colSpan={9} style={{ padding: '40px 16px', textAlign: 'center', color: '#68726E' }}>
                    <RefreshCw size={18} style={{ animation: 'spin 1s linear infinite', marginBottom: 8 }} />
                    <div>Loading payment transactions...</div>
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={9} style={{ padding: '40px 16px', textAlign: 'center', color: '#991B1B' }}>
                    <AlertTriangle size={18} style={{ marginBottom: 8 }} />
                    <div>{error}</div>
                  </td>
                </tr>
              ) : transactions.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ padding: '50px 16px', textAlign: 'center', color: '#78827E' }}>
                    <Receipt size={28} style={{ marginBottom: 8, color: '#A0AAA6' }} />
                    <div style={{ fontWeight: 600, fontSize: 14, color: '#183A34' }}>No payment transactions found</div>
                    <div style={{ fontSize: 12, marginTop: 4 }}>
                      {searchTerm || statusFilter !== 'all' || methodFilter !== 'all'
                        ? 'Try modifying your search or filters.'
                        : 'No payment attempts have been recorded yet.'}
                    </div>
                  </td>
                </tr>
              ) : (
                transactions.map((tx) => (
                  <tr
                    key={tx.id}
                    onClick={() => handleOpenDetail(tx.id)}
                    style={{
                      borderBottom: '1px solid #F1ECE1',
                      cursor: 'pointer',
                      transition: 'background-color 0.15s ease',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#FCFBF8')}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                  >
                    <td style={{ padding: '10px 14px', fontWeight: 600, color: '#183A34', fontFamily: 'monospace' }}>
                      {tx.attempt_id ? tx.attempt_id.slice(0, 14) : `ATT-${tx.id}`}
                    </td>
                    <td style={{ padding: '10px 14px', color: '#122D29', fontWeight: 500 }}>
                      {tx.order_number || (tx.order_id ? `#${tx.order_id}` : '—')}
                    </td>
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
                ))
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

      {/* Detail Drawer */}
      {selectedAttemptId && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(18, 45, 41, 0.4)',
            zIndex: 100,
            display: 'flex',
            justifyContent: 'flex-end',
          }}
          onClick={handleCloseDetail}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 500,
              height: '100%',
              backgroundColor: '#FFFFFF',
              boxShadow: '-4px 0 24px rgba(0,0,0,0.15)',
              display: 'flex',
              flexDirection: 'column',
              overflowY: 'auto',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drawer Header */}
            <div
              style={{
                padding: '18px 20px',
                borderBottom: '1px solid #ECE7DC',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: '#FAF8F4',
              }}
            >
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#78827E', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Transaction Details
                </div>
                <div style={{ fontSize: 16, fontWeight: 800, color: '#183A34', fontFamily: 'monospace', marginTop: 2 }}>
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
                  padding: 4,
                  borderRadius: 4,
                }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Drawer Body */}
            <div style={{ padding: 20, flex: 1 }}>
              {detailLoading ? (
                <div style={{ padding: '60px 0', textAlign: 'center', color: '#68726E' }}>
                  <RefreshCw size={22} style={{ animation: 'spin 1s linear infinite', marginBottom: 8 }} />
                  <div>Loading details...</div>
                </div>
              ) : detailError ? (
                <div style={{ padding: '20px', backgroundColor: '#FEE2E2', borderRadius: 6, color: '#991B1B' }}>
                  <AlertTriangle size={18} style={{ marginBottom: 6 }} />
                  <div>{detailError}</div>
                </div>
              ) : detailData ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                  {/* Status & Amount Card */}
                  <div
                    style={{
                      background: '#FAF8F4',
                      border: '1px solid #ECE7DC',
                      borderRadius: 8,
                      padding: 16,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 600, color: '#78827E', textTransform: 'uppercase' }}>
                        Captured Amount
                      </div>
                      <div style={{ fontSize: 24, fontWeight: 800, color: '#122D29', marginTop: 2 }}>
                        {formatINR(detailData.amount)}
                      </div>
                    </div>
                    <StatusBadge status={detailData.status} />
                  </div>

                  {/* Customer Information (Masked) */}
                  <div style={{ background: '#FFFFFF', border: '1px solid #ECE7DC', borderRadius: 8, padding: 16 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#183A34', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <User size={14} />
                      Customer Information
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 12 }}>
                      <div>
                        <div style={{ color: '#78827E', fontSize: 11 }}>Customer Name</div>
                        <div style={{ fontWeight: 600, color: '#122D29', marginTop: 2 }}>
                          {detailData.customer?.name || 'Customer'}
                        </div>
                      </div>
                      <div>
                        <div style={{ color: '#78827E', fontSize: 11 }}>Phone (Masked)</div>
                        <div style={{ fontWeight: 600, color: '#122D29', marginTop: 2 }}>
                          {detailData.customer?.phone_masked || '—'}
                        </div>
                      </div>
                      <div style={{ gridColumn: 'span 2' }}>
                        <div style={{ color: '#78827E', fontSize: 11 }}>Email (Masked)</div>
                        <div style={{ fontWeight: 600, color: '#122D29', marginTop: 2 }}>
                          {detailData.customer?.email_masked || '—'}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Linked Order */}
                  <div style={{ background: '#FFFFFF', border: '1px solid #ECE7DC', borderRadius: 8, padding: 16 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#183A34', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Receipt size={14} />
                      Linked Order
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 12 }}>
                      <div>
                        <div style={{ color: '#78827E', fontSize: 11 }}>Order Number</div>
                        <div style={{ fontWeight: 700, color: '#183A34', marginTop: 2 }}>
                          {detailData.order_number || (detailData.order_id ? `#${detailData.order_id}` : '—')}
                        </div>
                      </div>
                      <div>
                        <div style={{ color: '#78827E', fontSize: 11 }}>Order Status</div>
                        <div style={{ fontWeight: 600, color: '#122D29', marginTop: 2 }}>
                          {detailData.order?.status || '—'}
                        </div>
                      </div>
                      <div>
                        <div style={{ color: '#78827E', fontSize: 11 }}>Items Count</div>
                        <div style={{ fontWeight: 600, color: '#122D29', marginTop: 2 }}>
                          {detailData.order?.item_count || 1}
                        </div>
                      </div>
                      <div>
                        <div style={{ color: '#78827E', fontSize: 11 }}>Order Total</div>
                        <div style={{ fontWeight: 700, color: '#122D29', marginTop: 2 }}>
                          {formatINR(detailData.order?.total_amount || detailData.amount)}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Payment Instrument & Gateway */}
                  <div style={{ background: '#FFFFFF', border: '1px solid #ECE7DC', borderRadius: 8, padding: 16 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#183A34', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <CreditCard size={14} />
                      Gateway Provider & Instrument
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 12 }}>
                      <div>
                        <div style={{ color: '#78827E', fontSize: 11 }}>Payment Method</div>
                        <div style={{ fontWeight: 600, color: '#122D29', marginTop: 2 }}>
                          {detailData.payment_method ? detailData.payment_method.toUpperCase() : '—'}
                        </div>
                      </div>
                      <div>
                        <div style={{ color: '#78827E', fontSize: 11 }}>Gateway Provider</div>
                        <div style={{ fontWeight: 600, color: '#122D29', marginTop: 2 }}>
                          {detailData.provider || 'Gateway'}
                        </div>
                      </div>
                      <div style={{ gridColumn: 'span 2' }}>
                        <div style={{ color: '#78827E', fontSize: 11 }}>Provider Reference ID</div>
                        <div style={{ fontWeight: 600, color: '#183A34', fontFamily: 'monospace', marginTop: 2, wordBreak: 'break-all' }}>
                          {detailData.provider_reference || '—'}
                        </div>
                      </div>
                    </div>
                  </div>

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
                              <div style={{ fontWeight: 600, color: '#183A34' }}>{ref.refund_id || `REF-${ref.id}`}</div>
                              <div style={{ fontSize: 11, color: '#78827E' }}>{ref.processed_at || ref.created_at}</div>
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

                  {/* Timestamps */}
                  <div style={{ fontSize: 11, color: '#8E9894', padding: '0 4px' }}>
                    <div>Created: {detailData.created_at ? new Date(detailData.created_at).toLocaleString() : '—'}</div>
                    {detailData.updated_at && (
                      <div>Last Updated: {new Date(detailData.updated_at).toLocaleString()}</div>
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default PaymentTransactionsView;
