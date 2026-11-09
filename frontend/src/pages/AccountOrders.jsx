import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Package, Search } from 'lucide-react';
import { accountService } from '../services/accountService';
import './accountPages.css';

const money = (value, currency = 'INR') => new Intl.NumberFormat('en-IN', { style: 'currency', currency }).format(Number(value || 0));
const labels = {
  pending_payment: 'Payment pending', placed: 'Order processing', payment_failed: 'Payment failed',
  captured: 'Paid', pending: 'Pending', failed: 'Failed', processing: 'Processing', shipped: 'Shipped',
  delivered: 'Delivered', cancelled: 'Cancelled', refunded: 'Refunded', cod: 'Cash on Delivery',
  upi: 'UPI', netbanking: 'Net Banking',
};
const humanize = (value) => labels[String(value || '').toLowerCase()] || String(value || 'Unavailable').replace(/[_-]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
const dateLabel = (value) => value ? new Date(value).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Date unavailable';

export function AccountOrders() {
  const [orders, setOrders] = useState([]);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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
    setLoading(true); setError('');
    try { setSelectedOrder(await accountService.order(order.id)); }
    catch (cause) { setError(cause.message || 'Could not load order details.'); }
    finally { setLoading(false); }
  };

  return <section className="fk-account-page fk-orders-page">
    {selectedOrder ? <>
      <button className="fk-page-back" type="button" onClick={() => setSelectedOrder(null)}><ArrowLeft size={17} /> Back to orders</button>
      <div className="fk-page-heading"><div><h1>Order details</h1><p>Placed {dateLabel(selectedOrder.created_at)}</p></div><span className="fk-order-status">{humanize(selectedOrder.status)}</span></div>
      <section className="fk-order-detail-card"><div className="fk-order-detail-heading"><strong>{selectedOrder.order_number}</strong><span>{money(selectedOrder.total_amount, selectedOrder.currency)}</span></div>
        <div className="fk-order-detail-meta"><span>Payment method: {humanize(selectedOrder.payment_method)}</span><span>Payment status: {humanize(selectedOrder.payment_status)}</span></div>
      </section>
      {selectedOrder.delivery_address && <section className="fk-order-detail-card"><h2>Delivery address</h2><p><strong>{selectedOrder.delivery_address.recipient_name}</strong> · {selectedOrder.delivery_address.mobile_number}</p><p>{[selectedOrder.delivery_address.address_line1, selectedOrder.delivery_address.address_line2, selectedOrder.delivery_address.locality, selectedOrder.delivery_address.city, selectedOrder.delivery_address.state, selectedOrder.delivery_address.pin_code].filter(Boolean).join(', ')}</p></section>}
      <section className="fk-order-detail-card"><h2>Items</h2><div className="fk-order-items">{(selectedOrder.items || []).map((item, index) => <article className="fk-order-item" key={`${item.sku}-${index}`}>
        {item.image ? <img src={item.image} alt="" loading="lazy" decoding="async" /> : <span className="fk-order-image-placeholder"><Package size={22} /></span>}
        <div className="fk-order-item-info"><strong>{item.product_name}</strong><span>{item.variant_name || 'Standard option'}{item.sku ? ` · SKU ${item.sku}` : ''}</span><span>Quantity {item.quantity}</span></div><b>{money(item.line_total, selectedOrder.currency)}</b>
      </article>)}</div></section>
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
