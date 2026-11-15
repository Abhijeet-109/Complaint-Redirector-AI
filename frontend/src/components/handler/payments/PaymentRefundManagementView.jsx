import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Search,
  RefreshCw,
  X,
  RotateCcw,
  Receipt,
  User,
  Clock,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  ShieldAlert,
  CreditCard,
  FileText,
  Truck,
  Check,
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
    awaiting_processing: { bg: '#FEF3C7', color: '#B45309', label: 'Awaiting Processing' },
    pending: { bg: '#FEF3C7', color: '#B45309', label: 'Pending' },
    processing: { bg: '#E0F2FE', color: '#0369A1', label: 'Processing' },
    completed: { bg: '#DCFCE7', color: '#15803D', label: 'Completed' },
    processed: { bg: '#DCFCE7', color: '#15803D', label: 'Processed' },
    approved: { bg: '#E0F2FE', color: '#0369A1', label: 'Approved' },
    failed: { bg: '#FEE2E2', color: '#991B1B', label: 'Failed' },
    cancelled: { bg: '#F5F5F4', color: '#78716C', label: 'Cancelled' },
    invalid_state: { bg: '#FEE2E2', color: '#991B1B', label: 'Requires Reconciliation' },
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

export function PaymentRefundManagementView({ onNavigate, initialTab, highlightId }) {
  const [activeTab, setActiveTab] = useState(initialTab || 'all');
  const [refunds, setRefunds] = useState([]);
  const [totalItems, setTotalItems] = useState(0);
  const [tabCounts, setTabCounts] = useState({
    all: 0,
    awaiting: 0,
    processing: 0,
    completed: 0,
    failed: 0,
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [timingFilter, setTimingFilter] = useState('all');
  const [methodFilter, setMethodFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);

  // Detail Drawer
  const [selectedHandoffId, setSelectedHandoffId] = useState(null);
  const [detailData, setDetailData] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState(null);

  // Refund Action State
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [externalReference, setExternalReference] = useState('');
  const [actionProcessing, setActionProcessing] = useState(false);
  const [acceptingHandoff, setAcceptingHandoff] = useState(false);
  const [actionError, setActionError] = useState('');
  const [actionSuccess, setActionSuccess] = useState('');

  const fetchRefunds = useCallback(async () => {
    try {
      const params = {
        limit: pageSize,
        offset: (page - 1) * pageSize,
      };
      if (activeTab !== 'all') {
        params.status = activeTab;
      }
      if (searchTerm.trim()) params.search = searchTerm.trim();
      if (timingFilter !== 'all') params.refund_timing = timingFilter;
      if (methodFilter !== 'all') params.payment_method = methodFilter;

      const res = await handlerService.getPaymentsRefunds(params);
      setRefunds(res.items || []);
      setTotalItems(res.total || 0);
      if (res.tab_counts) {
        setTabCounts({
          all: res.tab_counts.all ?? 0,
          awaiting: res.tab_counts.awaiting ?? res.tab_counts.awaiting_processing ?? 0,
          processing: res.tab_counts.processing ?? 0,
          completed: res.tab_counts.completed ?? 0,
          failed: res.tab_counts.failed ?? 0,
        });
      }
      setError(null);
    } catch (err) {
      console.error('Failed to load refunds:', err);
      setError(err.message || 'Failed to load refunds');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeTab, page, pageSize, searchTerm, timingFilter, methodFilter]);

  useEffect(() => {
    setLoading(true);
    fetchRefunds();
  }, [fetchRefunds]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchRefunds();
  };

  const handleTabChange = (tabKey) => {
    setActiveTab(tabKey);
    setPage(1);
  };

  const handleResetFilters = () => {
    setSearchTerm('');
    setTimingFilter('all');
    setMethodFilter('all');
    setPage(1);
  };

  const handleOpenDetail = async (handoffId) => {
    setSelectedHandoffId(handoffId);
    setDetailLoading(true);
    setDetailError(null);
    setDetailData(null);
    setActionError('');
    setActionSuccess('');
    setExternalReference('');
    setShowConfirmModal(false);
    try {
      const data = await handlerService.getPaymentRefundDetails(handoffId);
      setDetailData(data);
    } catch (err) {
      console.error('Failed to load refund details:', err);
      setDetailError(err.message || 'Failed to load refund details');
    } finally {
      setDetailLoading(false);
    }
  };

  const handleCloseDetail = () => {
    setSelectedHandoffId(null);
    setDetailData(null);
    setDetailError(null);
    setShowConfirmModal(false);
    setActionError('');
    setActionSuccess('');
  };

  const handleAcceptHandoff = async () => {
    if (!selectedHandoffId) return;
    setAcceptingHandoff(true);
    setActionError('');
    setActionSuccess('');
    try {
      await handlerService.updateHandoffStatus(
        selectedHandoffId,
        'accepted',
        'Payments handler accepted refund handoff'
      );
      setActionSuccess('Handoff accepted. You can now initiate the refund.');
      const updated = await handlerService.getPaymentRefundDetails(selectedHandoffId);
      setDetailData(updated);
      fetchRefunds();
    } catch (err) {
      console.error('Accept handoff error:', err);
      setActionError(err.message || 'Failed to accept handoff.');
    } finally {
      setAcceptingHandoff(false);
    }
  };

  const handleExecuteRefund = async () => {
    if (!selectedHandoffId) return;
    setActionProcessing(true);
    setActionError('');
    setActionSuccess('');
    try {
      const result = await handlerService.processPaymentRefund(selectedHandoffId, externalReference.trim() || null);
      setActionSuccess(result.message || 'Refund successfully processed');
      setShowConfirmModal(false);
      // Refresh current details
      const updated = await handlerService.getPaymentRefundDetails(selectedHandoffId);
      setDetailData(updated);
      // Refresh main queue
      fetchRefunds();
    } catch (err) {
      console.error('Refund execution error:', err);
      setActionError(err.message || 'Failed to execute refund.');
    } finally {
      setActionProcessing(false);
    }
  };

  const isEligibleToProcess = useMemo(() => {
    if (!detailData) return false;
    const s = String(detailData.status || '').toLowerCase();
    const canProcessStatus = s === 'pending' || s === 'awaiting_processing' || s === 'processing';
    const isCompleted = s === 'processed' || s === 'completed';
    return canProcessStatus && !isCompleted && detailData.is_eligible_for_refund !== false;
  }, [detailData]);

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
            Refund Management
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#68726E' }}>
            Process and monitor approved return refund handoffs and transactions.
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

      {/* Status Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, overflowX: 'auto', paddingBottom: 4 }}>
        {[
          { key: 'all', label: 'All Refunds', count: tabCounts.all },
          { key: 'awaiting', label: 'Awaiting Processing', count: tabCounts.awaiting },
          { key: 'processing', label: 'Processing', count: tabCounts.processing },
          { key: 'completed', label: 'Completed', count: tabCounts.completed },
          { key: 'failed', label: 'Failed', count: tabCounts.failed },
        ].map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => handleTabChange(tab.key)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 14px',
                borderRadius: 6,
                border: isActive ? '1px solid #183A34' : '1px solid #E8E4D8',
                backgroundColor: isActive ? '#183A34' : '#FFFFFF',
                color: isActive ? '#FFFFFF' : '#4A5552',
                fontSize: 12.5,
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                whiteSpace: 'nowrap',
              }}
            >
              <span>{tab.label}</span>
              {tab.count !== undefined && (
                <span
                  style={{
                    backgroundColor: isActive ? 'rgba(255,255,255,0.22)' : '#F4EFE6',
                    color: isActive ? '#FFFFFF' : '#183A34',
                    fontSize: 11,
                    fontWeight: 700,
                    padding: '1px 6px',
                    borderRadius: 10,
                  }}
                >
                  {tab.count}
                </span>
              )}
            </button>
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
              placeholder="Search by Claim #, Order #, Customer..."
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

          {/* Timing Filter */}
          <select
            value={timingFilter}
            onChange={(e) => {
              setTimingFilter(e.target.value);
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
            <option value="all">All Timing Types</option>
            <option value="immediate">Immediate Refund</option>
            <option value="after_collection">After Collection</option>
          </select>

          {/* Payment Method Filter */}
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

          {(searchTerm || timingFilter !== 'all' || methodFilter !== 'all') && (
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
          Total: <strong>{totalItems}</strong> refund records
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
                <th style={{ padding: '10px 14px', fontWeight: 600 }}>Refund / Handoff ID</th>
                <th style={{ padding: '10px 14px', fontWeight: 600 }}>Return Claim #</th>
                <th style={{ padding: '10px 14px', fontWeight: 600 }}>Order #</th>
                <th style={{ padding: '10px 14px', fontWeight: 600 }}>Customer</th>
                <th style={{ padding: '10px 14px', fontWeight: 600 }}>Timing</th>
                <th style={{ padding: '10px 14px', fontWeight: 600 }}>Method</th>
                <th style={{ padding: '10px 14px', fontWeight: 600 }}>Amount</th>
                <th style={{ padding: '10px 14px', fontWeight: 600 }}>Status</th>
                <th style={{ padding: '10px 14px', fontWeight: 600 }}>Updated Date</th>
                <th style={{ padding: '10px 14px', fontWeight: 600, textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={10} style={{ padding: '40px 16px', textAlign: 'center', color: '#68726E' }}>
                    <RefreshCw size={18} style={{ animation: 'spin 1s linear infinite', marginBottom: 8 }} />
                    <div>Loading refund records...</div>
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={10} style={{ padding: '40px 16px', textAlign: 'center', color: '#991B1B' }}>
                    <AlertTriangle size={18} style={{ marginBottom: 8 }} />
                    <div>{error}</div>
                  </td>
                </tr>
              ) : refunds.length === 0 ? (
                <tr>
                  <td colSpan={10} style={{ padding: '50px 16px', textAlign: 'center', color: '#78827E' }}>
                    <RotateCcw size={28} style={{ marginBottom: 8, color: '#A0AAA6' }} />
                    <div style={{ fontWeight: 600, fontSize: 14, color: '#183A34' }}>No refunds in this queue</div>
                    <div style={{ fontSize: 12, marginTop: 4 }}>
                      {searchTerm || timingFilter !== 'all' || methodFilter !== 'all'
                        ? 'Try modifying your search or filters.'
                        : 'No refund handoffs currently match this filter criteria.'}
                    </div>
                  </td>
                </tr>
              ) : (
                refunds.map((ref) => {
                  const isEligible = (ref.status === 'awaiting_processing' || ref.status === 'pending') && ref.is_eligible !== false;
                  const isHighlighted = highlightId && (
                    String(ref.id) === String(highlightId) ||
                    String(ref.handoff_id) === String(highlightId) ||
                    String(ref.return_request_id) === String(highlightId) ||
                    String(ref.claim_number).includes(String(highlightId))
                  );

                  return (
                    <tr
                      key={ref.id}
                      ref={(el) => {
                        if (el && isHighlighted) {
                          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        }
                      }}
                      onClick={() => handleOpenDetail(ref.id)}
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
                        {ref.handoff_id || `HND-${ref.id}`}
                      </td>
                      <td style={{ padding: '10px 14px', color: '#122D29', fontWeight: 600 }}>
                        {ref.claim_number || (ref.return_request_id ? `RET-${ref.return_request_id}` : '—')}
                      </td>
                      <td style={{ padding: '10px 14px', color: '#122D29' }}>
                        {ref.order_number || (ref.order_id ? `#${ref.order_id}` : '—')}
                      </td>
                      <td style={{ padding: '10px 14px', color: '#2C3A36' }}>
                        {ref.customer_name || 'Customer'}
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <span
                          style={{
                            fontSize: 11,
                            padding: '2px 7px',
                            borderRadius: 4,
                            backgroundColor: ref.refund_timing === 'immediate' ? '#E0F2FE' : '#F5F5F4',
                            color: ref.refund_timing === 'immediate' ? '#0369A1' : '#5A6561',
                            fontWeight: 600,
                          }}
                        >
                          {ref.refund_timing === 'immediate' ? 'Immediate' : ref.refund_timing === 'after_collection' ? 'After Collection' : (ref.refund_timing || 'Unspecified')}
                        </span>
                      </td>
                      <td style={{ padding: '10px 14px', color: '#5A6561' }}>
                        {ref.payment_method ? ref.payment_method.toUpperCase() : '—'}
                      </td>
                      <td style={{ padding: '10px 14px', fontWeight: 700, color: '#122D29' }}>
                        {formatINR(ref.amount || ref.eligible_amount)}
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <StatusBadge status={ref.status} />
                      </td>
                      <td style={{ padding: '10px 14px', color: '#68726E', fontSize: 11.5 }}>
                        {ref.updated_at
                          ? new Date(ref.updated_at).toLocaleDateString('en-US', {
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
                            handleOpenDetail(ref.id);
                          }}
                          style={{
                            background: isEligible ? '#183A34' : '#FAF8F4',
                            border: isEligible ? '1px solid #183A34' : '1px solid #ECE7DC',
                            borderRadius: 4,
                            padding: '4px 9px',
                            fontSize: 11,
                            fontWeight: 600,
                            color: isEligible ? '#FFFFFF' : '#183A34',
                            cursor: 'pointer',
                          }}
                        >
                          {isEligible ? 'Process Refund' : 'Review'}
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

      {/* Centered 2-Column Refund Detail Modal */}
      {selectedHandoffId && (
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
                  Refund Handoff Inspection
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 2 }}>
                  <span style={{ fontSize: 17, fontWeight: 800, color: '#183A34', fontFamily: 'monospace' }}>
                    {detailData?.handoff_id || `HND-${selectedHandoffId}`}
                  </span>
                  {detailData?.claim_number && (
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#5A6460' }}>
                      ({detailData.claim_number})
                    </span>
                  )}
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
                <div style={{ fontSize: 13, fontWeight: 500 }}>Loading refund details...</div>
              </div>
            ) : detailError ? (
              <div style={{ padding: 24, margin: 24, backgroundColor: '#FEE2E2', borderRadius: 8, color: '#991B1B' }}>
                <AlertTriangle size={20} style={{ marginBottom: 8 }} />
                <div style={{ fontWeight: 600 }}>{detailError}</div>
              </div>
            ) : detailData ? (
              <div className="pay-modal-body">
                {/* Left Column: Dossier, Customer, Original Payment, O&D Prerequisite, Timeline */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {/* Action Banner / Notification */}
                  {actionSuccess && (
                    <div
                      style={{
                        padding: '12px 14px',
                        background: '#DCFCE7',
                        border: '1px solid #86EFAC',
                        borderRadius: 6,
                        color: '#15803D',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        fontSize: 12.5,
                        fontWeight: 600,
                      }}
                    >
                      <CheckCircle2 size={16} />
                      {actionSuccess}
                    </div>
                  )}

                  {actionError && (
                    <div
                      style={{
                        padding: '12px 14px',
                        background: '#FEE2E2',
                        border: '1px solid #FCA5A5',
                        borderRadius: 6,
                        color: '#991B1B',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        fontSize: 12.5,
                        fontWeight: 600,
                      }}
                    >
                      <AlertTriangle size={16} />
                      {actionError}
                    </div>
                  )}

                  {/* Return Approval Context */}
                  <div style={{ background: '#FFFFFF', border: '1px solid #ECE7DC', borderRadius: 8, padding: 16 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: '#183A34', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <FileText size={15} />
                      Return Claim Context (Read-Only)
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, fontSize: 12 }}>
                      <div>
                        <div style={{ color: '#78827E', fontSize: 11 }}>Return Claim #</div>
                        <div style={{ fontWeight: 700, color: '#183A34', marginTop: 3 }}>
                          {detailData.claim_number || `RET-${detailData.return_request_id}`}
                        </div>
                      </div>
                      <div>
                        <div style={{ color: '#78827E', fontSize: 11 }}>Resolution</div>
                        <div style={{ fontWeight: 600, color: '#122D29', marginTop: 3, textTransform: 'capitalize' }}>
                          {detailData.resolution_type || 'Refund'}
                        </div>
                      </div>
                      <div>
                        <div style={{ color: '#78827E', fontSize: 11 }}>Claim Status</div>
                        <div style={{ fontWeight: 600, color: '#122D29', marginTop: 3, textTransform: 'capitalize' }}>
                          {detailData.claim_status || 'Approved'}
                        </div>
                      </div>
                      <div>
                        <div style={{ color: '#78827E', fontSize: 11 }}>Linked Order</div>
                        <div style={{ fontWeight: 700, color: '#183A34', marginTop: 3 }}>
                          {detailData.order_number || (detailData.order_id ? `#${detailData.order_id}` : '—')}
                        </div>
                      </div>
                      <div style={{ gridColumn: 'span 2' }}>
                        <div style={{ color: '#78827E', fontSize: 11 }}>Return Reason</div>
                        <div style={{ color: '#122D29', marginTop: 3, background: '#FAF8F4', padding: '8px 10px', borderRadius: 4 }}>
                          {detailData.reason || 'Customer requested return / transit defect'}
                        </div>
                      </div>
                    </div>
                  </div>

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

                  {/* Original Payment Information & Balances */}
                  <div style={{ background: '#FFFFFF', border: '1px solid #ECE7DC', borderRadius: 8, padding: 16 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: '#183A34', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <CreditCard size={15} />
                      Original Payment Instrument & Refund Balance
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, fontSize: 12 }}>
                      <div>
                        <div style={{ color: '#78827E', fontSize: 11 }}>Original Method</div>
                        <div style={{ fontWeight: 600, color: '#122D29', marginTop: 3 }}>
                          {(detailData.payment_method || 'online').toUpperCase()}
                        </div>
                      </div>
                      <div>
                        <div style={{ color: '#78827E', fontSize: 11 }}>Captured Amount</div>
                        <div style={{ fontWeight: 600, color: '#122D29', marginTop: 3 }}>
                          {formatINR(detailData.original_payment?.captured_amount ?? detailData.amount)}
                        </div>
                      </div>
                      <div>
                        <div style={{ color: '#78827E', fontSize: 11 }}>Captured Transaction</div>
                        <div style={{ fontWeight: 600, color: '#122D29', marginTop: 3, overflowWrap: 'anywhere' }}>
                          {detailData.original_payment?.provider_payment_id ||
                            (detailData.original_payment?.attempt_id ? `Attempt #${detailData.original_payment.attempt_id}` : 'Unavailable')}
                        </div>
                      </div>
                      <div>
                        <div style={{ color: '#78827E', fontSize: 11 }}>Prior Refunds</div>
                        <div style={{ fontWeight: 600, color: '#991B1B', marginTop: 3 }}>
                          {formatINR(detailData.original_payment?.previously_refunded ?? 0)}
                        </div>
                      </div>
                      <div>
                        <div style={{ color: '#78827E', fontSize: 11 }}>Refunds Being Processed</div>
                        <div style={{ fontWeight: 600, color: '#0369A1', marginTop: 3 }}>
                          {formatINR(detailData.original_payment?.reserved_refunds ?? 0)}
                        </div>
                      </div>
                      <div>
                        <div style={{ color: '#78827E', fontSize: 11 }}>Remaining Refundable</div>
                        <div style={{ fontWeight: 700, color: '#15803D', marginTop: 3 }}>
                          {formatINR(detailData.original_payment?.remaining_refundable ?? 0)}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Order & Delivery Prerequisite Status */}
                  <div style={{ background: '#FFFFFF', border: '1px solid #ECE7DC', borderRadius: 8, padding: 16 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: '#183A34', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Truck size={15} />
                      Order &amp; Delivery Reverse-Pickup Status
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: '#FAF8F4', borderRadius: 6, fontSize: 12 }}>
                      <div>
                        <div style={{ fontWeight: 600, color: '#183A34' }}>
                          Physical Collection: {detailData.pickup_status === 'completed' ? 'Completed' :
                            detailData.pickup_status === 'unavailable' ? 'Unavailable' : detailData.pickup_status}
                        </div>
                        <div style={{ color: '#68726E', fontSize: 11, marginTop: 2 }}>
                          {detailData.pickup_status === 'completed'
                            ? 'The reverse pickup was verified and marked completed by Order & Delivery.'
                            : detailData.pickup_status === 'unavailable'
                              ? 'No Order & Delivery pickup handoff is linked to this refund request.'
                              : `Current collection status: ${detailData.pickup_status}.`}
                        </div>
                      </div>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          padding: '3px 9px',
                          borderRadius: 4,
                          fontSize: 11,
                          fontWeight: 700,
                          backgroundColor: detailData.pickup_status === 'completed' ? '#DCFCE7' :
                            detailData.pickup_status === 'unavailable' ? '#FEE2E2' : '#FEF3C7',
                          color: detailData.pickup_status === 'completed' ? '#15803D' :
                            detailData.pickup_status === 'unavailable' ? '#991B1B' : '#B45309',
                        }}
                      >
                        {detailData.pickup_status === 'completed' ? 'Completed' :
                          detailData.pickup_status === 'unavailable' ? 'Unavailable' : detailData.pickup_status}
                      </span>
                    </div>
                  </div>

                  {/* Lifecycle Audit Events */}
                  {detailData.events && detailData.events.length > 0 && (
                    <div style={{ background: '#FFFFFF', border: '1px solid #ECE7DC', borderRadius: 8, padding: 16 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 700, color: '#183A34', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Clock size={15} />
                        Audit Events ({detailData.events.length})
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {detailData.events.map((evt, idx) => (
                          <div
                            key={idx}
                            style={{
                              padding: '8px 12px',
                              background: '#FAF8F4',
                              borderRadius: 6,
                              fontSize: 11.5,
                              borderLeft: '3px solid #183A34',
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#183A34', fontWeight: 600 }}>
                              <span>{evt.event_type || 'Event'}</span>
                              <span style={{ color: '#8E9894', fontWeight: 400 }}>
                                {evt.created_at ? new Date(evt.created_at).toLocaleString() : '—'}
                              </span>
                            </div>
                            {evt.description && <div style={{ color: '#5A6561', marginTop: 3 }}>{evt.description}</div>}
                            {evt.actor_role && (
                              <div style={{ color: '#78827E', fontSize: 10.5, marginTop: 2 }}>
                                Actor: {evt.actor_role} {evt.actor_id ? `(#${evt.actor_id})` : ''}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Right Column: Sticky Action & Authorization Panel */}
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
                    <div style={{ marginBottom: 14, padding: 12, background: '#FAF8F4', borderRadius: 6 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 12 }}>
                        <span>Payments handoff</span>
                        <StatusBadge status={detailData.handoff_status || 'unavailable'} />
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 12, marginTop: 9 }}>
                        <span>Actual refund outcome</span>
                        <StatusBadge status={detailData.refund_status || 'not initiated'} />
                      </div>
                    </div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#78827E', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      Refund Amount Due
                    </div>
                    <div style={{ fontSize: 26, fontWeight: 800, color: '#122D29', marginTop: 4, marginBottom: 12 }}>
                      {formatINR(detailData.amount ?? 0)}
                    </div>

                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
                      <span
                        style={{
                          fontSize: 11,
                          padding: '3px 8px',
                          borderRadius: 4,
                          backgroundColor: detailData.refund_timing === 'immediate' ? '#E0F2FE' : '#F5F5F4',
                          color: detailData.refund_timing === 'immediate' ? '#0369A1' : '#5A6561',
                          fontWeight: 700,
                        }}
                      >
                        {detailData.refund_timing === 'immediate' ? 'Immediate' : detailData.refund_timing === 'after_collection' ? 'After Collection' : (detailData.refund_timing || 'Unspecified')}
                      </span>

                      <span
                        style={{
                          fontSize: 11,
                          padding: '3px 8px',
                          borderRadius: 4,
                          backgroundColor: detailData.is_eligible_for_refund !== false ? '#DCFCE7' : '#FEE2E2',
                          color: detailData.is_eligible_for_refund !== false ? '#15803D' : '#991B1B',
                          fontWeight: 700,
                        }}
                      >
                        {detailData.is_eligible_for_refund !== false ? 'Eligible' : 'Precondition Ineligible'}
                      </span>
                    </div>

                    {/* Prominent Ineligibility Reason Banner */}
                    {detailData.is_eligible_for_refund === false && (
                      <div
                        style={{
                          padding: '12px 14px',
                          background: '#FFFBEB',
                          border: '1px solid #FDE68A',
                          borderRadius: 6,
                          color: '#B45309',
                          fontSize: 12,
                          marginBottom: 16,
                          lineHeight: 1.45,
                        }}
                      >
                        <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                          <ShieldAlert size={15} /> Precondition Notice
                        </div>
                        <div>
                          {detailData.ineligible_reason ||
                            (detailData.refund_timing === null
                              ? 'Refund timing is unavailable for this request. Authorized review is required before refund execution.'
                              : 'Prerequisites for refund execution are not satisfied.')}
                        </div>
                      </div>
                    )}

                    {/* Action Controls */}
                    <div style={{ borderTop: '1px solid #ECE7DC', paddingTop: 14 }}>
                      {String(detailData.status || '').toLowerCase() === 'processed' ||
                      String(detailData.status || '').toLowerCase() === 'completed' ? (
                        <div style={{ padding: '12px 14px', background: '#DCFCE7', borderRadius: 6, color: '#15803D', fontSize: 12 }}>
                          <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                            <CheckCircle2 size={16} /> Refund Completed
                          </div>
                          <div style={{ marginTop: 4, color: '#166534' }}>
                            This refund has been completed and persisted to financial ledgers.
                          </div>
                          {detailData.refund_transaction_id && (
                            <div style={{ marginTop: 4, fontFamily: 'monospace', fontSize: 11 }}>
                              Reference ID: {detailData.refund_transaction_id}
                            </div>
                          )}
                        </div>
                      ) : detailData.handoff_status === 'pending' ? (
                        <div>
                          <p style={{ margin: '0 0 10px', fontSize: 12, color: '#5A6561' }}>
                            A Payments handler must accept this handoff before executing refund.
                          </p>
                          <button
                            type="button"
                            onClick={handleAcceptHandoff}
                            disabled={acceptingHandoff}
                            style={{
                              width: '100%',
                              padding: '10px 16px',
                              backgroundColor: '#183A34',
                              color: '#FFFFFF',
                              borderRadius: 6,
                              border: 'none',
                              fontWeight: 700,
                              fontSize: 13,
                              cursor: acceptingHandoff ? 'not-allowed' : 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: 8,
                            }}
                          >
                            {acceptingHandoff ? (
                              <>
                                <RefreshCw size={14} style={{ animation: 'spin 0.8s linear infinite' }} />
                                Accepting Handoff...
                              </>
                            ) : (
                              <>
                                <Check size={15} />
                                Accept Handoff
                              </>
                            )}
                          </button>
                        </div>
                      ) : detailData.is_eligible_for_refund === false ? (
                        <div>
                          <button
                            type="button"
                            disabled
                            style={{
                              width: '100%',
                              padding: '10px 16px',
                              backgroundColor: '#F3EFE7',
                              color: '#8A8275',
                              borderRadius: 6,
                              border: '1px solid #ECE7DC',
                              fontWeight: 600,
                              fontSize: 12.5,
                              cursor: 'not-allowed',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: 8,
                            }}
                          >
                            <ShieldAlert size={14} />
                            Prerequisites Not Met
                          </button>
                          <div style={{ fontSize: 11, color: '#88928E', marginTop: 6, textAlign: 'center' }}>
                            See precondition notice above
                          </div>
                        </div>
                      ) : (
                        <div>
                          {!showConfirmModal ? (
                            <button
                              type="button"
                              onClick={() => setShowConfirmModal(true)}
                              style={{
                                width: '100%',
                                padding: '10px 16px',
                                backgroundColor: '#183A34',
                                color: '#FFFFFF',
                                borderRadius: 6,
                                border: 'none',
                                fontWeight: 700,
                                fontSize: 13,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: 8,
                              }}
                            >
                              <RotateCcw size={15} />
                              Initiate Refund
                            </button>
                          ) : (
                            <div
                              style={{
                                background: '#FFFFFF',
                                border: '1px solid #ECE7DC',
                                borderRadius: 6,
                                padding: 14,
                                display: 'flex',
                                flexDirection: 'column',
                                gap: 12,
                              }}
                            >
                              <div style={{ fontSize: 12, fontWeight: 700, color: '#183A34' }}>
                                Confirm Refund Disbursement
                              </div>
                              <div style={{ fontSize: 12, color: '#5A6561' }}>
                                Please verify that you want to release <strong>{formatINR(detailData.eligible_amount || detailData.amount)}</strong> to {detailData.customer?.name || 'the customer'}. This action communicates with the payment provider and is immutable.
                              </div>

                              <div>
                                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#78827E', marginBottom: 4 }}>
                                  External Reference / Note (Optional)
                                </label>
                                <input
                                  type="text"
                                  placeholder="Bank UTR or approval ref..."
                                  value={externalReference}
                                  onChange={(e) => setExternalReference(e.target.value)}
                                  style={{
                                    width: '100%',
                                    padding: '7px 10px',
                                    fontSize: 12,
                                    borderRadius: 4,
                                    border: '1px solid #E8E4D8',
                                    outline: 'none',
                                    boxSizing: 'border-box',
                                  }}
                                />
                              </div>

                              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
                                <button
                                  type="button"
                                  onClick={() => setShowConfirmModal(false)}
                                  disabled={actionProcessing}
                                  style={{
                                    padding: '7px 12px',
                                    background: '#FAF8F4',
                                    border: '1px solid #E8E4D8',
                                    borderRadius: 4,
                                    fontSize: 12,
                                    fontWeight: 600,
                                    color: '#5A6561',
                                    cursor: 'pointer',
                                  }}
                                >
                                  Cancel
                                </button>
                                <button
                                  type="button"
                                  onClick={handleExecuteRefund}
                                  disabled={actionProcessing}
                                  style={{
                                    padding: '7px 14px',
                                    background: '#15803D',
                                    border: 'none',
                                    borderRadius: 4,
                                    fontSize: 12,
                                    fontWeight: 700,
                                    color: '#FFFFFF',
                                    cursor: actionProcessing ? 'not-allowed' : 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 6,
                                  }}
                                >
                                  {actionProcessing ? (
                                    <>
                                      <RefreshCw size={13} style={{ animation: 'spin 0.8s linear infinite' }} />
                                      Processing...
                                    </>
                                  ) : (
                                    <>
                                      <Check size={14} />
                                      Confirm & Process
                                    </>
                                  )}
                                </button>
                              </div>
                            </div>
                          )}
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

export default PaymentRefundManagementView;
