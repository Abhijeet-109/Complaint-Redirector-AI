import React, { useState } from 'react';
import { ArrowRight, PackageCheck, Truck } from 'lucide-react';
import { handlerService } from '../../services/handlerService';

const dateLabel = (value) => value ? new Date(value).toLocaleString('en-IN') : 'Not recorded';
const statusLabel = (value) => String(value || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

export function HandlerOrderDeliveryView({ kind, orders = [], shipments = [], loading, error, onRefresh, onNavigate }) {
  const [targets, setTargets] = useState({});
  const [notes, setNotes] = useState({});
  const [saving, setSaving] = useState({});
  const [actionError, setActionError] = useState('');

  const submit = async (id, type) => {
    const status = targets[id];
    if (!status || saving[id]) return;
    setSaving((prev) => ({ ...prev, [id]: true }));
    setActionError('');
    try {
      if (type === 'order') await handlerService.updateOrderDeliveryOrderStatus(id, status, notes[id]);
      else await handlerService.updateOrderDeliveryShipmentStatus(id, status, notes[id]);
      setTargets((prev) => ({ ...prev, [id]: '' }));
      setNotes((prev) => ({ ...prev, [id]: '' }));
      await onRefresh();
    } catch (cause) {
      setActionError(cause.message || 'The status could not be updated. Refresh and try again.');
    } finally {
      setSaving((prev) => ({ ...prev, [id]: false }));
    }
  };

  if (kind === 'dashboard') {
    return (
      <section className="hd-page">
        <header className="hd-page-header"><h1 className="hd-page-title">Order &amp; Delivery</h1><p>Manage customer orders, outbound shipments, and assigned return handoffs.</p></header>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
          {[
            { title: 'Order Management', detail: `${orders.length} active orders`, path: '/handler/orders', Icon: PackageCheck },
            { title: 'Shipment Management', detail: `${shipments.length} active shipments`, path: '/handler/shipments', Icon: Truck },
            { title: 'Returns & Replacement', detail: 'Pickup and replacement handoffs', path: '/handler/tracking', Icon: ArrowRight },
          ].map(({ title, detail, path, Icon }) => (
            <button key={path} type="button" className="hd-card" onClick={() => onNavigate('handler-dashboard', path)} style={{ textAlign: 'left', padding: 22, cursor: 'pointer' }}>
              <Icon size={22} /><h2>{title}</h2><p>{detail}</p><span>Open section <ArrowRight size={14} /></span>
            </button>
          ))}
        </div>
      </section>
    );
  }

  const isOrders = kind === 'orders';
  const rows = isOrders ? orders : shipments;
  const title = isOrders ? 'Order Management' : 'Shipment Management';
  return (
    <section className="hd-page">
      <header className="hd-page-header">
        <div><h1 className="hd-page-title">{title}</h1><p>{isOrders ? 'Advance each order through its preparation stages.' : 'Receive, schedule, dispatch, and complete outbound deliveries.'}</p></div>
        <button type="button" onClick={onRefresh} disabled={loading}>Refresh</button>
      </header>
      {actionError && <div role="alert" className="hd-toast hd-toast-error">{actionError}</div>}
      {error && <div role="alert" className="hd-detail-error">{error}</div>}
      {loading ? <p role="status">Loading {title.toLowerCase()}…</p> : rows.length === 0 ? (
        <div className="hd-card" style={{ padding: 24 }}>No {isOrders ? 'orders' : 'shipments'} currently require action.</div>
      ) : (
        <div style={{ display: 'grid', gap: 14 }}>
          {rows.map((row) => {
            const id = isOrders ? row.id : row.order_id;
            const address = row.delivery_address || {};
            return (
              <article className="hd-card" key={`${kind}-${id}`} style={{ padding: 20 }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 14 }}>
                  <div>
                    <h2 style={{ margin: 0 }}>{row.order_number || `Order #${id}`}</h2>
                    <p style={{ margin: '6px 0' }}>Customer: {row.customer_name || address.recipient_name || 'Unavailable'}</p>
                    <p style={{ margin: '6px 0' }}>{isOrders ? 'Order status' : 'Shipment status'}: <strong>{statusLabel(isOrders ? row.status : row.status)}</strong></p>
                    <p style={{ margin: '6px 0' }}>{(row.items || []).map((item) => `${item.product_name}${item.variant_name ? ` (${item.variant_name})` : ''} × ${item.quantity}`).join(', ') || row.product_summary || 'Items unavailable'}</p>
                    {!isOrders && <>
                      <p style={{ margin: '6px 0' }}>Destination: {[address.locality, address.city, address.state, address.pin_code].filter(Boolean).join(', ') || 'Address unavailable'}</p>
                      <p style={{ margin: '6px 0' }}>Scheduled delivery: {dateLabel(row.estimated_delivery_date)}</p>
                      <p style={{ margin: '6px 0' }}>Carrier: {row.carrier || 'Not assigned'} · Tracking: {row.tracking_reference || 'Not available'}</p>
                    </>}
                    <p style={{ margin: '6px 0' }}>Placed: {dateLabel(row.placed_at || row.created_at)}</p>
                  </div>
                  <div style={{ minWidth: 250, flex: '0 1 360px' }}>
                    {(row.next_status_options || []).length > 0 ? <>
                      <label style={{ display: 'block', marginBottom: 6 }} htmlFor={`${kind}-status-${id}`}>Next stage</label>
                      <select id={`${kind}-status-${id}`} value={targets[id] || ''} onChange={(e) => setTargets((prev) => ({ ...prev, [id]: e.target.value }))} style={{ width: '100%', padding: 9, marginBottom: 8 }}>
                        <option value="">Choose next stage</option>
                        {row.next_status_options.map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}
                      </select>
                      <label style={{ display: 'block', marginBottom: 6 }} htmlFor={`${kind}-note-${id}`}>Operational note (optional)</label>
                      <textarea id={`${kind}-note-${id}`} value={notes[id] || ''} maxLength={500} onChange={(e) => setNotes((prev) => ({ ...prev, [id]: e.target.value }))} rows={2} style={{ width: '100%', padding: 9, marginBottom: 8 }} />
                      <button type="button" disabled={!targets[id] || saving[id]} onClick={() => submit(id, isOrders ? 'order' : 'shipment')}>
                        {saving[id] ? 'Saving…' : 'Update status'}
                      </button>
                    </> : <p>This record has no further supported transition.</p>}
                  </div>
                </div>
                {!isOrders && row.events?.length > 0 && (
                  <div style={{ borderTop: '1px solid #e5e7eb', marginTop: 16, paddingTop: 12 }}>
                    <strong>Shipment history</strong>
                    <ol>{row.events.map((event) => <li key={event.id}>{statusLabel(event.new_status)} · {dateLabel(event.created_at)}{event.note ? ` — ${event.note}` : ''}</li>)}</ol>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

export default HandlerOrderDeliveryView;
