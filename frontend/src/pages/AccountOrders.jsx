import React, { useEffect, useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  FileText,
  RotateCcw,
  RefreshCw,
  Package,
  AlertCircle,
  X,
  Upload,
  Clock,
  Truck,
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

const RETURN_REASON_OPTIONS = [
  { value: 'defective', label: 'Item is defective / not working properly' },
  { value: 'damaged', label: 'Damaged during delivery / transit' },
  { value: 'wrong_item', label: 'Wrong item or variant delivered' },
  { value: 'missing_parts', label: 'Missing accessories or parts in package' },
  { value: 'not_as_described', label: 'Quality not as expected / description mismatch' },
  { value: 'changed_mind', label: 'Changed mind / No longer needed' },
];

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
  const completed = (order.tracking_milestones || []).filter((item) => item.created_at);
  if (completed.length) return completed[completed.length - 1].label;
  if (['cancelled', 'payment_failed', 'pending_payment'].includes(order.status)) return humanize(order.status);
  return 'Order Confirmed';
}

export function AccountOrders({ filter: externalFilter, onFilterChange, resetTrigger }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [internalFilter, setInternalFilter] = useState('all');
  const filter = externalFilter !== undefined ? externalFilter : internalFilter;
  const setFilter = onFilterChange || setInternalFilter;
  const [expandedOrderId, setExpandedOrderId] = useState(null);
  const [activeItemByOrder, setActiveItemByOrder] = useState({});

  // Eligibility & Return form states keyed by orderItemId
  const [eligibilityState, setEligibilityState] = useState({});
  const [formState, setFormState] = useState({});
  const [activeClaimState, setActiveClaimState] = useState({});
  const [evidenceFiles, setEvidenceFiles] = useState({});
  const [uploadingEvidence, setUploadingEvidence] = useState({});
  const [uploadError, setUploadError] = useState({});
  const [evidenceSuccess, setEvidenceSuccess] = useState({});

  // Tracking modal
  const [trackingModalOrder, setTrackingModalOrder] = useState(null);

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
      if (filter === 'cancelled') return ['cancelled', 'payment_failed', 'refunded'].includes(status);
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

      // Initialize form fields for this item
      const availableResolutions = result.available_resolutions || [];
      const defaultResolution = availableResolutions.includes('refund')
        ? 'refund'
        : availableResolutions[0] || 'replacement';

      const initialQty = Number(result.quantity_available || 1) > 0 ? 1 : 0;

      setFormState((prev) => ({
        ...prev,
        [targetItemId]: {
          resolution: defaultResolution,
          quantity: initialQty,
          reason: RETURN_REASON_OPTIONS[0].value,
          description: '',
          submitting: false,
          error: '',
        },
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

  // Handle return request submission
  const handleSubmitReturn = async (e, order, currentItem) => {
    e.preventDefault();
    const currentItemId = itemId(currentItem);
    const itemForm = formState[currentItemId] || {};
    const itemEligibility = eligibilityState[currentItemId]?.data;

    if (!itemEligibility?.eligible) return;

    if (!itemForm.resolution) {
      setFormState((prev) => ({
        ...prev,
        [currentItemId]: { ...itemForm, error: 'Please choose an available resolution (Return & Refund or Replace Item).' },
      }));
      return;
    }

    if (!itemForm.reason) {
      setFormState((prev) => ({
        ...prev,
        [currentItemId]: { ...itemForm, error: 'Please select a reason for your return.' },
      }));
      return;
    }

    const qty = Number(itemForm.quantity);
    if (!Number.isInteger(qty) || qty < 1 || qty > Number(itemEligibility.quantity_available || 1)) {
      setFormState((prev) => ({
        ...prev,
        [currentItemId]: { ...itemForm, error: 'Please select a valid quantity.' },
      }));
      return;
    }

    setFormState((prev) => ({
      ...prev,
      [currentItemId]: { ...itemForm, submitting: true, error: '' },
    }));

    try {
      const payload = {
        order_id: order.id,
        order_item_id: currentItemId,
        quantity: qty,
        resolution_type: itemForm.resolution,
        reason_code: itemForm.reason,
        description: itemForm.description?.trim() ? itemForm.description.trim().slice(0, 500) : undefined,
      };

      const result = await accountService.createReturnClaim(payload);
      const createdClaim = result?.return_request;

      setActiveClaimState((prev) => ({
        ...prev,
        [currentItemId]: createdClaim,
      }));

      // Refresh eligibility in background
      checkEligibilityForItem(order.id, currentItemId);
    } catch (cause) {
      setFormState((prev) => ({
        ...prev,
        [currentItemId]: { ...itemForm, submitting: false, error: cause.message || 'Could not submit return request.' },
      }));
    }
  };

  // Handle evidence upload
  const handleEvidenceUpload = async (claimId) => {
    const files = evidenceFiles[claimId] || [];
    if (!files.length || uploadingEvidence[claimId]) return;

    setUploadingEvidence((prev) => ({ ...prev, [claimId]: true }));
    setUploadError((prev) => ({ ...prev, [claimId]: '' }));

    try {
      await accountService.uploadReturnEvidence(claimId, files);
      setEvidenceSuccess((prev) => ({ ...prev, [claimId]: true }));
      setEvidenceFiles((prev) => ({ ...prev, [claimId]: [] }));
      const refreshed = await accountService.returnClaim(claimId);
      if (refreshed?.order_item_id) {
        setActiveClaimState((prev) => ({ ...prev, [refreshed.order_item_id]: refreshed }));
      }
    } catch (cause) {
      setUploadError((prev) => ({ ...prev, [claimId]: cause.message || 'Evidence upload failed.' }));
    } finally {
      setUploadingEvidence((prev) => ({ ...prev, [claimId]: false }));
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
            const isDelivered = String(order.status || '').toLowerCase() === 'delivered';
            const deliveredDateStr = order.delivered_at || order.shipment?.delivered_at || null;

            // Item-level eligibility & form data
            const currentItemId = itemId(currentItem);
            const currentEligibility = eligibilityState[currentItemId]?.data;
            const eligibilityLoading = eligibilityState[currentItemId]?.loading;
            const itemForm = formState[currentItemId] || {
              resolution: 'refund',
              quantity: 1,
              reason: RETURN_REASON_OPTIONS[0].value,
              description: '',
              submitting: false,
              error: '',
            };
            const currentClaim =
              activeClaimState[currentItemId] ||
              (currentItem.return_claims && currentItem.return_claims[0]);

            // Detect pre-delivery state authoritatively via backend reason_code 'not_delivered' or undelivered order status
            const isPreDeliveryState =
              !currentClaim &&
              (currentEligibility?.reason_code === 'not_delivered' ||
                (!isDelivered && (eligibilityLoading || !currentEligibility)));

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

                    {isPreDeliveryState ? (
                      <div className="fk-pre-delivery-layout">
                        <div className="fk-pre-delivery-main-row">
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
                              <h2 className="fk-product-name-heading">
                                {currentItem.product_name}
                              </h2>
                              <div className="fk-product-attributes-text">
                                {currentItem.variant_name && <span>Color: {currentItem.variant_name}</span>}
                                {currentItem.variant_name && <span> | </span>}
                                <span>Qty: {currentItem.quantity}</span>
                              </div>
                              <div className="fk-product-price-tag">
                                {money(currentItem.line_total || currentItem.unit_price, order.currency)}
                              </div>
                            </div>
                          </section>

                          <section className="fk-pre-delivery-timeline">
                          <OrderLifecycleTimeline order={order} />
                          </section>
                        </div>

                        <div className="fk-pre-delivery-notice" role="note">
                          <AlertCircle size={20} className="fk-pre-delivery-notice-icon" />
                          <div className="fk-pre-delivery-notice-content">
                            <strong>
                              Your post-delivery options will appear here.
                            </strong>
                            <p>
                              Once your order is delivered, you can view the available options for this item.
                            </p>
                          </div>
                        </div>

                        <div className="fk-pre-delivery-actions">
                          <button
                            type="button"
                            className="fk-timeline-updates-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              setTrackingModalOrder(order);
                            }}
                          >
                            See All Updates &gt;
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="fk-order-body-columns">
                      {/* LEFT COLUMN: Product Overview & Delivery Progression */}
                      <div className="fk-order-left-column">
                        {/* Large Product Image Container */}
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

                        {/* Product Title, Attributes & Price */}
                        <div className="fk-product-details-block">
                          <h2 className="fk-product-name-heading">
                            {currentItem.product_name}
                          </h2>
                          <div className="fk-product-attributes-text">
                            {currentItem.variant_name && <span>Color: {currentItem.variant_name}</span>}
                            {currentItem.variant_name && <span> | </span>}
                            <span>Qty: {currentItem.quantity}</span>
                          </div>
                          <div className="fk-product-price-tag">
                            {money(currentItem.line_total || currentItem.unit_price, order.currency)}
                          </div>
                        </div>

                        {/* Delivery Progression Timeline */}
                        <div>
                          <OrderLifecycleTimeline order={order} />

                          {/* See all updates link */}
                          <button
                            type="button"
                            className="fk-timeline-updates-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              setTrackingModalOrder(order);
                            }}
                          >
                            See All Updates &gt;
                          </button>
                        </div>
                      </div>

                      {/* RIGHT COLUMN: Return / Replacement Request */}
                      <div className="fk-order-right-column">
                        {/* Section Header */}
                        <div className="fk-return-section-header">
                          <FileText size={20} className="fk-header-doc-icon" />
                          <div>
                            <h2 className="fk-return-header-title">Return / Replacement Request</h2>
                            <p className="fk-return-header-desc">
                              Raise a return or replacement request for this item.
                            </p>
                          </div>
                        </div>

                        {/* Eligibility Banner Loading */}
                        {eligibilityLoading && (
                          <div className="fk-eligibility-banner is-loading">
                            <Clock size={18} className="fk-banner-icon spin" />
                            <div>
                              <strong>Checking Return / Replacement Eligibility</strong>
                              <p>Checking return policies, delivery status, and window dates…</p>
                            </div>
                          </div>
                        )}

                        {/* Existing Claim Already Active or Submitted */}
                        {currentClaim && (
                          <div className="fk-claim-card-banner">
                            <div className="fk-claim-banner-header">
                              <CheckCircle2 size={20} className="fk-claim-icon" />
                              <div>
                                <strong className="fk-claim-title">
                                  Return / Replacement Request Submitted
                                </strong>
                                <p className="fk-claim-subtext">
                                  Claim ID: <strong>#{currentClaim.id}</strong> · Status:{' '}
                                  <span className="fk-claim-badge">
                                    {humanize(currentClaim.workflow_status || currentClaim.status)}
                                  </span>
                                </p>
                              </div>
                            </div>

                            {/* Evidence Upload inside Claim Banner */}
                            <div className="fk-evidence-upload-section">
                              <label className="fk-evidence-label" htmlFor={`evidence-${currentClaim.id}`}>
                                <Upload size={14} /> Upload supporting photos (up to 5 images)
                              </label>
                              <div className="fk-evidence-row">
                                <input
                                  id={`evidence-${currentClaim.id}`}
                                  type="file"
                                  accept="image/*"
                                  multiple
                                  disabled={uploadingEvidence[currentClaim.id] || evidenceSuccess[currentClaim.id]}
                                  onChange={(e) => {
                                    setUploadError((prev) => ({ ...prev, [currentClaim.id]: '' }));
                                    setEvidenceFiles((prev) => ({
                                      ...prev,
                                      [currentClaim.id]: Array.from(e.target.files || []).slice(0, 5),
                                    }));
                                  }}
                                  className="fk-file-input"
                                />
                                <button
                                  type="button"
                                  className="fk-upload-submit-btn"
                                  onClick={() => handleEvidenceUpload(currentClaim.id)}
                                  disabled={
                                    uploadingEvidence[currentClaim.id] ||
                                    evidenceSuccess[currentClaim.id] ||
                                    !(evidenceFiles[currentClaim.id] || []).length
                                  }
                                >
                                  {uploadingEvidence[currentClaim.id]
                                    ? 'Uploading…'
                                    : evidenceSuccess[currentClaim.id]
                                    ? 'Uploaded Successfully'
                                    : 'Upload'}
                                </button>
                              </div>

                              {uploadError[currentClaim.id] && (
                                <p className="fk-form-error-inline">{uploadError[currentClaim.id]}</p>
                              )}
                              {evidenceSuccess[currentClaim.id] && (
                                <p className="fk-form-success-inline">Evidence images attached to claim.</p>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Eligible Banner (when eligible & no pending claim) */}
                        {!eligibilityLoading && !currentClaim && currentEligibility?.eligible && (
                          <div className="fk-eligibility-banner is-eligible">
                            <CheckCircle2 size={20} className="fk-banner-icon" />
                            <div>
                              <strong className="fk-banner-title">
                                Eligible for Return / Replacement
                              </strong>
                              <p className="fk-banner-desc">
                                You can return or replace this item.
                                {returnDeadline && (
                                  <span>
                                    {' '}Return window closes on {formatDateOnly(returnDeadline)}
                                    {daysLeft !== null && ` (${daysLeft} days left)`}.
                                  </span>
                                )}
                              </p>
                            </div>
                          </div>
                        )}

                        {/* Ineligible Banner */}
                        {!eligibilityLoading && !currentClaim && currentEligibility && !currentEligibility.eligible && (
                          <div className="fk-eligibility-banner is-ineligible">
                            <AlertCircle size={20} className="fk-banner-icon" />
                            <div>
                              <strong className="fk-banner-title">
                                Not Eligible for Return / Replacement
                              </strong>
                              <p className="fk-banner-desc">
                                {currentEligibility.message || 'This item cannot be returned or replaced.'}
                              </p>
                            </div>
                          </div>
                        )}

                        {/* Interactive Return Form (shown only if eligible and no claim submitted) */}
                        {!currentClaim && currentEligibility?.eligible && (
                          <form
                            className="fk-return-form-container"
                            onSubmit={(e) => handleSubmitReturn(e, order, currentItem)}
                          >
                            {/* Available Resolutions */}
                            <div className="fk-form-section-resolutions">
                              <label className="fk-section-subheading">Available Resolutions</label>
                              <div className="fk-resolutions-grid">
                                {/* Option 1: Return & Refund */}
                                <div
                                  className={`fk-resolution-card ${
                                    itemForm.resolution === 'refund' ? 'is-selected' : ''
                                  } ${
                                    !(currentEligibility.available_resolutions || []).includes('refund')
                                      ? 'is-disabled'
                                      : ''
                                  }`}
                                  onClick={() => {
                                    if ((currentEligibility.available_resolutions || []).includes('refund')) {
                                      setFormState((prev) => ({
                                        ...prev,
                                        [currentItemId]: { ...itemForm, resolution: 'refund' },
                                      }));
                                    }
                                  }}
                                  role="radio"
                                  aria-checked={itemForm.resolution === 'refund'}
                                  tabIndex={0}
                                >
                                  <div className="fk-radio-outer-circle">
                                    {itemForm.resolution === 'refund' && (
                                      <div className="fk-radio-inner-dot" />
                                    )}
                                  </div>
                                  <RotateCcw size={17} className="fk-resolution-icon" />
                                  <div className="fk-resolution-text-box">
                                    <strong className="fk-resolution-title">Return & Refund</strong>
                                    <span className="fk-resolution-desc">
                                      Return the item and get a refund
                                    </span>
                                  </div>
                                </div>

                                {/* Option 2: Replace Item */}
                                <div
                                  className={`fk-resolution-card ${
                                    itemForm.resolution === 'replacement' ? 'is-selected' : ''
                                  } ${
                                    !(currentEligibility.available_resolutions || []).includes('replacement')
                                      ? 'is-disabled'
                                      : ''
                                  }`}
                                  onClick={() => {
                                    if ((currentEligibility.available_resolutions || []).includes('replacement')) {
                                      setFormState((prev) => ({
                                        ...prev,
                                        [currentItemId]: { ...itemForm, resolution: 'replacement' },
                                      }));
                                    }
                                  }}
                                  role="radio"
                                  aria-checked={itemForm.resolution === 'replacement'}
                                  tabIndex={0}
                                >
                                  <div className="fk-radio-outer-circle">
                                    {itemForm.resolution === 'replacement' && (
                                      <div className="fk-radio-inner-dot" />
                                    )}
                                  </div>
                                  <RefreshCw size={17} className="fk-resolution-icon" />
                                  <div className="fk-resolution-text-box">
                                    <strong className="fk-resolution-title">Replace Item</strong>
                                    <span className="fk-resolution-desc">
                                      Get a replacement of the same item
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </div>

                            {/* Row 1: Quantity */}
                            <div className="fk-form-field-row">
                              <label className="fk-form-row-label" htmlFor={`qty-${currentItemId}`}>
                                Quantity
                              </label>
                              <div className="fk-form-row-input-group">
                                <select
                                  id={`qty-${currentItemId}`}
                                  className="fk-form-select fk-qty-select"
                                  value={itemForm.quantity}
                                  onChange={(e) =>
                                    setFormState((prev) => ({
                                      ...prev,
                                      [currentItemId]: { ...itemForm, quantity: Number(e.target.value) },
                                    }))
                                  }
                                  disabled={itemForm.submitting}
                                >
                                  {Array.from(
                                    { length: currentEligibility.quantity_available || 1 },
                                    (_, i) => i + 1
                                  ).map((q) => (
                                    <option key={q} value={q}>
                                      {q}
                                    </option>
                                  ))}
                                </select>
                                <span className="fk-field-helper-text">
                                  (Available: {itemForm.quantity} of {currentEligibility.quantity_available || 1})
                                </span>
                              </div>
                            </div>

                            {/* Row 2: Reason for Return */}
                            <div className="fk-form-field-row">
                              <label className="fk-form-row-label" htmlFor={`reason-${currentItemId}`}>
                                Reason for Return *
                              </label>
                              <div className="fk-form-row-input-group">
                                <select
                                  id={`reason-${currentItemId}`}
                                  className="fk-form-select fk-reason-select"
                                  value={itemForm.reason}
                                  onChange={(e) =>
                                    setFormState((prev) => ({
                                      ...prev,
                                      [currentItemId]: { ...itemForm, reason: e.target.value },
                                    }))
                                  }
                                  disabled={itemForm.submitting}
                                  required
                                >
                                  {RETURN_REASON_OPTIONS.map((opt) => (
                                    <option key={opt.value} value={opt.value}>
                                      {opt.label}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            </div>

                            {/* Row 3: Tell us more */}
                            <div className="fk-form-field-row align-top">
                              <label className="fk-form-row-label" htmlFor={`desc-${currentItemId}`}>
                                Tell us more (Optional)
                              </label>
                              <div className="fk-form-row-input-group flex-col">
                                <textarea
                                  id={`desc-${currentItemId}`}
                                  className="fk-form-textarea"
                                  rows={3}
                                  maxLength={500}
                                  value={itemForm.description}
                                  onChange={(e) =>
                                    setFormState((prev) => ({
                                      ...prev,
                                      [currentItemId]: { ...itemForm, description: e.target.value },
                                    }))
                                  }
                                  placeholder="Describe the issue in detail to help us process your request faster..."
                                  disabled={itemForm.submitting}
                                />
                                <div className="fk-textarea-char-count">
                                  {itemForm.description?.length || 0} / 500
                                </div>
                              </div>
                            </div>

                            {/* Inline Form Error */}
                            {itemForm.error && (
                              <div className="fk-form-error-inline" role="alert">
                                <AlertCircle size={15} />
                                <span>{itemForm.error}</span>
                              </div>
                            )}

                            {/* Action Buttons */}
                            <div className="fk-form-actions-row">
                              <button
                                type="button"
                                className="fk-action-btn-cancel"
                                onClick={() => setExpandedOrderId(null)}
                                disabled={itemForm.submitting}
                              >
                                Cancel
                              </button>
                              <button
                                type="submit"
                                className="fk-action-btn-submit"
                                disabled={itemForm.submitting || !currentEligibility.eligible}
                              >
                                {itemForm.submitting ? 'Submitting…' : 'Submit Request'}
                              </button>
                            </div>
                          </form>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
              </article>
            );
          })}
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
