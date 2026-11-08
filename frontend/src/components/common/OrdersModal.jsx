import React, { useState, useEffect } from 'react';
import { X, Package, MessageSquarePlus } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { complaintService } from '../../services/complaintService';

export function OrdersModal({ isOpen, onClose, onOpenChatbot }) {
  const { user, isAuthenticated } = useAuth();
  const [complaints, setComplaints] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('orders');

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
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '40px 20px', gap: '12px', color: 'var(--fk-text-muted)', textAlign: 'center' }}>
              <Package size={40} strokeWidth={1.25} style={{ opacity: 0.45 }} />
              <p style={{ margin: 0, fontSize: '15px', fontWeight: '700', color: 'var(--fk-text-primary)' }}>
                You haven't placed any orders yet.
              </p>
              <p style={{ margin: 0, fontSize: '13.5px', lineHeight: '1.55' }}>
                Your orders will appear here after you complete a purchase.
              </p>
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
