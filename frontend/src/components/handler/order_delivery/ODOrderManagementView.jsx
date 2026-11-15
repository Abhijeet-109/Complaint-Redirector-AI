import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Search,
  RefreshCw,
  X,
  Package,
  Calendar,
  User,
  MapPin,
  CheckCircle2,
  ChevronRight,
  Filter,
  CreditCard,
} from 'lucide-react';
import { handlerService } from '../../../services/handlerService';
import { HandlerPagination } from '../HandlerPagination';

function formatINR(amount) {
  const num = parseFloat(amount) || 0;
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(num);
}

function StatusBadge({ status }) {
  const statusConfig = {
    placed: { bg: '#E0F2FE', color: '#0369A1', label: 'Placed' },
    accepted: { bg: '#E0F2FE', color: '#0369A1', label: 'Accepted' },
    processing: { bg: '#FEF3C7', color: '#B45309', label: 'Processing' },
    packed: { bg: '#EDE9FE', color: '#6D28D9', label: 'Packed' },
    ready_to_ship: { bg: '#DCFCE7', color: '#15803D', label: 'Ready to Ship' },
    cancelled: { bg: '#F5F5F4', color: '#78716C', label: 'Cancelled' },
    delivered: { bg: '#DCFCE7', color: '#15803D', label: 'Delivered' },
  };
  const key = String(status || '').toLowerCase();
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

function PaymentBadge({ status }) {
  const config = {
    captured: { bg: '#DCFCE7', color: '#15803D', label: 'Captured' },
    pending: { bg: '#FEF3C7', color: '#B45309', label: 'Pending' },
    failed: { bg: '#FEF2F2', color: '#991B1B', label: 'Failed' },
  }[String(status || '').toLowerCase()] || { bg: '#F5F5F4', color: '#78716C', label: status || '—' };

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '2px 7px',
        borderRadius: 4,
        fontSize: 10.5,
        fontWeight: 600,
        backgroundColor: config.bg,
        color: config.color,
      }}
    >
      {config.label}
    </span>
  );
}

export function ODOrderManagementView({ onNavigate }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [actionError, setActionError] = useState('');
  const [actionSuccess, setActionSuccess] = useState('');

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [paymentFilter, setPaymentFilter] = useState('all');
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [selectedNextStatus, setSelectedNextStatus] = useState('');
  const [operationalNote, setOperationalNote] = useState('');
  const [updating, setUpdating] = useState(false);

  // Pagination
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);

  const loadOrders = useCallback(async () => {
    try {
      setRefreshing(true);
      setError(null);
      const res = await handlerService.getOrderDeliveryOrders({
        limit: 100,
      });
      setOrders(res.items || []);
    } catch (err) {
      console.error('Failed to load orders:', err);
      setError(err.message || 'Error loading orders from backend.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  const handleRefresh = () => {
    loadOrders();
  };

  const handleResetFilters = () => {
    setSearchTerm('');
    setStatusFilter('all');
    setPaymentFilter('all');
    setPage(1);
  };

  // Filtered orders
  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      if (statusFilter !== 'all' && order.status !== statusFilter) return false;
      if (paymentFilter !== 'all' && order.payment_status !== paymentFilter) return false;
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const matchesNum = (order.order_number || '').toLowerCase().includes(q);
        const matchesCust = (order.customer_name || '').toLowerCase().includes(q);
        const matchesProd = (order.items || []).some((it) => (it.product_name || '').toLowerCase().includes(q));
        if (!matchesNum && !matchesCust && !matchesProd) return false;
      }
      return true;
    });
  }, [orders, statusFilter, paymentFilter, searchTerm]);

  // Stage counts for the queue strip
  const stageCounts = useMemo(() => {
    const counts = { all: orders.length, placed: 0, accepted: 0, processing: 0, packed: 0, ready_to_ship: 0 };
    orders.forEach((ord) => {
      if (counts[ord.status] !== undefined) {
        counts[ord.status] += 1;
      }
    });
    return counts;
  }, [orders]);

  // Paginated subset
  const paginatedOrders = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredOrders.slice(start, start + pageSize);
  }, [filteredOrders, page, pageSize]);

  const totalPages = Math.ceil(filteredOrders.length / pageSize) || 1;

  const handleOpenDetail = (order) => {
    setSelectedOrder(order);
    setSelectedNextStatus(order.next_status_options?.[0] || '');
    setOperationalNote('');
    setActionError('');
    setActionSuccess('');
  };

  const handleCloseDetail = () => {
    setSelectedOrder(null);
    setSelectedNextStatus('');
    setOperationalNote('');
    setActionError('');
    setActionSuccess('');
  };

  const handleStatusUpdate = async () => {
    if (!selectedOrder || !selectedNextStatus || updating) return;
    setUpdating(true);
    setActionError('');
    setActionSuccess('');
    try {
      await handlerService.updateOrderDeliveryOrderStatus(
        selectedOrder.id,
        selectedNextStatus,
        operationalNote.trim() || undefined
      );
      setActionSuccess(`Order updated to ${selectedNextStatus.replace(/_/g, ' ')}`);
      await loadOrders();
      // Update currently open detail record
      setSelectedOrder((prev) => (prev ? { ...prev, status: selectedNextStatus } : null));
    } catch (err) {
      setActionError(err.message || 'Status transition failed.');
    } finally {
      setUpdating(false);
    }
  };

  return (
    <div style={{ padding: '0 4px 30px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: '#122D29', margin: 0, letterSpacing: '-0.02em' }}>
            Order Management
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#68726E' }}>
            Review and advance customer orders through preparation up to ready to ship.
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 12, color: '#68726E' }}>
            Showing <strong>{filteredOrders.length}</strong> of {orders.length} orders
          </span>
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

      {/* Queue Stage Summary Strip / Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, overflowX: 'auto', paddingBottom: 4 }}>
        {[
          { key: 'all', label: 'All Orders' },
          { key: 'placed', label: 'Placed' },
          { key: 'accepted', label: 'Accepted' },
          { key: 'processing', label: 'Processing' },
          { key: 'packed', label: 'Packed' },
          { key: 'ready_to_ship', label: 'Ready to Ship' },
        ].map(({ key, label }) => {
          const isActive = statusFilter === key;
          const count = stageCounts[key] ?? 0;
          return (
            <button
              key={key}
              type="button"
              onClick={() => {
                setStatusFilter(key);
                setPage(1);
              }}
              style={{
                border: '1px solid',
                borderColor: isActive ? '#183A34' : '#E8E4D8',
                backgroundColor: isActive ? '#183A34' : '#FFFFFF',
                color: isActive ? '#FFFFFF' : '#3A423F',
                borderRadius: 6,
                padding: '7px 14px',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                whiteSpace: 'nowrap',
                transition: 'all 0.15s ease',
              }}
            >
              <span>{label}</span>
              <span
                style={{
                  backgroundColor: isActive ? 'rgba(255,255,255,0.2)' : '#F0ECE1',
                  color: isActive ? '#FFFFFF' : '#122D29',
                  padding: '1px 6px',
                  borderRadius: 999,
                  fontSize: 10.5,
                }}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Toolbar Filter Card */}
      <div
        style={{
          background: '#FFFFFF',
          border: '1px solid #E8E4D8',
          borderRadius: 8,
          padding: '14px 18px',
          marginBottom: 16,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        {/* Search */}
        <div style={{ position: 'relative', flex: '1 1 240px', minWidth: 200 }}>
          <Search size={14} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: '#88928E' }} />
          <input
            type="text"
            placeholder="Search order #, customer, item..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setPage(1);
            }}
            style={{
              width: '100%',
              padding: '7px 10px 7px 32px',
              border: '1px solid #E8E4D8',
              borderRadius: 6,
              fontSize: 12.5,
              outline: 'none',
              backgroundColor: '#FAF7F2',
            }}
          />
        </div>

        {/* Payment Filter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11.5, color: '#5A6460', fontWeight: 500 }}>Payment:</span>
          <select
            value={paymentFilter}
            onChange={(e) => {
              setPaymentFilter(e.target.value);
              setPage(1);
            }}
            style={{
              padding: '6px 10px',
              border: '1px solid #E8E4D8',
              borderRadius: 6,
              fontSize: 12,
              background: '#FFFFFF',
              color: '#122D29',
              outline: 'none',
            }}
          >
            <option value="all">All Payment Statuses</option>
            <option value="captured">Captured</option>
            <option value="pending">Pending</option>
            <option value="failed">Failed</option>
          </select>
        </div>

        {/* Reset button */}
        {(searchTerm || statusFilter !== 'all' || paymentFilter !== 'all') && (
          <button
            type="button"
            onClick={handleResetFilters}
            style={{
              background: 'none',
              border: 'none',
              color: '#88928E',
              fontSize: 11.5,
              fontWeight: 600,
              cursor: 'pointer',
              textDecoration: 'underline',
            }}
          >
            Reset filters
          </button>
        )}
      </div>

      {/* Main Table Card */}
      <div style={{ background: '#FFFFFF', border: '1px solid #E8E4D8', borderRadius: 8, overflow: 'hidden' }}>
        {loading && orders.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#68726E', fontSize: 13 }}>
            Loading orders...
          </div>
        ) : filteredOrders.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#68726E' }}>
            <p style={{ margin: 0, fontWeight: 600, fontSize: 14 }}>No orders found</p>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: '#88928E' }}>
              Try adjusting your search or active filters.
            </p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, textAlign: 'left' }}>
              <thead>
                <tr style={{ background: '#FAF7F2', borderBottom: '1px solid #E8E4D8', color: '#5A6460', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  <th style={{ padding: '10px 16px', fontWeight: 600 }}>Order Number</th>
                  <th style={{ padding: '10px 16px', fontWeight: 600 }}>Date</th>
                  <th style={{ padding: '10px 16px', fontWeight: 600 }}>Customer</th>
                  <th style={{ padding: '10px 16px', fontWeight: 600 }}>Items Summary</th>
                  <th style={{ padding: '10px 16px', fontWeight: 600, textAlign: 'right' }}>Amount</th>
                  <th style={{ padding: '10px 16px', fontWeight: 600 }}>Payment</th>
                  <th style={{ padding: '10px 16px', fontWeight: 600 }}>Order Status</th>
                  <th style={{ padding: '10px 16px', fontWeight: 600, textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {paginatedOrders.map((ord) => {
                  const itemsSummary = (ord.items || [])
                    .map((it) => `${it.product_name} × ${it.quantity}`)
                    .join(', ') || ord.product_summary || '—';

                  return (
                    <tr
                      key={ord.id}
                      style={{ borderBottom: '1px solid #F0ECE1', transition: 'background-color 0.1s' }}
                      onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#FAF7F2'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                    >
                      <td style={{ padding: '12px 16px', fontWeight: 700, color: '#122D29' }}>
                        {ord.order_number}
                      </td>
                      <td style={{ padding: '12px 16px', color: '#68726E', whiteSpace: 'nowrap' }}>
                        {ord.created_at ? new Date(ord.created_at).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                      </td>
                      <td style={{ padding: '12px 16px', color: '#2B322F', fontWeight: 500 }}>
                        {ord.customer_name || 'Customer'}
                      </td>
                      <td style={{ padding: '12px 16px', color: '#5A6460', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={itemsSummary}>
                        {itemsSummary}
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, color: '#122D29', fontVariantNumeric: 'tabular-nums' }}>
                        {formatINR(ord.total_amount)}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: 11, color: '#5A6460', textTransform: 'uppercase' }}>{ord.payment_method || 'COD'}</span>
                          <PaymentBadge status={ord.payment_status} />
                        </div>
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <StatusBadge status={ord.status} />
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                        <button
                          type="button"
                          onClick={() => handleOpenDetail(ord)}
                          style={{
                            background: '#FFFFFF',
                            border: '1px solid #E8E4D8',
                            borderRadius: 5,
                            padding: '4px 10px',
                            fontSize: 11,
                            fontWeight: 600,
                            color: '#183A34',
                            cursor: 'pointer',
                          }}
                        >
                          Manage
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Standardized Shared Pagination */}
        <HandlerPagination
          currentPage={page}
          pageSize={pageSize}
          totalItems={filteredOrders.length}
          onPageChange={(p) => setPage(p)}
          onPageSizeChange={(sz) => {
            setPageSize(sz);
            setPage(1);
          }}
          pageSizeOptions={[5, 10, 15, 20, 50]}
        />
      </div>

      {/* Right-Side Order Detail Drawer */}
      {selectedOrder && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            right: 0,
            bottom: 0,
            width: 480,
            maxWidth: '100vw',
            backgroundColor: '#FFFFFF',
            boxShadow: '-4px 0 24px rgba(18, 45, 41, 0.15)',
            zIndex: 100,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* Drawer Header */}
          <div style={{ padding: '18px 22px', borderBottom: '1px solid #E8E4D8', display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#FAF7F2' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <h2 style={{ fontSize: 17, fontWeight: 800, color: '#122D29', margin: 0 }}>
                  {selectedOrder.order_number}
                </h2>
                <StatusBadge status={selectedOrder.status} />
              </div>
              <span style={{ fontSize: 11.5, color: '#68726E' }}>
                Placed {selectedOrder.created_at ? new Date(selectedOrder.created_at).toLocaleString('en-IN') : '—'}
              </span>
            </div>
            <button
              type="button"
              onClick={handleCloseDetail}
              style={{ background: 'none', border: 'none', color: '#68726E', cursor: 'pointer', padding: 4 }}
            >
              <X size={18} />
            </button>
          </div>

          {/* Drawer Body */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '20px 22px' }}>
            {actionSuccess && (
              <div style={{ backgroundColor: '#DCFCE7', color: '#15803D', padding: '9px 12px', borderRadius: 6, fontSize: 12, marginBottom: 14, fontWeight: 500 }}>
                {actionSuccess}
              </div>
            )}
            {actionError && (
              <div style={{ backgroundColor: '#FEE2E2', color: '#991B1B', padding: '9px 12px', borderRadius: 6, fontSize: 12, marginBottom: 14, fontWeight: 500 }}>
                {actionError}
              </div>
            )}

            {/* Customer & Address */}
            <div style={{ marginBottom: 18, borderBottom: '1px solid #F0ECE1', paddingBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#88928E', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>
                Customer &amp; Delivery Destination
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, color: '#122D29', marginBottom: 4 }}>
                <User size={15} color="#5A6460" />
                <span>{selectedOrder.customer_name || 'Customer'}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12, color: '#5A6460' }}>
                <MapPin size={15} color="#88928E" style={{ flexShrink: 0, marginTop: 2 }} />
                <span>
                  {selectedOrder.delivery_address ? (
                    [
                      selectedOrder.delivery_address.street,
                      selectedOrder.delivery_address.locality,
                      selectedOrder.delivery_address.city,
                      selectedOrder.delivery_address.state,
                      selectedOrder.delivery_address.pin_code,
                    ].filter(Boolean).join(', ')
                  ) : (
                    'Address on file'
                  )}
                </span>
              </div>
            </div>

            {/* Line items */}
            <div style={{ marginBottom: 18, borderBottom: '1px solid #F0ECE1', paddingBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#88928E', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 10 }}>
                Order Items ({(selectedOrder.items || []).length})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {(selectedOrder.items || []).map((item, idx) => (
                  <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12.5 }}>
                    <div>
                      <div style={{ fontWeight: 600, color: '#122D29' }}>{item.product_name}</div>
                      <div style={{ fontSize: 11, color: '#88928E' }}>
                        Qty: {item.quantity} {item.variant_name ? `· Variant: ${item.variant_name}` : ''}
                      </div>
                    </div>
                    <div style={{ fontWeight: 700, color: '#122D29', fontVariantNumeric: 'tabular-nums' }}>
                      {formatINR(item.unit_price * item.quantity)}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Financial Summary */}
            <div style={{ marginBottom: 20, borderBottom: '1px solid #F0ECE1', paddingBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                <span style={{ color: '#5A6460' }}>Grand Total</span>
                <span style={{ fontWeight: 800, color: '#122D29', fontSize: 15, fontVariantNumeric: 'tabular-nums' }}>
                  {formatINR(selectedOrder.total_amount)}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: '#7A8480' }}>
                <span>Payment Method &amp; Status</span>
                <span>
                  {(selectedOrder.payment_method || 'COD').toUpperCase()} · {selectedOrder.payment_status || 'Pending'}
                </span>
              </div>
            </div>

            {/* Workflow Action Box */}
            <div style={{ background: '#FAF7F2', border: '1px solid #E8E4D8', borderRadius: 8, padding: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#122D29', marginBottom: 8 }}>
                Advance Order Preparation
              </div>

              {selectedOrder.status === 'ready_to_ship' ? (
                <div style={{ fontSize: 12, color: '#15803D', lineHeight: 1.4 }}>
                  <CheckCircle2 size={16} style={{ display: 'inline', marginRight: 4, verticalAlign: 'text-bottom' }} />
                  Order is <strong>Ready to Ship</strong>. Outbound dispatch and carrier transitions are managed in <strong>Shipment Management</strong>.
                </div>
              ) : (selectedOrder.next_status_options || []).length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#5A6460', marginBottom: 4 }}>
                      Next Order Stage:
                    </label>
                    <select
                      value={selectedNextStatus}
                      onChange={(e) => setSelectedNextStatus(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '8px 10px',
                        border: '1px solid #D6CEB5',
                        borderRadius: 6,
                        fontSize: 12.5,
                        backgroundColor: '#FFFFFF',
                      }}
                    >
                      {(selectedOrder.next_status_options || []).map((st) => (
                        <option key={st} value={st}>
                          {st.replace(/_/g, ' ').toUpperCase()}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#5A6460', marginBottom: 4 }}>
                      Operational Note (Optional):
                    </label>
                    <textarea
                      rows={2}
                      value={operationalNote}
                      onChange={(e) => setOperationalNote(e.target.value)}
                      placeholder="Add an internal note for this stage..."
                      style={{
                        width: '100%',
                        padding: '7px 10px',
                        border: '1px solid #D6CEB5',
                        borderRadius: 6,
                        fontSize: 12,
                        backgroundColor: '#FFFFFF',
                        resize: 'none',
                      }}
                    />
                  </div>

                  <button
                    type="button"
                    onClick={handleStatusUpdate}
                    disabled={updating || !selectedNextStatus}
                    style={{
                      background: '#183A34',
                      color: '#FFFFFF',
                      border: 'none',
                      borderRadius: 6,
                      padding: '9px 16px',
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: updating ? 'not-allowed' : 'pointer',
                      marginTop: 4,
                      opacity: updating ? 0.7 : 1,
                    }}
                  >
                    {updating ? 'Updating...' : `Confirm Stage: ${selectedNextStatus.replace(/_/g, ' ')}`}
                  </button>
                </div>
              ) : (
                <p style={{ margin: 0, fontSize: 12, color: '#88928E' }}>
                  No further order transitions available for this status.
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ODOrderManagementView;

