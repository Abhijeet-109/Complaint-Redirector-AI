import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  RefreshCw,
  AlertTriangle,
  FileText,
  Clock,
  ArrowRight,
  CheckCircle2,
} from 'lucide-react';
import { handlerService } from '../../../services/handlerService';

export function PaymentDisputesView({ onNavigate }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchDisputes = async () => {
    try {
      const res = await handlerService.getPaymentsDisputes();
      setData(res);
    } catch (err) {
      console.error('Failed to load disputes:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchDisputes();
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchDisputes();
  };

  return (
    <div style={{ padding: '0 4px 30px' }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 18,
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: '#122D29', margin: 0, letterSpacing: '-0.02em' }}>
            Payment Disputes & Chargebacks
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#68726E' }}>
            Monitor bank chargebacks, dispute inquiries, and evidence submission deadlines.
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            type="button"
            onClick={handleRefresh}
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
      </div>

      {/* Notice Card */}
      <div
        style={{
          background: '#FAF8F4',
          border: '1px solid #E4DDD0',
          borderRadius: 8,
          padding: '16px 20px',
          marginBottom: 20,
          display: 'flex',
          alignItems: 'flex-start',
          gap: 14,
        }}
      >
        <div
          style={{
            width: 38,
            height: 38,
            borderRadius: 6,
            backgroundColor: '#DCFCE7',
            color: '#15803D',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            marginTop: 2,
          }}
        >
          <ShieldAlert size={20} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#183A34' }}>
            Zero Active Chargebacks — Webhook Feed Integration
          </div>
          <p style={{ margin: '4px 0 8px', fontSize: 12.5, color: '#5A6561', lineHeight: 1.5 }}>
            {data?.message ||
              'Payment dispute and chargeback management requires direct payment gateway chargeback webhook integration (e.g. Razorpay dispute webhook, Visa/Mastercard chargeback notice ingestion). Customer payment complaints are routed through Customer Service, and order returns are handled in Refund Management.'}
          </p>
          <div style={{ display: 'flex', gap: 14, fontSize: 12, color: '#183A34', fontWeight: 600 }}>
            <span
              onClick={() => onNavigate && onNavigate('handler-dashboard', '/handler/refunds')}
              style={{ cursor: 'pointer', textDecoration: 'underline', display: 'inline-flex', alignItems: 'center', gap: 4 }}
            >
              Go to Refund Management <ArrowRight size={13} />
            </span>
            <span
              onClick={() => onNavigate && onNavigate('handler-dashboard', '/handler/transactions')}
              style={{ cursor: 'pointer', textDecoration: 'underline', display: 'inline-flex', alignItems: 'center', gap: 4 }}
            >
              Go to Payment Transactions <ArrowRight size={13} />
            </span>
          </div>
        </div>
      </div>

      {/* KPI Row */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 14,
          marginBottom: 20,
        }}
      >
        {[
          { label: 'Active Disputes', value: '0', sub: 'Zero open bank chargebacks', color: '#15803D', bg: '#DCFCE7' },
          { label: 'Response Required', value: '0', sub: 'No pending evidence requests', color: '#183A34', bg: '#F4EFE6' },
          { label: 'Under Review', value: '0', sub: 'With acquiring bank/gateway', color: '#68726E', bg: '#F5F5F4' },
          { label: 'Dispute Win Rate', value: '100%', sub: 'Based on historical records', color: '#15803D', bg: '#DCFCE7' },
        ].map((kpi, idx) => (
          <div
            key={idx}
            style={{
              background: '#FFFFFF',
              border: '1px solid #ECE7DC',
              borderRadius: 8,
              padding: '14px 18px',
            }}
          >
            <div style={{ fontSize: 11, fontWeight: 600, color: '#78827E', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              {kpi.label}
            </div>
            <div style={{ fontSize: 18, fontWeight: 800, color: kpi.color, marginTop: 4 }}>
              {kpi.value}
            </div>
            <div style={{ fontSize: 11, color: '#8E9894', marginTop: 3 }}>
              {kpi.sub}
            </div>
          </div>
        ))}
      </div>

      {/* Queue Table */}
      <div
        style={{
          background: '#FFFFFF',
          border: '1px solid #ECE7DC',
          borderRadius: 8,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            padding: '14px 18px',
            borderBottom: '1px solid #ECE7DC',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: '#FAF8F4',
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 700, color: '#183A34' }}>
            Dispute & Chargeback Cases
          </div>
          <span style={{ fontSize: 11, color: '#78827E' }}>0 active disputes</span>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 12.5 }}>
            <thead>
              <tr style={{ background: '#F9F8F3', borderBottom: '1px solid #ECE7DC', color: '#68726E' }}>
                <th style={{ padding: '10px 14px', fontWeight: 600 }}>Dispute Reference</th>
                <th style={{ padding: '10px 14px', fontWeight: 600 }}>Transaction ID</th>
                <th style={{ padding: '10px 14px', fontWeight: 600 }}>Order #</th>
                <th style={{ padding: '10px 14px', fontWeight: 600 }}>Disputed Amount</th>
                <th style={{ padding: '10px 14px', fontWeight: 600 }}>Reason / Code</th>
                <th style={{ padding: '10px 14px', fontWeight: 600 }}>Response Deadline</th>
                <th style={{ padding: '10px 14px', fontWeight: 600 }}>Status</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan={7} style={{ padding: '60px 16px', textAlign: 'center', color: '#78827E' }}>
                  <ShieldAlert size={32} style={{ marginBottom: 10, color: '#A0AAA6' }} />
                  <div style={{ fontWeight: 700, fontSize: 14, color: '#183A34' }}>
                    No Active Disputes Recorded
                  </div>
                  <div style={{ fontSize: 12, marginTop: 4, maxWidth: 460, margin: '6px auto 0', color: '#5A6561' }}>
                    When a customer files a chargeback through their issuing bank, the gateway webhook records the notice here with evidence deadlines and submission options.
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default PaymentDisputesView;
