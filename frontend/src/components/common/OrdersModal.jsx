import React, { useEffect, useState } from 'react';
import { X, Package } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { complaintService } from '../../services/complaintService';
import { accountService } from '../../services/accountService';

const money = (value, currency = 'INR') => new Intl.NumberFormat('en-IN', { style: 'currency', currency }).format(Number(value || 0));

export function OrdersModal({ isOpen, onClose, onOpenChatbot }) {
  const { isAuthenticated } = useAuth();
  const [complaints, setComplaints] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('orders');
  const [selectedOrder, setSelectedOrder] = useState(null);

  useEffect(() => {
    if (!isOpen || !isAuthenticated) return;
    let active = true;
    setLoading(true); setError(''); setSelectedOrder(null);
    const request = activeTab === 'orders' ? accountService.orders() : complaintService.getMyComplaints();
    request.then((data) => {
      if (!active) return;
      if (activeTab === 'orders') setOrders(data || []);
      else setComplaints(data || []);
    }).catch((cause) => { if (active) setError(cause.message || `Could not load ${activeTab}.`); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [isOpen, isAuthenticated, activeTab]);

  if (!isOpen) return null;
  const loadOrderDetails = async (order) => {
    setLoading(true); setError('');
    try { setSelectedOrder(await accountService.order(order.id)); }
    catch (cause) { setError(cause.message || 'Could not load order details.'); }
    finally { setLoading(false); }
  };

  return <div className="fk-modal-overlay" onClick={onClose}>
    <section className="fk-auth-modal" style={{ maxWidth: 760, maxHeight: '86vh', overflow: 'hidden' }} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Order history and support tickets">
      <div className="fk-auth-header">
        <div style={{ display: 'flex', gap: 16 }}>
          <button type="button" onClick={() => { setActiveTab('orders'); setSelectedOrder(null); }} style={{ color: activeTab === 'orders' ? 'var(--fk-gold)' : '#fff', fontWeight: activeTab === 'orders' ? 700 : 500, fontSize: 15, background: 'none', border: 0, cursor: 'pointer' }}>My Orders</button>
          <button type="button" onClick={() => { setActiveTab('complaints'); setSelectedOrder(null); }} style={{ color: activeTab === 'complaints' ? 'var(--fk-gold)' : '#fff', fontWeight: activeTab === 'complaints' ? 700 : 500, fontSize: 15, background: 'none', border: 0, cursor: 'pointer' }}>My Support Tickets ({complaints.length})</button>
        </div>
        <button type="button" aria-label="Close" style={{ color: '#fff', background: 'none', border: 0, cursor: 'pointer' }} onClick={onClose}><X size={20} /></button>
      </div>
      <div style={{ padding: 20, maxHeight: 'calc(86vh - 65px)', overflowY: 'auto' }}>
        {error && <p role="alert" className="fk-checkout-error">{error}</p>}
        {loading ? <p role="status" style={{ textAlign: 'center', padding: 30 }}>Loading {activeTab}…</p> : activeTab === 'orders' ? (
          selectedOrder ? <div>
            <button type="button" className="fk-checkout-back" onClick={() => setSelectedOrder(null)}>← Back to orders</button>
            <h2>{selectedOrder.order_number}</h2>
            <p>{selectedOrder.status} · {selectedOrder.payment_method || 'Payment method unavailable'} · {selectedOrder.payment_status}</p>
            <p>{selectedOrder.delivery_address && `${selectedOrder.delivery_address.recipient_name}, ${selectedOrder.delivery_address.address_line1}, ${selectedOrder.delivery_address.locality}, ${selectedOrder.delivery_address.city}, ${selectedOrder.delivery_address.state} ${selectedOrder.delivery_address.pin_code}`}</p>
            {(selectedOrder.items || []).map((item, index) => <article key={`${item.sku}-${index}`} className="fk-drawer-item">
              {item.image && <img src={item.image} alt="" className="fk-drawer-item-img" />}
              <div><strong>{item.product_name}</strong><p>{item.variant_name} · {item.sku} · Qty {item.quantity}</p><b>{money(item.line_total, selectedOrder.currency)}</b></div>
            </article>)}
            <strong>Total {money(selectedOrder.total_amount, selectedOrder.currency)}</strong>
            {selectedOrder.shipment && <p>Shipment: {selectedOrder.shipment.status}{selectedOrder.shipment.tracking_reference ? ` · ${selectedOrder.shipment.tracking_reference}` : ''}</p>}
          </div> : orders.length === 0 ? <div style={{ display: 'grid', justifyItems: 'center', padding: '40px 20px', gap: 12, color: 'var(--fk-text-muted)', textAlign: 'center' }}><Package size={40} strokeWidth={1.25} /><strong style={{ color: 'var(--fk-text-primary)' }}>You haven't placed any orders yet.</strong><p>Your order history will appear here after a completed purchase.</p></div>
            : <div style={{ display: 'grid', gap: 12 }}>{orders.map((order) => <article key={order.id} style={{ padding: 14, border: '1px solid #e7e5dc', borderRadius: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}><strong>{order.order_number}</strong><strong>{money(order.total_amount, order.currency)}</strong></div>
              <p style={{ color: 'var(--fk-text-muted)', margin: '7px 0' }}>{order.created_at ? new Date(order.created_at).toLocaleDateString() : 'Date unavailable'} · {order.payment_method || 'Payment method unavailable'} · {order.payment_status} · {order.status}</p>
              {(order.items || []).map((item, index) => <div key={`${item.sku}-${index}`} style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 8 }}>
                {item.image && <img src={item.image} alt="" style={{ width: 42, height: 48, objectFit: 'cover', borderRadius: 4 }} />}
                <span>{item.product_name} · Qty {item.quantity}</span>
              </div>)}
              <button type="button" className="fk-checkout-back" onClick={() => loadOrderDetails(order)}>View details</button>
            </article>)}</div>
        ) : complaints.length === 0 ? <div style={{ textAlign: 'center', padding: 30, color: 'var(--fk-text-muted)' }}>No support tickets for this account.</div> : <div style={{ display: 'grid', gap: 12 }}>{complaints.map((item) => <article key={item.id} style={{ padding: 12, background: 'var(--fk-surface)', borderRadius: 8, border: '1px solid #ece8de' }}><strong>Ticket #{item.id} · {new Date(item.create_at).toLocaleDateString()}</strong><p>{item.complaint_text}</p><span>Status: {item.status} · Assigned: {item.current_department || item.predicted_department || 'Processing'}</span></article>)}</div>}
        {activeTab === 'complaints' && !loading && complaints.length === 0 && onOpenChatbot && <button type="button" className="fk-auth-btn" style={{ margin: '0 auto 12px', display: 'block' }} onClick={() => { onClose(); onOpenChatbot(); }}>Raise a New Issue</button>}
      </div>
    </section>
  </div>;
}
