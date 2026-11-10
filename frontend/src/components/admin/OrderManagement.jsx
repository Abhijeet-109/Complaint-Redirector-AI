import React, { useState, useEffect, useCallback } from 'react';
import {
  ShoppingBag, Search, Filter, RefreshCw, ChevronRight, X,
  Clock, Truck, CreditCard, User, MapPin, AlertCircle, CheckCircle2,
  Calendar, ArrowRight, ExternalLink,
} from 'lucide-react';
import { adminService } from '../../services/adminService';

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatINR(amount) {
  const num = parseFloat(amount) || 0;
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(num);
}

function formatINRDecimals(amount) {
  const num = parseFloat(amount) || 0;
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num);
}

const STATUS_CONFIG = {
  pending: { bg: '#FEF3C7', color: '#B45309', label: 'Pending' },
  processing: { bg: '#CCFBF1', color: '#0F766E', label: 'Processing' },
  packed: { bg: '#EDE9FE', color: '#6D28D9', label: 'Packed' },
  shipped: { bg: '#CFFAFE', color: '#0E7490', label: 'Shipped' },
  out_for_delivery: { bg: '#FFEDD5', color: '#C2410C', label: 'Out for Delivery' },
  delivered: { bg: '#DCFCE7', color: '#15803D', label: 'Delivered' },
  cancelled: { bg: '#F5F5F4', color: '#78716C', label: 'Cancelled' },
  placed: { bg: '#DCFCE7', color: '#15803D', label: 'Placed' },
  pending_payment: { bg: '#FEF3C7', color: '#B45309', label: 'Pending Payment' },
  payment_failed: { bg: '#FEF2F2', color: '#991B1B', label: 'Payment Failed' },
  captured: { bg: '#DCFCE7', color: '#15803D', label: 'Captured' },
  failed: { bg: '#FEF2F2', color: '#991B1B', label: 'Failed' },
  refunded: { bg: '#FEF2F2', color: '#991B1B', label: 'Refunded' },
  partially_refunded: { bg: '#FEF3C7', color: '#B45309', label: 'Partially Refunded' },
};

function StatusBadge({ status }) {
  const config = STATUS_CONFIG[status?.toLowerCase()] || { bg: '#F5F5F4', color: '#78716C', label: status || 'Unknown' };
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      backgroundColor: config.bg, color: config.color,
      padding: '3px 8px', borderRadius: 9999, fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap',
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: config.color, flexShrink: 0 }} />
      {config.label}
    </span>
  );
}

const VALID_TRANSITIONS = {
  placed: ['processing', 'cancelled'],
  processing: ['packed', 'cancelled'],
  packed: ['shipped', 'cancelled'],
  shipped: ['out_for_delivery'],
  out_for_delivery: ['delivered'],
  delivered: [],
  cancelled: [],
  pending_payment: [],
  payment_failed: [],
};

const SHIPMENT_STATUSES = ['pending', 'shipped', 'out_for_delivery', 'delivered'];

// ─── Main Component ──────────────────────────────────────────────────────────

export function OrderManagement({ focusedOrderId = null, onClearFocusedOrder }) {
  const [orders, setOrders] = useState([]);
  const [total, setTotal] = useState(0);
  const [nextCursor, setNextCursor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [toast, setToast] = useState(null);
  const [highlightOrderId, setHighlightOrderId] = useState(focusedOrderId);

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [paymentStatusFilter, setPaymentStatusFilter] = useState('');
  const [paymentMethodFilter, setPaymentMethodFilter] = useState('');
  const [shipmentStatusFilter, setShipmentStatusFilter] = useState('');

  // Selected Order Drawer
  const [selectedOrderId, setSelectedOrderId] = useState(null);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Status Update State
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [targetStatus, setTargetStatus] = useState('');

  // Shipment Update State
  const [updatingShipment, setUpdatingShipment] = useState(false);
  const [carrier, setCarrier] = useState('');
  const [trackingRef, setTrackingRef] = useState('');
  const [trackingUrl, setTrackingUrl] = useState('');
  const [estimatedDelivery, setEstimatedDelivery] = useState('');
  const [shipmentStatus, setShipmentStatus] = useState('');
  const [shipmentNotes, setShipmentNotes] = useState('');

  // Handle focused order highlight and auto-scroll
  useEffect(() => {
    if (focusedOrderId) {
      setHighlightOrderId(focusedOrderId);
      const timer = setTimeout(() => {
        const el = document.getElementById(`order-row-${focusedOrderId}`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 150);
      const clearTimer = setTimeout(() => {
        setHighlightOrderId(null);
        if (onClearFocusedOrder) onClearFocusedOrder();
      }, 2500);
      return () => {
        clearTimeout(timer);
        clearTimeout(clearTimer);
      };
    }
  }, [focusedOrderId, orders, onClearFocusedOrder]);

  const showToast = (type, message) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  // Fetch Orders
  const fetchOrders = useCallback(async (isLoadMore = false, cursor = null) => {
    if (isLoadMore) setLoadingMore(true);
    else setLoading(true);

    try {
      const params = { limit: 20 };
      if (search.trim()) params.search = search.trim();
      if (statusFilter) params.status = statusFilter;
      if (paymentStatusFilter) params.payment_status = paymentStatusFilter;
      if (paymentMethodFilter) params.payment_method = paymentMethodFilter;
      if (shipmentStatusFilter) params.shipment_status = shipmentStatusFilter;
      if (cursor) params.cursor_id = cursor;

      const res = await adminService.getAdminOrders(params);
      if (isLoadMore) {
        setOrders(prev => [...prev, ...(res.items || [])]);
      } else {
        setOrders(res.items || []);
        setTotal(res.total || 0);
      }
      setNextCursor(res.next_cursor || null);
    } catch (err) {
      showToast('error', err.message || 'Failed to load orders');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [search, statusFilter, paymentStatusFilter, paymentMethodFilter, shipmentStatusFilter]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchOrders(false, null);
    }, 250);
    return () => clearTimeout(timer);
  }, [fetchOrders]);

  // Load Order Detail
  const openOrderDetail = async (orderId) => {
    setSelectedOrderId(orderId);
    setLoadingDetail(true);
    try {
      const detail = await adminService.getAdminOrderDetail(orderId);
      setSelectedOrder(detail);
      setTargetStatus('');
      if (detail.shipment) {
        setCarrier(detail.shipment.carrier || '');
        setTrackingRef(detail.shipment.tracking_reference || '');
        setTrackingUrl(detail.shipment.tracking_url || '');
        setEstimatedDelivery(detail.shipment.estimated_delivery_date ? detail.shipment.estimated_delivery_date.slice(0, 10) : '');
        setShipmentStatus(detail.shipment.status || 'pending');
        setShipmentNotes(detail.shipment.notes || '');
      } else {
        setCarrier('');
        setTrackingRef('');
        setTrackingUrl('');
        setEstimatedDelivery('');
        setShipmentStatus('pending');
        setShipmentNotes('');
      }
    } catch (err) {
      showToast('error', err.message || 'Failed to load order details');
      setSelectedOrderId(null);
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleUpdateOrderStatus = async () => {
    if (!targetStatus || !selectedOrder) return;
    setUpdatingStatus(true);
    try {
      await adminService.updateOrderStatus(selectedOrder.id, targetStatus);
      showToast('success', `Order status updated to ${targetStatus}`);
      // Refresh detail and list
      const updated = await adminService.getAdminOrderDetail(selectedOrder.id);
      setSelectedOrder(updated);
      fetchOrders(false, null);
    } catch (err) {
      showToast('error', err.message || 'Failed to update order status');
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleUpdateShipment = async () => {
    if (!selectedOrder) return;
    setUpdatingShipment(true);
    try {
      const payload = {
        status: shipmentStatus,
        carrier: carrier.trim() || null,
        tracking_reference: trackingRef.trim() || null,
        tracking_url: trackingUrl.trim() || null,
        estimated_delivery_date: estimatedDelivery ? new Date(estimatedDelivery).toISOString() : null,
        notes: shipmentNotes.trim() || null,
      };
      await adminService.updateShipment(selectedOrder.id, payload);
      showToast('success', 'Shipment tracking updated successfully');
      // Refresh detail and list
      const updated = await adminService.getAdminOrderDetail(selectedOrder.id);
      setSelectedOrder(updated);
      fetchOrders(false, null);
    } catch (err) {
      showToast('error', err.message || 'Failed to update shipment');
    } finally {
      setUpdatingShipment(false);
    }
  };

  const validNextStates = selectedOrder ? (VALID_TRANSITIONS[selectedOrder.status] || []) : [];

  return (
    <div className="sd-dashboard">
      {/* Toast Alert */}
      {toast && (
        <div className={`hd-toast ${toast.type}`}>
          <span>{toast.message}</span>
          <button className="hd-toast-close" onClick={() => setToast(null)}>✕</button>
        </div>
      )}

      {/* Header */}
      <div className="sd-page-header">
        <div>
          <h1 className="sd-page-title">Orders & Shipments</h1>
          <p className="sd-page-subtitle">Track, fulfill, and manage customer orders across all channels</p>
        </div>
        <button className="sd-refresh-btn" onClick={() => fetchOrders(false, null)} disabled={loading}>
          <RefreshCw size={15} className={loading ? 'sd-spinning' : ''} />
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {/* Filters Toolbar */}
      <div className="sd-card" style={{ marginBottom: 16, padding: '16px 20px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
          {/* Search */}
          <div style={{ position: 'relative', flex: '1 1 240px', minWidth: 200 }}>
            <Search size={16} color="#A8A293" style={{ position: 'absolute', left: 12, top: 11 }} />
            <input
              type="text"
              placeholder="Search by order number (e.g. FK-...)"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{
                width: '100%', height: 38, padding: '0 12px 0 36px',
                borderRadius: 8, border: '1px solid #E5DFC8',
                fontSize: 13, background: '#FFFFFF', color: '#1D1C17',
              }}
            />
          </div>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            style={{ height: 38, padding: '0 12px', borderRadius: 8, border: '1px solid #E5DFC8', fontSize: 13, background: '#FFFFFF', color: '#1D1C17' }}
          >
            <option value="">All Order Statuses</option>
            <option value="placed">Placed</option>
            <option value="processing">Processing</option>
            <option value="packed">Packed</option>
            <option value="shipped">Shipped</option>
            <option value="out_for_delivery">Out for Delivery</option>
            <option value="delivered">Delivered</option>
            <option value="cancelled">Cancelled</option>
            <option value="pending_payment">Pending Payment</option>
            <option value="payment_failed">Payment Failed</option>
          </select>

          {/* Shipment Status */}
          <select
            value={shipmentStatusFilter}
            onChange={e => setShipmentStatusFilter(e.target.value)}
            style={{ height: 38, padding: '0 12px', borderRadius: 8, border: '1px solid #E5DFC8', fontSize: 13, background: '#FFFFFF', color: '#1D1C17' }}
          >
            <option value="">All Shipment States</option>
            <option value="pending">Pending</option>
            <option value="shipped">Shipped</option>
            <option value="out_for_delivery">Out for Delivery</option>
            <option value="delivered">Delivered</option>
          </select>

          {/* Payment Method */}
          <select
            value={paymentMethodFilter}
            onChange={e => setPaymentMethodFilter(e.target.value)}
            style={{ height: 38, padding: '0 12px', borderRadius: 8, border: '1px solid #E5DFC8', fontSize: 13, background: '#FFFFFF', color: '#1D1C17' }}
          >
            <option value="">All Payment Methods</option>
            <option value="cod">Cash on Delivery</option>
            <option value="razorpay">Razorpay</option>
            <option value="upi">UPI</option>
            <option value="netbanking">Net Banking</option>
          </select>

          {/* Payment Status */}
          <select
            value={paymentStatusFilter}
            onChange={e => setPaymentStatusFilter(e.target.value)}
            style={{ height: 38, padding: '0 12px', borderRadius: 8, border: '1px solid #E5DFC8', fontSize: 13, background: '#FFFFFF', color: '#1D1C17' }}
          >
            <option value="">All Payment Statuses</option>
            <option value="pending">Pending</option>
            <option value="captured">Captured / Paid</option>
            <option value="failed">Failed</option>
            <option value="refunded">Refunded</option>
          </select>
        </div>
      </div>

      {/* Orders Table Card */}
      <div className="sd-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #F0EBDC', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#122D29' }}>
            Orders ({total} total)
          </span>
        </div>

        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 48, gap: 10 }}>
            <div style={{ width: 24, height: 24, border: '2px solid #E5DFC8', borderTopColor: '#122D29', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
            <span style={{ color: '#8B8578', fontSize: 13 }}>Loading orders...</span>
          </div>
        ) : orders.length === 0 ? (
          <div className="sd-empty" style={{ padding: 48 }}>No orders found matching the criteria.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#FDFCFA', borderBottom: '1px solid #E5DFC8', color: 'rgba(18,45,41,0.6)', textTransform: 'uppercase', fontSize: 11, letterSpacing: '0.04em' }}>
                  <th style={{ padding: '12px 16px' }}>Order Number</th>
                  <th style={{ padding: '12px 16px' }}>Date</th>
                  <th style={{ padding: '12px 16px' }}>Items</th>
                  <th style={{ padding: '12px 16px' }}>Amount</th>
                  <th style={{ padding: '12px 16px' }}>Payment</th>
                  <th style={{ padding: '12px 16px' }}>Order Status</th>
                  <th style={{ padding: '12px 16px' }}>Shipment</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {orders.map(order => {
                  const isHighlighted = highlightOrderId === order.id || highlightOrderId === order.order_number;
                  return (
                    <tr
                      id={`order-row-${order.id}`}
                      key={order.id}
                      style={{
                        borderBottom: '1px solid #F0EBDC',
                        background: isHighlighted ? '#FEF9C3' : 'transparent',
                        boxShadow: isHighlighted ? 'inset 3px 0 0 #C2A15A' : 'none',
                        transition: 'background 0.2s ease',
                        cursor: 'pointer',
                      }}
                      onClick={() => openOrderDetail(order.id)}
                      className={isHighlighted ? '' : 'sd-table-row-hover'}
                    >
                    <td style={{ padding: '12px 16px', fontWeight: 600, color: '#122D29' }}>
                      {order.order_number}
                    </td>
                    <td style={{ padding: '12px 16px', color: '#5C5A54', whiteSpace: 'nowrap' }}>
                      {order.created_at ? new Date(order.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                    </td>
                    <td style={{ padding: '12px 16px', color: '#5C5A54', maxWidth: 220 }}>
                      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {order.product_summary || `${order.item_count || 1} item(s)`}
                      </div>
                    </td>
                    <td style={{ padding: '12px 16px', fontWeight: 700, color: '#122D29', fontVariantNumeric: 'tabular-nums' }}>
                      {formatINRDecimals(order.total_amount)}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <span style={{ fontSize: 11, color: '#8B8578', fontWeight: 600, textTransform: 'uppercase' }}>
                          {order.payment_method || '—'}
                        </span>
                        <StatusBadge status={order.payment_status} />
                      </div>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <StatusBadge status={order.status} />
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <StatusBadge status={order.shipment_status || 'pending'} />
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                      <button
                        onClick={(e) => { e.stopPropagation(); openOrderDetail(order.id); }}
                        style={{
                          background: '#F5F0E8', border: '1px solid #E5DFC8', borderRadius: 6,
                          padding: '6px 12px', fontSize: 12, fontWeight: 600, color: '#122D29',
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

        {/* Load More */}
        {nextCursor && (
          <div style={{ padding: '16px 20px', textAlign: 'center', borderTop: '1px solid #F0EBDC' }}>
            <button
              onClick={() => fetchOrders(true, nextCursor)}
              disabled={loadingMore}
              style={{
                background: '#FFFFFF', border: '1px solid #E5DFC8', borderRadius: 8,
                padding: '8px 24px', fontSize: 13, fontWeight: 600, color: '#122D29',
                cursor: 'pointer',
              }}
            >
              {loadingMore ? 'Loading more...' : 'Load More Orders'}
            </button>
          </div>
        )}
      </div>

      {/* Order Details Drawer / Modal */}
      {selectedOrderId && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(18, 45, 41, 0.4)', backdropFilter: 'blur(4px)',
          zIndex: 100, display: 'flex', justifyContent: 'flex-end',
        }}>
          <div style={{
            width: '100%', maxWidth: 640, height: '100%', background: '#F5F0E8',
            boxShadow: '-4px 0 20px rgba(0,0,0,0.15)', display: 'flex', flexDirection: 'column',
            overflowY: 'auto',
          }}>
            {/* Drawer Header */}
            <div style={{
              padding: '16px 24px', background: '#FFFFFF', borderBottom: '1px solid #E5DFC8',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 10,
            }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#8B8578', textTransform: 'uppercase' }}>
                  Order Details
                </div>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#122D29', fontFamily: 'Plus Jakarta Sans' }}>
                  {selectedOrder?.order_number || `Order #${selectedOrderId}`}
                </div>
              </div>
              <button
                onClick={() => { setSelectedOrderId(null); setSelectedOrder(null); }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 6, color: '#5C5A54' }}
              >
                <X size={20} />
              </button>
            </div>

            {loadingDetail ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, gap: 10 }}>
                <div style={{ width: 24, height: 24, border: '2px solid #E5DFC8', borderTopColor: '#122D29', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                <span>Loading order details...</span>
              </div>
            ) : selectedOrder ? (
              <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>

                {/* Status & Transitions Card */}
                <div className="sd-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                    <div>
                      <div className="sd-card-label">Order Fulfilment Status</div>
                      <div style={{ marginTop: 4 }}>
                        <StatusBadge status={selectedOrder.status} />
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div className="sd-card-label">Payment Status</div>
                      <div style={{ marginTop: 4 }}>
                        <StatusBadge status={selectedOrder.payment_status} />
                      </div>
                    </div>
                  </div>

                  {validNextStates.length > 0 && (
                    <div style={{ background: '#F5F0E8', padding: 12, borderRadius: 8, border: '1px solid #E5DFC8' }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#122D29', marginBottom: 8 }}>
                        Update Fulfilment Stage:
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <select
                          value={targetStatus}
                          onChange={e => setTargetStatus(e.target.value)}
                          style={{ flex: 1, height: 36, padding: '0 10px', borderRadius: 6, border: '1px solid #E5DFC8', fontSize: 13, background: '#fff' }}
                        >
                          <option value="">Select next status...</option>
                          {validNextStates.map(s => (
                            <option key={s} value={s}>{s.replace(/_/g, ' ').toUpperCase()}</option>
                          ))}
                        </select>
                        <button
                          onClick={handleUpdateOrderStatus}
                          disabled={!targetStatus || updatingStatus}
                          style={{
                            background: '#122D29', color: '#fff', border: 'none', borderRadius: 6,
                            padding: '0 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                          }}
                        >
                          {updatingStatus ? 'Updating...' : 'Update'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Items Purchased */}
                <div className="sd-card">
                  <div className="sd-card-title" style={{ marginBottom: 12 }}>Items Purchased</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {(selectedOrder.items || []).map((item, idx) => (
                      <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 10, borderBottom: '1px solid #F0EBDC' }}>
                        <div>
                          <div style={{ fontWeight: 600, color: '#122D29', fontSize: 13 }}>{item.product_name}</div>
                          <div style={{ fontSize: 11, color: '#8B8578' }}>
                            {item.variant_name} · SKU: {item.sku} · Qty: {item.quantity}
                          </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontWeight: 700, color: '#122D29', fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>
                            {formatINRDecimals(item.line_total)}
                          </div>
                          <div style={{ fontSize: 11, color: '#A8A293' }}>
                            @{formatINR(item.unit_price)}
                          </div>
                        </div>
                      </div>
                    ))}
                    <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 6, fontWeight: 700, fontSize: 14, color: '#122D29' }}>
                      <span>Total Amount</span>
                      <span>{formatINRDecimals(selectedOrder.total_amount)}</span>
                    </div>
                  </div>
                </div>

                {/* Delivery Address */}
                {selectedOrder.delivery_address && (
                  <div className="sd-card">
                    <div className="sd-card-title" style={{ marginBottom: 8 }}>Delivery Address</div>
                    <div style={{ fontSize: 13, color: '#5C5A54', lineHeight: 1.5 }}>
                      <div style={{ fontWeight: 600, color: '#122D29' }}>
                        {selectedOrder.delivery_address.recipient_name || 'Customer'}
                      </div>
                      <div>{selectedOrder.delivery_address.address_line1}</div>
                      {selectedOrder.delivery_address.address_line2 && <div>{selectedOrder.delivery_address.address_line2}</div>}
                      <div>
                        {selectedOrder.delivery_address.city}, {selectedOrder.delivery_address.state} - {selectedOrder.delivery_address.pin_code}
                      </div>
                      {selectedOrder.delivery_address.mobile_number && (
                        <div style={{ marginTop: 4, color: '#122D29', fontWeight: 500 }}>
                          Phone: {selectedOrder.delivery_address.mobile_number}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Shipment Tracking & Dispatch */}
                <div className="sd-card">
                  <div className="sd-card-title" style={{ marginBottom: 12 }}>Shipment & Logistics Tracking</div>
                  
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 600, color: '#8B8578', display: 'block', marginBottom: 4 }}>Logistics Carrier</label>
                      <input
                        type="text"
                        placeholder="e.g. Blue Dart, Delhivery"
                        value={carrier}
                        onChange={e => setCarrier(e.target.value)}
                        style={{ width: '100%', height: 34, padding: '0 10px', borderRadius: 6, border: '1px solid #E5DFC8', fontSize: 13 }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 600, color: '#8B8578', display: 'block', marginBottom: 4 }}>Tracking Reference / AWB</label>
                      <input
                        type="text"
                        placeholder="e.g. BLUEDART-98421"
                        value={trackingRef}
                        onChange={e => setTrackingRef(e.target.value)}
                        style={{ width: '100%', height: 34, padding: '0 10px', borderRadius: 6, border: '1px solid #E5DFC8', fontSize: 13 }}
                      />
                    </div>
                  </div>

                  <div style={{ marginBottom: 12 }}>
                    <label style={{ fontSize: 11, fontWeight: 600, color: '#8B8578', display: 'block', marginBottom: 4 }}>Public Tracking URL</label>
                    <input
                      type="url"
                      placeholder="https://track.carrier.com/..."
                      value={trackingUrl}
                      onChange={e => setTrackingUrl(e.target.value)}
                      style={{ width: '100%', height: 34, padding: '0 10px', borderRadius: 6, border: '1px solid #E5DFC8', fontSize: 13 }}
                    />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 600, color: '#8B8578', display: 'block', marginBottom: 4 }}>Shipment Status</label>
                      <select
                        value={shipmentStatus}
                        onChange={e => setShipmentStatus(e.target.value)}
                        style={{ width: '100%', height: 34, padding: '0 10px', borderRadius: 6, border: '1px solid #E5DFC8', fontSize: 13 }}
                      >
                        {SHIPMENT_STATUSES.map(s => (
                          <option key={s} value={s}>{s.replace(/_/g, ' ').toUpperCase()}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 600, color: '#8B8578', display: 'block', marginBottom: 4 }}>Estimated Delivery</label>
                      <input
                        type="date"
                        value={estimatedDelivery}
                        onChange={e => setEstimatedDelivery(e.target.value)}
                        style={{ width: '100%', height: 34, padding: '0 10px', borderRadius: 6, border: '1px solid #E5DFC8', fontSize: 13 }}
                      />
                    </div>
                  </div>

                  <div style={{ marginBottom: 12 }}>
                    <label style={{ fontSize: 11, fontWeight: 600, color: '#8B8578', display: 'block', marginBottom: 4 }}>Shipment Note / Audit</label>
                    <input
                      type="text"
                      placeholder="Reason or update comment..."
                      value={shipmentNotes}
                      onChange={e => setShipmentNotes(e.target.value)}
                      style={{ width: '100%', height: 34, padding: '0 10px', borderRadius: 6, border: '1px solid #E5DFC8', fontSize: 13 }}
                    />
                  </div>

                  <button
                    onClick={handleUpdateShipment}
                    disabled={updatingShipment}
                    style={{
                      background: '#4A6741', color: '#fff', border: 'none', borderRadius: 8,
                      padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                      width: '100%',
                    }}
                  >
                    {updatingShipment ? 'Saving Shipment Details...' : 'Save Shipment Tracking'}
                  </button>

                  {/* Shipment Event History Timeline */}
                  {selectedOrder.shipment?.events?.length > 0 && (
                    <div style={{ marginTop: 16, borderTop: '1px solid #F0EBDC', paddingTop: 12 }}>
                      <div className="sd-card-label" style={{ marginBottom: 8 }}>Shipment Event History</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {selectedOrder.shipment.events.map((ev, i) => (
                          <div key={i} style={{ fontSize: 12, display: 'flex', justifyContent: 'space-between', color: '#5C5A54' }}>
                            <span>
                              <strong>{ev.new_status?.toUpperCase()}</strong> {ev.note ? `— ${ev.note}` : ''}
                            </span>
                            <span style={{ color: '#A8A293' }}>
                              {ev.created_at ? new Date(ev.created_at).toLocaleString('en-IN') : ''}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

export default OrderManagement;

