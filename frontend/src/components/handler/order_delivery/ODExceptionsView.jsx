import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  AlertTriangle,
  RefreshCw,
  Search,
  CheckCircle2,
  X,
  MapPin,
  Clock,
  ShieldCheck,
} from 'lucide-react';
import { handlerService } from '../../../services/handlerService';

function StatusBadge({ status }) {
  const config = {
    failed: { bg: '#FEE2E2', color: '#991B1B', label: 'Failed' },
    shipped: { bg: '#CFFAFE', color: '#0E7490', label: 'In Transit' },
    out_for_delivery: { bg: '#FFEDD5', color: '#C2410C', label: 'Out for Delivery' },
    scheduled: { bg: '#FEF3C7', color: '#B45309', label: 'Scheduled' },
  }[String(status || '').toLowerCase()] || { bg: '#F5F5F4', color: '#78716C', label: status || 'Pending' };

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '3px 8px',
        borderRadius: 4,
        fontSize: 11,
        fontWeight: 600,
        backgroundColor: config.bg,
        color: config.color,
      }}
    >
      {config.label}
    </span>
  );
}

export function ODExceptionsView({ onNavigate }) {
  const [exceptions, setExceptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedException, setSelectedException] = useState(null);

  const loadExceptions = useCallback(async () => {
    try {
      setRefreshing(true);
      const res = await handlerService.getOrderDeliveryExceptions({ limit: 50 });
      setExceptions(res.items || []);
    } catch (err) {
      console.error('Failed to load exceptions:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadExceptions();
  }, [loadExceptions]);

  const filteredExceptions = useMemo(() => {
    if (!searchTerm.trim()) return exceptions;
    const q = searchTerm.toLowerCase();
    return exceptions.filter(
      (ex) =>
        (ex.order_number || '').toLowerCase().includes(q) ||
        (ex.shipment_id || '').toLowerCase().includes(q) ||
        (ex.customer_name || '').toLowerCase().includes(q) ||
        (ex.carrier || '').toLowerCase().includes(q)
    );
  }, [exceptions, searchTerm]);

  return (
    <div style={{ padding: '0 4px 30px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: '#122D29', margin: 0, letterSpacing: '-0.02em' }}>
            Delivery Exceptions
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#68726E' }}>
            Investigate shipments that require operational attention or carrier intervention.
          </p>
        </div>
        <button
          type="button"
          onClick={loadExceptions}
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

      {/* Toolbar */}
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
        }}
      >
        <div style={{ position: 'relative', flex: '1 1 240px', maxWidth: 360 }}>
          <Search size={14} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: '#88928E' }} />
          <input
            type="text"
            placeholder="Search order #, tracking, carrier..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
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
      </div>

      {/* Main Table or Clean Empty State */}
      <div style={{ background: '#FFFFFF', border: '1px solid #E8E4D8', borderRadius: 8, overflow: 'hidden' }}>
        {loading && exceptions.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#68726E', fontSize: 13 }}>
            Checking delivery exceptions...
          </div>
        ) : filteredExceptions.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center', color: '#68726E' }}>
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: '50%',
                backgroundColor: '#DCFCE7',
                color: '#15803D',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 12,
              }}
            >
              <ShieldCheck size={26} />
            </div>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#122D29' }}>
              No delivery exceptions found
            </h3>
            <p style={{ margin: '6px 0 0', fontSize: 13, color: '#88928E', maxWidth: 360, marginInline: 'auto' }}>
              All shipments in transit or scheduled are proceeding on schedule without recorded carrier flags.
            </p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, textAlign: 'left' }}>
              <thead>
                <tr style={{ background: '#FAF7F2', borderBottom: '1px solid #E8E4D8', color: '#5A6460', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  <th style={{ padding: '10px 16px', fontWeight: 600 }}>Shipment Ref</th>
                  <th style={{ padding: '10px 16px', fontWeight: 600 }}>Order Number</th>
                  <th style={{ padding: '10px 16px', fontWeight: 600 }}>Customer</th>
                  <th style={{ padding: '10px 16px', fontWeight: 600 }}>Destination</th>
                  <th style={{ padding: '10px 16px', fontWeight: 600 }}>Exception Reason</th>
                  <th style={{ padding: '10px 16px', fontWeight: 600 }}>Status</th>
                  <th style={{ padding: '10px 16px', fontWeight: 600 }}>Target ETA</th>
                  <th style={{ padding: '10px 16px', fontWeight: 600, textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredExceptions.map((ex) => (
                  <tr
                    key={ex.id}
                    style={{ borderBottom: '1px solid #F0ECE1' }}
                    onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#FAF7F2'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                  >
                    <td style={{ padding: '12px 16px', fontWeight: 700, color: '#122D29' }}>
                      {ex.shipment_id}
                    </td>
                    <td style={{ padding: '12px 16px', fontWeight: 600, color: '#183A34' }}>
                      {ex.order_number}
                    </td>
                    <td style={{ padding: '12px 16px', color: '#2B322F', fontWeight: 500 }}>
                      {ex.customer_name}
                    </td>
                    <td style={{ padding: '12px 16px', color: '#5A6460' }}>
                      {ex.destination}
                    </td>
                    <td style={{ padding: '12px 16px', color: '#B45309', fontWeight: 600 }}>
                      {ex.exception_reason}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <StatusBadge status={ex.status} />
                    </td>
                    <td style={{ padding: '12px 16px', color: '#88928E' }}>
                      {ex.estimated_delivery_date ? new Date(ex.estimated_delivery_date).toLocaleDateString('en-IN') : '—'}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                      <button
                        type="button"
                        onClick={() => setSelectedException(ex)}
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
                        Review
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Review Drawer */}
      {selectedException && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            right: 0,
            bottom: 0,
            width: 460,
            maxWidth: '100vw',
            backgroundColor: '#FFFFFF',
            boxShadow: '-4px 0 24px rgba(18, 45, 41, 0.15)',
            zIndex: 100,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div style={{ padding: '18px 22px', borderBottom: '1px solid #E8E4D8', display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#FAF7F2' }}>
            <h2 style={{ fontSize: 17, fontWeight: 800, color: '#122D29', margin: 0 }}>
              Exception Investigation: {selectedException.shipment_id}
            </h2>
            <button
              type="button"
              onClick={() => setSelectedException(null)}
              style={{ background: 'none', border: 'none', color: '#68726E', cursor: 'pointer', padding: 4 }}
            >
              <X size={18} />
            </button>
          </div>

          <div style={{ flex: 1, padding: '20px 22px', overflowY: 'auto' }}>
            <div style={{ backgroundColor: '#FEF3C7', color: '#92400E', padding: '10px 14px', borderRadius: 6, fontSize: 12.5, fontWeight: 600, marginBottom: 16 }}>
              {selectedException.exception_reason}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontSize: 13 }}>
              <div>
                <span style={{ color: '#88928E', fontSize: 11 }}>Order Reference:</span>
                <div style={{ fontWeight: 600, color: '#122D29' }}>{selectedException.order_number}</div>
              </div>
              <div>
                <span style={{ color: '#88928E', fontSize: 11 }}>Customer:</span>
                <div style={{ fontWeight: 600, color: '#122D29' }}>{selectedException.customer_name}</div>
              </div>
              <div>
                <span style={{ color: '#88928E', fontSize: 11 }}>Destination:</span>
                <div style={{ color: '#3A423F' }}>{selectedException.destination}</div>
              </div>
              <div>
                <span style={{ color: '#88928E', fontSize: 11 }}>Carrier &amp; Tracking:</span>
                <div style={{ color: '#3A423F' }}>{selectedException.carrier} · {selectedException.tracking_reference}</div>
              </div>
            </div>

            <div style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid #EFECE4' }}>
              <button
                type="button"
                onClick={() => {
                  setSelectedException(null);
                  onNavigate && onNavigate('handler-dashboard', '/handler/shipments');
                }}
                style={{
                  width: '100%',
                  background: '#183A34',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: 6,
                  padding: '10px 16px',
                  fontSize: 12.5,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Open in Shipment Management
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ODExceptionsView;

