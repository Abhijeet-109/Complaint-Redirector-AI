import React, { useState, useEffect } from 'react';
import { X, Package, Clock, CheckCircle2, AlertTriangle, MessageSquarePlus } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { complaintService } from '../../services/complaintService';

export function OrdersModal({ isOpen, onClose, onOpenChatbot }) {
  const { user, isAuthenticated } = useAuth();
  const [complaints, setComplaints] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('orders'); // 'orders' or 'complaints'

  useEffect(() => {
    if (isOpen && isAuthenticated) {
      setLoading(true);
      complaintService.getMyComplaints()
        .then((data) => setComplaints(data || []))
        .catch(() => setComplaints([]))
        .finally(() => setLoading(false));
    }
  }, [isOpen, isAuthenticated]);

  if (!isOpen) return null;

  const mockOrders = [
    {
      id: 'OD192837465',
      date: '10 Oct 2026',
      product: 'Roadster - Men Sold Casual Shirt (Forest Green)',
      status: 'Delivered',
      total: '₹1,299',
      image: '/assets/prod_roadster.png',
    },
    {
      id: 'OD182736452',
      date: '06 Oct 2026',
      product: 'Puma - Unisex Smashic Sneakers',
      status: 'Out for Delivery',
      total: '₹2,799',
      image: '/assets/prod_puma.png',
    },
  ];

  return (
    <div className="fk-modal-overlay" onClick={onClose}>
      <div className="fk-auth-modal" style={{ maxWidth: '640px' }} onClick={(e) => e.stopPropagation()}>
        <div className="fk-auth-header">
          <div style={{ display: 'flex', gap: '16px' }}>
            <button
              style={{
                color: activeTab === 'orders' ? 'var(--fk-gold)' : '#FFFFFF',
                fontWeight: activeTab === 'orders' ? '700' : '500',
                fontSize: '15px',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
              }}
              onClick={() => setActiveTab('orders')}
            >
              My Orders
            </button>
            <button
              style={{
                color: activeTab === 'complaints' ? 'var(--fk-gold)' : '#FFFFFF',
                fontWeight: activeTab === 'complaints' ? '700' : '500',
                fontSize: '15px',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
              }}
              onClick={() => setActiveTab('complaints')}
            >
              My Support Tickets ({complaints.length})
            </button>
          </div>
          <button style={{ color: '#FFFFFF', background: 'none', border: 'none', cursor: 'pointer' }} onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div style={{ padding: '20px', maxHeight: '480px', overflowY: 'auto' }}>
          {activeTab === 'orders' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {mockOrders.map((ord) => (
                <div
                  key={ord.id}
                  style={{
                    display: 'flex',
                    gap: '14px',
                    padding: '14px',
                    background: 'var(--fk-surface)',
                    borderRadius: '8px',
                    border: '1px solid #ECE8DE',
                  }}
                >
                  <img src={ord.image} alt={ord.product} style={{ width: '60px', height: '60px', objectFit: 'contain', background: '#FFFFFF', borderRadius: '4px' }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '12px', fontWeight: '700', color: 'var(--fk-text-muted)' }}>
                        Order ID: {ord.id}
                      </span>
                      <span style={{ fontSize: '12px', fontWeight: '700', color: 'var(--fk-olive)' }}>
                        {ord.status}
                      </span>
                    </div>
                    <div style={{ fontSize: '13.5px', fontWeight: '700', color: 'var(--fk-text-primary)', margin: '4px 0' }}>
                      {ord.product}
                    </div>
                    <div style={{ fontSize: '13px', color: 'var(--fk-text-muted)' }}>
                      Total: <strong style={{ color: 'var(--fk-price-coral)' }}>{ord.total}</strong> &bull; Ordered on {ord.date}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <button
                      style={{
                        padding: '6px 10px',
                        background: '#FFFFFF',
                        border: '1px solid var(--fk-olive)',
                        color: 'var(--fk-text-primary)',
                        borderRadius: '4px',
                        fontSize: '11.5px',
                        fontWeight: '600',
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                      }}
                      onClick={() => {
                        onClose();
                        onOpenChatbot();
                      }}
                    >
                      Need Help?
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div>
              {loading ? (
                <div style={{ textAlign: 'center', padding: '30px' }}>Loading support tickets...</div>
              ) : complaints.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '30px', color: 'var(--fk-text-muted)' }}>
                  <div>No open support tickets for this account.</div>
                  <button
                    className="fk-auth-btn"
                    style={{ marginTop: '16px', display: 'inline-block' }}
                    onClick={() => {
                      onClose();
                      onOpenChatbot();
                    }}
                  >
                    Raise a New Issue
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {complaints.map((c) => (
                    <div
                      key={c.id}
                      style={{
                        padding: '12px 16px',
                        background: 'var(--fk-surface)',
                        borderRadius: '8px',
                        border: '1px solid #ECE8DE',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                        <span style={{ fontSize: '12px', fontWeight: '700', color: 'var(--fk-text-muted)' }}>
                          Ticket #{c.id} &bull; {new Date(c.create_at).toLocaleDateString()}
                        </span>
                        <span
                          style={{
                            fontSize: '11px',
                            fontWeight: '700',
                            padding: '2px 8px',
                            borderRadius: '10px',
                            backgroundColor: c.status === 'processed' ? '#E8F5E9' : '#FFF3E0',
                            color: c.status === 'processed' ? '#2E7D32' : '#E65100',
                            textTransform: 'uppercase',
                          }}
                        >
                          {c.status}
                        </span>
                      </div>
                      <div style={{ fontSize: '13.5px', color: 'var(--fk-text-primary)', marginBottom: '8px' }}>
                        "{c.complaint_text}"
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--fk-text-muted)' }}>
                        Assigned: <strong>{c.current_department || c.predicted_department || 'Processing'}</strong>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
