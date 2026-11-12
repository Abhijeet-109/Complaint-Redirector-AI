import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Package, Search, X } from 'lucide-react';
import { accountService } from '../services/accountService';
import './accountPages.css';

const money = (value, currency = 'INR') => new Intl.NumberFormat('en-IN', { style: 'currency', currency }).format(Number(value || 0));
const labels = {
  pending_payment: 'Payment pending', placed: 'Order processing', payment_failed: 'Payment failed',
  captured: 'Paid', pending: 'Pending', failed: 'Failed', processing: 'Processing', shipped: 'Shipped',
  delivered: 'Delivered', cancelled: 'Cancelled', refunded: 'Refunded', cod: 'Cash on Delivery',
  upi: 'UPI', netbanking: 'Net Banking', refund: 'Refund', replacement: 'Replacement',
  requested: 'Requested', submitted: 'Submitted', under_review: 'Under review', approved: 'Approved',
  rejected: 'Rejected', completed: 'Completed', information_requested: 'Information requested',
};
const humanize = (value) => labels[String(value || '').toLowerCase()] || String(value || 'Unavailable').replace(/[_-]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
const dateLabel = (value) => value ? new Date(value).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Date unavailable';
const itemId = (item) => item.id ?? item.order_item_id;

function ReturnPanel({ order, item, onClose, onClaimCreated }) {
  const id = itemId(item);
  const [eligibility, setEligibility] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [resolution, setResolution] = useState('');
  const [reason, setReason] = useState('');
  const [description, setDescription] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [claim, setClaim] = useState(null);
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [uploaded, setUploaded] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true); setError('');
      try {
        const result = await accountService.returnEligibility(order.id, id);
        if (!active) return;
        setEligibility(result);
        const resolutions = result.available_resolutions || [];
        if (resolutions.length) setResolution(resolutions[0]);
        const available = Number(result.quantity_available || 1);
        setQuantity(available > 0 ? 1 : 0);
      } catch (cause) {
        if (active) setError(cause.message || 'Could not check return eligibility.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [order.id, id]);

  const submit = async (event) => {
    event.preventDefault();
    if (submitting || !eligibility?.eligible) return;
    if (!resolution) { setError('Select refund or replacement.'); return; }
    if (!reason.trim()) { setError('Enter a reason for the request.'); return; }
    const qty = Number(quantity);
    if (!Number.isInteger(qty) || qty < 1 || qty > Number(eligibility.quantity_available || 0)) {
      setError('Select a valid quantity.'); return;
    }
    setSubmitting(true); setError('');
    try {
      const result = await accountService.createReturnClaim({
        order_id: order.id,
        order_item_id: id,
        quantity: qty,
        resolution_type: resolution,
        reason_code: reason.trim(),
        description: description.trim() || undefined,
      });
      const created = result?.return_request || null;
      setClaim(created);
      onClaimCreated(created);
    } catch (cause) {
      setError(cause.message || 'Could not submit return request.');
    } finally {
      setSubmitting(false);
    }
  };

  const upload = async () => {
    if (uploading || !claim?.id || !files.length) return;
    if (files.length > 5) { setUploadError('You can upload up to 5 images.'); return; }
    setUploading(true); setUploadError('');
    try {
      await accountService.uploadReturnEvidence(claim.id, files);
      setUploaded(true);
      setFiles([]);
    } catch (cause) {
      setUploadError(cause.message || 'Could not upload evidence.');
    } finally {
      setUploading(false);
    }
  };

  const refreshClaim = async () => {
    if (!claim?.id) return;
    try {
      const details = await accountService.returnClaim(claim.id);
      setClaim((current) => ({ ...(current || {}), ...details, id: details.id ?? current?.id }));
    } catch (cause) {
      setUploadError(cause.message || 'Could not refresh claim status.');
    }
  };

  return <div className="fk-return-panel" role="dialog" aria-label="Return or replace item">
    <div className="fk-return-panel-header">
      <strong>Return / Replace</strong>
      <button type="button" className="fk-return-close" onClick={onClose} aria-label="Close"><X size={16} /></button>
    </div>
    <p className="fk-return-item-name">{item.product_name}{item.variant_name ? ` · ${item.variant_name}` : ''}</p>
    {loading ? <p className="fk-account-state">Checking eligibility…</p> : error && !eligibility ? <p className="fk-account-notice is-error" role="alert">{error}</p> : <>
      {eligibility && <div className={`fk-return-eligibility ${eligibility.eligible ? 'is-eligible' : 'is-ineligible'}`}>
        <p><strong>{eligibility.eligible ? 'Eligible for return or replacement' : 'Not eligible'}</strong></p>
        <p>{eligibility.message}</p>
        <div className="fk-return-eligibility-meta">
          <span>Available quantity: {eligibility.quantity_available ?? 0}</span>
          {eligibility.return_deadline && <span>Return by: {dateLabel(eligibility.return_deadline)}</span>}
        </div>
        {eligibility.active_claim && <p>Active claim: #{eligibility.active_claim.id} ({humanize(eligibility.active_claim.workflow_status || eligibility.active_claim.status)})</p>}
        {!!(eligibility.available_resolutions || []).length && <p>Available options: {(eligibility.available_resolutions || []).map(humanize).join(', ')}</p>}
      </div>}
      {error && <p className="fk-account-notice is-error" role="alert">{error}</p>}
      {claim ? <div className="fk-return-claim-result">
        <p><strong>Claim submitted</strong></p>
        <p>Claim ID: <strong>#{claim.id}</strong></p>
        <p>Status: <span className="fk-order-status">{humanize(claim.workflow_status || claim.status)}</span></p>
        <div className="fk-return-evidence">
          <label className="fk-return-label" htmlFor={`evidence-${claim.id}`}>Upload evidence (optional, up to 5 images)</label>
          <input id={`evidence-${claim.id}`} type="file" accept="image/*" multiple disabled={uploading || uploaded}
            onChange={(e) => { setUploadError(''); setFiles(Array.from(e.target.files || []).slice(0, 5)); }} />
          {files.length > 0 && <p className="fk-return-hint">{files.length} file(s) selected</p>}
          {uploadError && <p className="fk-account-notice is-error" role="alert">{uploadError}</p>}
          <div className="fk-return-actions">
            <button type="button" onClick={upload} disabled={uploading || uploaded || files.length === 0}>{uploading ? 'Uploading…' : uploaded ? 'Evidence uploaded' : 'Upload evidence'}</button>
            <button type="button" className="secondary" onClick={refreshClaim}>Refresh status</button>
          </div>
        </div>
      </div> : eligibility?.eligible && <form className="fk-return-form" onSubmit={submit}>
        <label className="fk-return-label">Resolution
          <select value={resolution} onChange={(e) => setResolution(e.target.value)} disabled={submitting}>
            {(eligibility.available_resolutions || []).map((value) => <option key={value} value={value}>{humanize(value)}</option>)}
          </select>
        </label>
        <label className="fk-return-label">Quantity
          <input type="number" min="1" max={eligibility.quantity_available || 1} value={quantity}
            onChange={(e) => setQuantity(e.target.value)} disabled={submitting} />
        </label>
        <label className="fk-return-label">Reason
          <input type="text" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. damaged, wrong item" maxLength={40} disabled={submitting} />
        </label>
        <label className="fk-return-label">Description (optional)
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Add details" maxLength={2000} rows={3} disabled={submitting} />
        </label>
        <div className="fk-return-actions">
          <button type="submit" disabled={submitting || !eligibility.eligible}>{submitting ? 'Submitting…' : 'Submit request'}</button>
          <button type="button" className="secondary" onClick={onClose} disabled={submitting}>Cancel</button>
        </div>
      </form>}
    </>}
  </div>;
}

export function AccountOrders() {
  const [orders, setOrders] = useState([]);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeReturnItemId, setActiveReturnItemId] = useState(null);
  const [claimDetails, setClaimDetails] = useState({});

  const load = async () => {
    setLoading(true); setError('');
    try { const result = await accountService.orders(); setOrders(Array.isArray(result) ? result : []); }
    catch (cause) { setError(cause.message || 'Could not load your orders.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);
  const visibleOrders = useMemo(() => orders.filter((order) => {
    const matchesQuery = `${order.order_number || ''} ${(order.items || []).map((item) => `${item.product_name} ${item.sku}`).join(' ')}`.toLowerCase().includes(query.trim().toLowerCase());
    const status = String(order.status || '').toLowerCase();
    return matchesQuery && (filter === 'all' || (filter === 'active' ? !['delivered', 'cancelled', 'refunded'].includes(status) : status === filter));
  }), [orders, query, filter]);

  const showDetails = async (order) => {
    setLoading(true); setError(''); setActiveReturnItemId(null); setClaimDetails({});
    try { setSelectedOrder(await accountService.order(order.id)); }
    catch (cause) { setError(cause.message || 'Could not load order details.'); }
    finally { setLoading(false); }
  };

  const refreshClaim = async (claimId) => {
    if (!claimId || claimDetails[claimId]?.loading) return;
    setClaimDetails((current) => ({ ...current, [claimId]: { ...(current[claimId] || {}), loading: true, error: '' } }));
    try {
      const details = await accountService.returnClaim(claimId);
      setClaimDetails((current) => ({ ...current, [claimId]: { data: details, loading: false, error: '' } }));
    } catch (cause) {
      setClaimDetails((current) => ({ ...current, [claimId]: { ...(current[claimId] || {}), loading: false, error: cause.message || 'Could not load claim.' } }));
    }
  };

  const onClaimCreated = (created) => {
    if (!selectedOrder || !created) return;
    setSelectedOrder((current) => {
      if (!current) return current;
      const summary = {
        id: created.id, order_item_id: created.order_item_id, quantity: created.quantity,
        resolution_type: created.resolution_type, reason_code: created.reason_code,
        status: created.status, workflow_status: created.workflow_status, requested_at: created.requested_at,
      };
      return {
        ...current,
        items: (current.items || []).map((item) => itemId(item) === created.order_item_id
          ? { ...item, return_claims: [summary, ...(item.return_claims || []).filter((c) => c.id !== summary.id)] }
          : item),
      };
    });
  };

  return <section className="fk-account-page fk-orders-page">
    {selectedOrder ? <>
      <button className="fk-page-back" type="button" onClick={() => setSelectedOrder(null)}><ArrowLeft size={17} /> Back to orders</button>
      <div className="fk-page-heading"><div><h1>Order details</h1><p>Placed {dateLabel(selectedOrder.created_at)}</p></div><span className="fk-order-status">{humanize(selectedOrder.status)}</span></div>
      <section className="fk-order-detail-card"><div className="fk-order-detail-heading"><strong>{selectedOrder.order_number}</strong><span>{money(selectedOrder.total_amount, selectedOrder.currency)}</span></div>
        <div className="fk-order-detail-meta"><span>Payment method: {humanize(selectedOrder.payment_method)}</span><span>Payment status: {humanize(selectedOrder.payment_status)}</span></div>
      </section>
      {selectedOrder.delivery_address && <section className="fk-order-detail-card"><h2>Delivery address</h2><p><strong>{selectedOrder.delivery_address.recipient_name}</strong> · {selectedOrder.delivery_address.mobile_number}</p><p>{[selectedOrder.delivery_address.address_line1, selectedOrder.delivery_address.address_line2, selectedOrder.delivery_address.locality, selectedOrder.delivery_address.city, selectedOrder.delivery_address.state, selectedOrder.delivery_address.pin_code].filter(Boolean).join(', ')}</p></section>}
      <section className="fk-order-detail-card"><h2>Items</h2><div className="fk-order-items">{(selectedOrder.items || []).map((item, index) => {
        const id = itemId(item);
        const claims = item.return_claims || [];
        const isDelivered = String(selectedOrder.status || '').toLowerCase() === 'delivered';
        return <article className="fk-order-item fk-order-item-return" key={id || `${item.sku}-${index}`}>
          {item.image ? <img src={item.image} alt="" loading="lazy" decoding="async" /> : <span className="fk-order-image-placeholder"><Package size={22} /></span>}
          <div className="fk-order-item-info">
            <strong>{item.product_name}</strong>
            <span>{item.variant_name || 'Standard option'}{item.sku ? ` · SKU ${item.sku}` : ''}</span>
            <span>Quantity {item.quantity}</span>
            {claims.length > 0 && <div className="fk-return-claims">
              {claims.map((claim) => {
                const detail = claimDetails[claim.id]?.data;
                const status = (detail?.workflow_status || detail?.status || claim.workflow_status || claim.status);
                return <div className="fk-return-claim-chip" key={claim.id}>
                  <span>Claim #{claim.id}: <span className="fk-order-status">{humanize(status)}</span></span>
                  <button type="button" onClick={() => refreshClaim(claim.id)} disabled={claimDetails[claim.id]?.loading}>{claimDetails[claim.id]?.loading ? 'Refreshing…' : 'Refresh'}</button>
                  {claimDetails[claim.id]?.error && <span className="fk-return-claim-error">{claimDetails[claim.id].error}</span>}
                </div>;
              })}
            </div>}
            {isDelivered && <div className="fk-order-item-actions">
              <button type="button" onClick={() => setActiveReturnItemId(activeReturnItemId === id ? null : id)}>
                {activeReturnItemId === id ? 'Hide return options' : 'Return / Replace'}
              </button>
            </div>}
            {activeReturnItemId === id && <ReturnPanel order={selectedOrder} item={item}
              onClose={() => setActiveReturnItemId(null)} onClaimCreated={onClaimCreated} />}
          </div>
          <b>{money(item.line_total, selectedOrder.currency)}</b>
        </article>;
      })}</div></section>
      {selectedOrder.shipment && <section className="fk-order-detail-card"><h2>Shipment</h2><p>Status: {humanize(selectedOrder.shipment.status)}</p>{selectedOrder.shipment.tracking_reference && <p>Tracking reference: {selectedOrder.shipment.tracking_reference}</p>}</section>}
      <div className="fk-order-total"><span>Order total</span><strong>{money(selectedOrder.total_amount, selectedOrder.currency)}</strong></div>
    </> : <>
      <div className="fk-page-heading"><div><h1>My Orders</h1><p>Review your purchases and delivery details.</p></div></div>
      <div className="fk-orders-toolbar"><label className="fk-orders-search"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search order number or product" aria-label="Search orders" /></label>
        <select value={filter} onChange={(event) => setFilter(event.target.value)} aria-label="Filter orders"><option value="all">All orders</option><option value="active">In progress</option><option value="delivered">Delivered</option><option value="cancelled">Cancelled</option></select>
      </div>
      {error && <p className="fk-account-notice is-error" role="alert">{error}</p>}
      {loading ? <p className="fk-account-state" role="status">Loading your orders…</p> : visibleOrders.length ? <div className="fk-order-list">{visibleOrders.map((order) => <article className="fk-order-card" key={order.id}>
        <header className="fk-order-card-header"><div><span className="fk-order-number">{order.order_number}</span><span className="fk-order-date">Placed {dateLabel(order.created_at)}</span></div><div className="fk-order-header-total"><span>Total</span><strong>{money(order.total_amount, order.currency)}</strong></div></header>
        <div className="fk-order-card-status"><span className="fk-order-status">{humanize(order.status)}</span><span>Payment: {humanize(order.payment_status)}</span><span>{humanize(order.payment_method)}</span></div>
        <div className="fk-order-card-items">{(order.items || []).map((item, index) => <div className="fk-order-card-item" key={`${item.sku}-${index}`}>
          {item.image ? <img src={item.image} alt="" loading="lazy" decoding="async" /> : <span className="fk-order-image-placeholder"><Package size={20} /></span>}
          <div><strong>{item.product_name}</strong><span>{item.variant_name || 'Standard option'}{item.sku ? ` · SKU ${item.sku}` : ''} · Qty {item.quantity}</span></div><b>{money(item.line_total, order.currency)}</b>
        </div>)}</div>
        <footer><button type="button" onClick={() => showDetails(order)}>View details</button></footer>
      </article>)}</div> : <div className="fk-account-empty"><Package size={34} /><strong>{orders.length ? 'No matching orders' : "You haven't placed any orders yet."}</strong><p>{orders.length ? 'Try another search or status filter.' : 'Your order history will appear here after a purchase.'}</p></div>}
    </>}
  </section>;
}
