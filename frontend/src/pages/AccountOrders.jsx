import React, { useEffect, useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Package,
  AlertCircle,
  X,
  Check
} from 'lucide-react';
import { accountService } from '../services/accountService';
import './accountPages.css';

// Currency & formatting helpers
const money = (value, currency = 'INR') =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency }).format(Number(value || 0));

const formatOrderDateTime = (value) => {
  if (!value) return 'Date unavailable';
  const d = new Date(value);
  if (isNaN(d.getTime())) return String(value);
  const day = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const time = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
  return `${day}, ${time}`;
};

const formatShortDateTime = (value) => {
  if (!value) return '';
  const d = new Date(value);
  if (isNaN(d.getTime())) return String(value);
  const day = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
  const time = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
  return `${day}, ${time}`;
};

const formatDateOnly = (value) => {
  if (!value) return 'Date unavailable';
  const d = new Date(value);
  if (isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

const calculateDaysLeft = (deadline) => {
  if (!deadline) return null;
  const target = new Date(deadline);
  const now = new Date();
  const diffMs = target.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  return diffDays > 0 ? diffDays : 0;
};

const labels = {
  pending_payment: 'Payment pending',
  placed: 'Order confirmed',
  accepted: 'Order accepted',
  payment_failed: 'Payment failed',
  captured: 'Paid',
  pending: 'Pending',
  failed: 'Failed',
  processing: 'Processing',
  packed: 'Packed',
  ready_to_ship: 'Ready to ship',
  ready_for_dispatch: 'Ready for dispatch',
  received: 'Shipment received',
  scheduled: 'Delivery scheduled',
  shipped: 'Shipped',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  refunded: 'Refunded',
  cod: 'Cash on Delivery',
  upi: 'UPI',
  netbanking: 'Net Banking',
  refund: 'Refund',
  replacement: 'Replacement',
  requested: 'Requested',
  submitted: 'Submitted',
  under_review: 'Under review',
  approved: 'Approved',
  rejected: 'Rejected',
  completed: 'Completed',
  information_requested: 'Information requested',
};

const humanize = (value) =>
  labels[String(value || '').toLowerCase()] ||
  String(value || 'Unavailable')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

const itemId = (item) => item?.id ?? item?.order_item_id;

function OrderLifecycleTimeline({ order }) {
  const milestones = order.tracking_milestones || [];

  return (
    <div className="fk-delivery-timeline-block">
      {milestones.map((milestone, index) => (
        <div className={`fk-timeline-step ${milestone.created_at ? 'is-completed' : 'is-pending'}`} key={milestone.stage}>
          <div className="fk-timeline-marker">
            <span className="fk-marker-dot">
              {milestone.created_at ? <Check size={11} strokeWidth={3} /> : <span className="fk-hollow-dot" />}
            </span>
            {index < milestones.length - 1 && <span className={`fk-timeline-line ${milestone.created_at ? 'is-completed' : 'is-pending'}`} />}
          </div>
          <div className="fk-timeline-content">
            <strong className="fk-timeline-label">{milestone.label}</strong>
            {milestone.created_at && <span className="fk-timeline-time">{formatShortDateTime(milestone.created_at)}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

function customerOrderTrackingStatus(order) {
  if (order.status === 'cancelled') return order.cancellation_label || 'Cancelled';
  const completed = (order.tracking_milestones || []).filter((item) => item.created_at);
  if (completed.length) return completed[completed.length - 1].label;
  if (['cancelled', 'payment_failed', 'pending_payment'].includes(order.status)) return humanize(order.status);
  return 'Order Confirmed';
}

export function AccountOrders({ filter: externalFilter, onFilterChange, resetTrigger, onStartReturnIntake }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [internalFilter, setInternalFilter] = useState('all');
  const filter = externalFilter !== undefined ? externalFilter : internalFilter;
  const setFilter = onFilterChange || setInternalFilter;
  const [expandedOrderId, setExpandedOrderId] = useState(null);
  const [activeItemByOrder, setActiveItemByOrder] = useState({});

  // Eligibility and active-claim state remain item-scoped.
  const [eligibilityState, setEligibilityState] = useState({});
  const [activeClaimState, setActiveClaimState] = useState({});

  // Tracking modal
  const [trackingModalOrder, setTrackingModalOrder] = useState(null);
  const [cancelTarget, setCancelTarget] = useState(null);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState('');

  const confirmCancellation = async () => {
    if (!cancelTarget || cancelling) return;
    setCancelling(true);
    setCancelError('');
    try {
      await accountService.cancelOrder(cancelTarget.id);
      await loadOrders();
      setCancelTarget(null);
    } catch (cause) {
      setCancelError(cause.message || 'The order could not be cancelled.');
    } finally {
      setCancelling(false);
    }
  };

  // Collapse expanded order and scroll to top when Back to orders is triggered
  useEffect(() => {
    if (resetTrigger > 0) {
      setExpandedOrderId(null);
      const mainArea = document.querySelector('.fk-account-main-area');
      if (mainArea) {
        mainArea.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }
  }, [resetTrigger]);

  // Load orders
  const loadOrders = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await accountService.orders();
      const list = Array.isArray(result) ? result : [];
      setOrders(list);
      // Auto-expand first order to match the reference view
      if (list.length > 0 && expandedOrderId === null) {
        setExpandedOrderId(list[0].id);
      }
    } catch (cause) {
      setError(cause.message || 'Could not load your orders.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOrders();
  }, []);

  // Filter orders
  const visibleOrders = useMemo(() => {
    return orders.filter((order) => {
      const status = String(order.status || '').toLowerCase();
      if (filter === 'all') return true;
      if (filter === 'active') return !['delivered', 'cancelled', 'refunded'].includes(status);
      if (filter === 'delivered') return status === 'delivered';
      if (filter === 'cancelled') return ['cancelled', 'payment_failed'].includes(status);
      return true;
    });
  }, [orders, filter]);

  // When expanding an order or switching active item, check eligibility
  const checkEligibilityForItem = async (orderId, targetItemId) => {
    if (!targetItemId || eligibilityState[targetItemId]?.loading) return;

    setEligibilityState((prev) => ({
      ...prev,
      [targetItemId]: { loading: true, data: null, error: '' },
    }));

    try {
      const result = await accountService.returnEligibility(orderId, targetItemId);
      setEligibilityState((prev) => ({
        ...prev,
        [targetItemId]: { loading: false, data: result, error: '' },
      }));

      // Check if item has existing active claim
      if (result.active_claim) {
        setActiveClaimState((prev) => ({
          ...prev,
          [targetItemId]: result.active_claim,
        }));
      }
    } catch (cause) {
      setEligibilityState((prev) => ({
        ...prev,
        [targetItemId]: { loading: false, data: null, error: cause.message || 'Could not verify return eligibility.' },
      }));
    }
  };

  // Toggle order expansion
  const toggleOrder = (order) => {
    const isExpanding = expandedOrderId !== order.id;
    const newExpandedId = isExpanding ? order.id : null;
    setExpandedOrderId(newExpandedId);

    if (isExpanding) {
      const firstItem = order.items?.[0];
      const targetItemId = activeItemByOrder[order.id] || itemId(firstItem);
      if (targetItemId && !eligibilityState[targetItemId]) {
        checkEligibilityForItem(order.id, targetItemId);
      }
    }
  };

  // Ensure eligibility is triggered for active item on first render
  useEffect(() => {
    if (expandedOrderId) {
      const order = orders.find((o) => o.id === expandedOrderId);
      if (order && order.items?.length > 0) {
        const targetItemId = activeItemByOrder[order.id] || itemId(order.items[0]);
        if (targetItemId && !eligibilityState[targetItemId]) {
          checkEligibilityForItem(order.id, targetItemId);
        }
      }
    }
  }, [expandedOrderId, orders]);

  // Handle item change in an order
  const handleSelectItem = (orderId, targetItemId) => {
    setActiveItemByOrder((prev) => ({ ...prev, [orderId]: targetItemId }));
    if (!eligibilityState[targetItemId]) {
      checkEligibilityForItem(orderId, targetItemId);
    }
  };

  return (
    <div className="fk-orders-container">
      {/* Page Heading (Compact inline layout matching Section 5) */}
      <div className="fk-orders-header-row">
        <div className="fk-orders-title-group">
          <h1 className="fk-orders-title">My Orders</h1>
          <span className="fk-orders-title-sep">—</span>
          <p className="fk-orders-subtitle">
            Review your purchases, track deliveries, and manage returns.
          </p>
        </div>
      </div>

      {/* Global Error Banner */}
      {error && (
        <div className="fk-orders-error-banner" role="alert">
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="fk-orders-state-box" role="status">
          <div className="fk-spinner" />
          <p>Loading your orders…</p>
        </div>
      )}

      {/* Empty State */}
      {!loading && !visibleOrders.length && (
        <div className="fk-orders-empty-box">
          <Package size={48} className="fk-empty-icon" />
          <h3>{orders.length ? 'No orders match your filter' : 'No orders found'}</h3>
          <p>
            {orders.length
              ? 'Try changing the status filter above to see other orders.'
              : 'When you place an order, its details and return options will appear here.'}
          </p>
        </div>
      )}

      {/* Orders List */}
      {!loading && visibleOrders.length > 0 && (
        <div className="fk-orders-list">
          {visibleOrders.map((order) => {
            const isExpanded = expandedOrderId === order.id;
            const items = order.items || [];
            const activeItemId = activeItemByOrder[order.id] || itemId(items[0]);
            const currentItem = items.find((it) => itemId(it) === activeItemId) || items[0] || {};
            const isDelivered = String(order.status || '').toLowerCase() === 'delivered'
              && String(order.shipment?.status || '').toLowerCase() === 'delivered';
            const deliveredDateStr = order.delivered_at || order.shipment?.delivered_at || null;

            // Item-level eligibility and active-claim data.
            const currentItemId = itemId(currentItem);
            const currentEligibility = eligibilityState[currentItemId]?.data;
            const eligibilityLoading = eligibilityState[currentItemId]?.loading;
            const currentClaim =
              activeClaimState[currentItemId] ||
              (currentItem.return_claims && currentItem.return_claims[0]);

            // Days left calculation
            const returnDeadline = currentEligibility?.return_deadline;
            const daysLeft = calculateDaysLeft(returnDeadline);

            return (
              <article
                key={order.id}
                className={`fk-order-card-wrapper ${isExpanded ? 'is-expanded' : 'is-collapsed'}`}
              >
                {/* Order Card Header (Click to toggle expansion) */}
                <div
                  className="fk-order-card-summary"
                  onClick={() => toggleOrder(order)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      toggleOrder(order);
                    }
                  }}
                  aria-expanded={isExpanded}
                >
                  {/* Zone 1 (Left): Order identity */}
                  <div className="fk-order-summary-left">
                    <div className="fk-order-thumbnail-box">
                      {currentItem.image ? (
                        <img
                          src={currentItem.image}
                          alt={currentItem.product_name || 'Product'}
                          className="fk-order-thumbnail-img"
                          loading="lazy"
                        />
                      ) : (
                        <Package size={20} className="fk-thumbnail-placeholder" />
                      )}
                    </div>
                    <div className="fk-order-meta-info">
                      <span className="fk-order-number-text">
                        Order #{order.order_number}
                      </span>
                      <span className="fk-order-date-text">
                        Placed on {formatOrderDateTime(order.created_at)}
                      </span>
                    </div>
                  </div>

                  {/* Zone 2 (Center): Color-coded status badge visually centered */}
                  <div className="fk-order-summary-center">
                    <span className={`fk-status-pill is-${String(order.status || '').toLowerCase()}`}>
                      {isDelivered && (
                        <span className="fk-status-icon-check">
                          <Check size={11} strokeWidth={3} />
                        </span>
                      )}
                      <span>{customerOrderTrackingStatus(order)}</span>
                    </span>
                    {order.status === 'cancelled' && order.cancellation_refund_status && (
                      <small className="fk-delivery-date-text">Payment refund: {humanize(order.cancellation_refund_status)}</small>
                    )}
                  </div>

                  {/* Zone 3 (Right): Supporting info & Chevron */}
                  <div className="fk-order-summary-right">
                    {isDelivered && (
                      <span className="fk-delivery-date-text">
                        Delivered on {deliveredDateStr ? formatDateOnly(deliveredDateStr) : 'Delivery timestamp unavailable'}
                      </span>
                    )}

                    {!isDelivered && (
                      <span className="fk-delivery-date-text">
                        {order.status === 'shipped' ? 'In transit' : `Total: ${money(order.total_amount, order.currency)}`}
                      </span>
                    )}

                    <span className="fk-chevron-toggle" aria-hidden="true">
                      {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                    </span>
                  </div>
                </div>

                {/* Expanded Details Body */}
                {isExpanded && (
                  <div className="fk-order-card-body">
                    {/* Multi-item selector tabs if order contains > 1 item */}
                    {items.length > 1 && (
                      <div className="fk-order-items-tabstrip">
                        <span className="fk-tabstrip-label">Select product:</span>
                        <div className="fk-tabstrip-pills">
                          {items.map((it, idx) => {
                            const itId = itemId(it);
                            const isSelected = itId === activeItemId;
                            return (
                              <button
                                key={itId || idx}
                                type="button"
                                className={`fk-item-tab-pill ${isSelected ? 'active' : ''}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleSelectItem(order.id, itId);
                                }}
                              >
                                {it.product_name}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {(
                      <div className="fk-pre-delivery-layout">
                        <div className={`fk-pre-delivery-main-row ${isDelivered ? 'is-delivered' : ''}`}>
                          <section className="fk-pre-delivery-product">
                            <div className="fk-product-image-box">
                              {currentItem.image ? (
                                <img
                                  src={currentItem.image}
                                  alt={currentItem.product_name || 'Product'}
                                  className="fk-product-hero-img"
                                />
                              ) : (
                                <Package size={52} className="fk-product-placeholder-icon" />
                              )}
                            </div>
                            <div className="fk-product-details-block">
                              <h2 className="fk-product-name-heading">{currentItem.product_name}</h2>
                              <div className="fk-product-attributes-text">
                                {currentItem.variant_name && <span>Color: {currentItem.variant_name} | </span>}
                                <span>Qty: {currentItem.quantity}</span>
                              </div>
                              <div className="fk-product-price-tag">
                                {money(currentItem.line_total || currentItem.unit_price, order.currency)}
                              </div>
                            </div>
                          </section>

                          <section className={`fk-pre-delivery-timeline ${isDelivered ? 'is-delivered' : ''}`}>
                            <OrderLifecycleTimeline order={order} />
                          </section>
                        </div>

                        {isDelivered && (
                          <section className="fk-return-chat-panel fk-return-panel-full-width" role="region" aria-label="Return or replacement options">
                                <h3>Return or replace this item</h3>
                                <p className="fk-return-chat-description">
                                  Need help with this purchase? You can request a return or replacement within the eligible period.
                                </p>

                                {eligibilityLoading && (
                                  <p className="fk-return-chat-state" role="status">Checking return eligibility...</p>
                                )}
                                {eligibilityState[currentItemId]?.error && (
                                  <p className="fk-return-chat-state" role="alert">{eligibilityState[currentItemId].error}</p>
                                )}
                                {!eligibilityLoading && currentClaim && (
                                  <div className="fk-return-chat-ineligible">
                                    <strong>Request already submitted</strong>
                                    <p>Request #{currentClaim.id} &middot; {humanize(currentClaim.workflow_status || currentClaim.status)}</p>
                                  </div>
                                )}
                                {!eligibilityLoading && !currentClaim && currentEligibility?.eligible && (
                                  <>
                                    <div className="fk-return-chat-eligible">
                                      <CheckCircle2 size={16} />
                                      <strong>Eligible for Return / Replacement</strong>
                                    </div>
                                    {returnDeadline && (
                                      <p className="fk-return-chat-window">
                                        {daysLeft} {daysLeft === 1 ? 'day' : 'days'} remaining &middot; Return window closes {formatDateOnly(returnDeadline)}
                                      </p>
                                    )}
                                    <button
                                      type="button"
                                      className="fk-return-chat-button"
                                      disabled={!onStartReturnIntake}
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        onStartReturnIntake?.({
                                          orderId: order.id,
                                          orderNumber: order.order_number,
                                          orderItemId: currentItemId,
                                          productName: currentItem.product_name,
                                          variantName: currentItem.variant_name,
                                          quantity: currentItem.quantity,
                                        });
                                      }}
                                    >
                                      Return or Replace
                                    </button>
                                    <small>Our support assistant will guide you through the process.</small>
                                  </>
                                )}
                                {!eligibilityLoading && !currentClaim && currentEligibility && !currentEligibility.eligible && (
                                  <div className="fk-return-chat-ineligible">
                                    <strong>{currentEligibility.reason_code === 'return_window_expired' ? 'Return window closed' : 'Not eligible for Return / Replacement'}</strong>
                                    <p>{currentEligibility.reason_code === 'return_window_expired'
                                      ? 'The eligible return period for this item has ended.'
                                      : currentEligibility.message || 'This item is not eligible for a return or replacement.'}</p>
                                  </div>
                                )}
                                {!eligibilityLoading && !currentEligibility && !eligibilityState[currentItemId]?.error && (
                                  <p className="fk-return-chat-state" role="status">Checking return eligibility...</p>
                                )}
                          </section>
                        )}

                        {isDelivered && (
                          <div className="fk-pre-delivery-actions">
                            <button
                                type="button"
                                className="fk-timeline-updates-btn"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setTrackingModalOrder(order);
                                }}
                              >
                                See All Updates &gt;
                            </button>
                          </div>
                        )}

                        {!isDelivered && (
                          <>
                            {order.can_customer_cancel && (
                              <button type="button" className="fk-timeline-updates-btn"
                                onClick={(event) => { event.stopPropagation(); setCancelTarget(order); setCancelError(''); }}>
                                Cancel Order
                              </button>
                            )}
                            <div className="fk-pre-delivery-notice" role="note">
                              <AlertCircle size={20} className="fk-pre-delivery-notice-icon" />
                              <div className="fk-pre-delivery-notice-content">
                                <strong>Your post-delivery options will appear here.</strong>
                                <p>Once your order is delivered, you can view the available options for this item.</p>
                              </div>
                            </div>
                            <div className="fk-pre-delivery-actions">
                              <button
                                type="button"
                                className="fk-timeline-updates-btn"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setTrackingModalOrder(order);
                                }}
                              >
                                See All Updates &gt;
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                </div>
              )}
              </article>
            );
          })}
        </div>
      )}

      {cancelTarget && (
        <div className="fk-tracking-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !cancelling) setCancelTarget(null); }}>
          <section className="fk-tracking-modal-content" role="dialog" aria-modal="true" aria-labelledby="cancel-order-heading">
            <div className="fk-tracking-modal-header">
              <div>
                <h3 id="cancel-order-heading">Cancel this order?</h3>
                <p>Are you sure you want to cancel this order?</p>
              </div>
              <button type="button" className="fk-modal-close-btn" disabled={cancelling} onClick={() => setCancelTarget(null)} aria-label="Close"><X size={18} /></button>
            </div>
            <p>Order: {cancelTarget.order_number}</p>
            <p>Total: {money(cancelTarget.total_amount, cancelTarget.currency)}</p>
            {cancelError && <div className="fk-orders-error-banner" role="alert">{cancelError}</div>}
            <div className="fk-pre-delivery-actions">
              <button type="button" className="fk-timeline-updates-btn" disabled={cancelling} onClick={() => setCancelTarget(null)}>Keep Order</button>
              <button type="button" className="fk-timeline-updates-btn" disabled={cancelling} onClick={confirmCancellation}>{cancelling ? 'Cancelling…' : 'Confirm Cancellation'}</button>
            </div>
          </section>
        </div>
      )}

      {/* Shipment Tracking Modal ("See All Updates") */}
      {trackingModalOrder && (
        <div
          className="fk-tracking-modal-backdrop"
          onClick={() => setTrackingModalOrder(null)}
          role="dialog"
          aria-modal="true"
        >
          <div className="fk-tracking-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="fk-tracking-modal-header">
              <div>
                <h3>Shipment Tracking</h3>
                <p>Order #{trackingModalOrder.order_number}</p>
              </div>
              <button
                type="button"
                className="fk-modal-close-btn"
                onClick={() => setTrackingModalOrder(null)}
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            <div className="fk-tracking-modal-body">
              {/* Shipment info */}
              <div className="fk-tracking-shipment-meta">
                <div>
                  <span className="fk-meta-label">Carrier</span>
                  <strong>{trackingModalOrder.shipment?.carrier || 'Not assigned'}</strong>
                </div>
                <div>
                  <span className="fk-meta-label">Tracking Number</span>
                  <strong>{trackingModalOrder.shipment?.tracking_reference || 'Not available'}</strong>
                </div>
                <div>
                  <span className="fk-meta-label">Current Status</span>
                  <span className="fk-order-status-badge">
                    {customerOrderTrackingStatus(trackingModalOrder)}
                  </span>
                </div>
                {trackingModalOrder.shipment?.estimated_delivery_date && (
                  <div>
                    <span className="fk-meta-label">Estimated Delivery</span>
                    <strong>{formatDateOnly(trackingModalOrder.shipment.estimated_delivery_date)}</strong>
                  </div>
                )}
                {trackingModalOrder.shipment?.tracking_url && (
                  <div>
                    <span className="fk-meta-label">Carrier Tracking</span>
                    <a href={trackingModalOrder.shipment.tracking_url} target="_blank" rel="noreferrer">Open tracking page</a>
                  </div>
                )}
              </div>

              {/* Delivery Address */}
              {trackingModalOrder.delivery_address && (
                <div className="fk-tracking-address-box">
                  <span className="fk-meta-label">Delivering To</span>
                  <strong>{trackingModalOrder.delivery_address.recipient_name}</strong>
                  <p>
                    {[
                      trackingModalOrder.delivery_address.address_line1,
                      trackingModalOrder.delivery_address.address_line2,
                      trackingModalOrder.delivery_address.locality,
                      trackingModalOrder.delivery_address.city,
                      trackingModalOrder.delivery_address.state,
                      trackingModalOrder.delivery_address.pin_code,
                    ]
                      .filter(Boolean)
                      .join(', ')}
                  </p>
                </div>
              )}

              {/* Events timeline */}
              <div className="fk-tracking-events-list">
                <span className="fk-meta-label">Activity Updates</span>
                {trackingModalOrder.tracking_milestones?.some((item) => item.created_at) ? (
                  trackingModalOrder.tracking_milestones.filter((item) => item.created_at).map((ev, idx) => (
                    <div key={ev.id || idx} className="fk-tracking-event-item">
                      <div className="fk-event-dot" />
                      <div className="fk-event-details">
                        <strong>{ev.label}</strong>
                        <span>{ev.created_at ? formatOrderDateTime(ev.created_at) : 'Timestamp unavailable'}</span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="fk-tracking-event-item">
                    <div className="fk-event-dot" />
                    <div className="fk-event-details">
                      <strong>No tracking events yet</strong>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AccountOrders;
