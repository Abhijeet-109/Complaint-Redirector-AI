import React, { useState, useEffect } from 'react';
import {
  Landmark,
  RefreshCw,
  AlertCircle,
  FileSpreadsheet,
  CheckCircle2,
  Clock,
  ArrowRight,
  ExternalLink,
} from 'lucide-react';
import { handlerService } from '../../../services/handlerService';

export function PaymentSettlementsView({ onNavigate }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchSettlements = async () => {
    try {
      const res = await handlerService.getPaymentsSettlements();
      setData(res);
    } catch (err) {
      console.error('Failed to load settlements:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchSettlements();
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchSettlements();
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
            Settlements & Reconciliation
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#68726E' }}>
            Reconcile gateway provider payouts with internal captured transactions and refunds.
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

      {/* Integration Notice Card */}
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
            backgroundColor: '#FEF3C7',
            color: '#B45309',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            marginTop: 2,
          }}
        >
          <Landmark size={20} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#183A34' }}>
            Gateway Provider Settlement Sync Pending
          </div>
          <p style={{ margin: '4px 0 8px', fontSize: 12.5, color: '#5A6561', lineHeight: 1.5 }}>
            {data?.message ||
              'Settlement ingestion and reconciliation are pending gateway provider payout report feed configuration (Razorpay / Stripe batch webhook or SFTP feed). Live transaction captures and refunds are tracked in real-time in the core operational ledgers.'}
          </p>
          <div style={{ display: 'flex', gap: 12, fontSize: 12, color: '#183A34', fontWeight: 600 }}>
            <span
              onClick={() => onNavigate && onNavigate('handler-dashboard', '/handler/transactions')}
              style={{ cursor: 'pointer', textDecoration: 'underline', display: 'inline-flex', alignItems: 'center', gap: 4 }}
            >
              View Payment Transactions <ArrowRight size={13} />
            </span>
            <span
              onClick={() => onNavigate && onNavigate('handler-dashboard', '/handler/refunds')}
              style={{ cursor: 'pointer', textDecoration: 'underline', display: 'inline-flex', alignItems: 'center', gap: 4 }}
            >
              View Refund Management <ArrowRight size={13} />
            </span>
          </div>
        </div>
      </div>

      {/* Summary Metrics */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 14,
          marginBottom: 20,
        }}
      >
        {[
          { label: 'Settlement Feed Status', value: 'Pending Gateway Feed', sub: 'Razorpay / Stripe sync', color: '#B45309', bg: '#FEF3C7' },
          { label: 'Gross Settled', value: '₹0', sub: 'Awaiting first batch import', color: '#183A34', bg: '#F4EFE6' },
          { label: 'Gateway Fees & GST', value: '—', sub: 'Reported upon batch sync', color: '#68726E', bg: '#F5F5F4' },
          { label: 'Unreconciled Variances', value: '0', sub: 'Zero discrepancy flags', color: '#15803D', bg: '#DCFCE7' },
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

      {/* Settlement Batches Table / Queue */}
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
            Settlement Payout Batches
          </div>
          <span style={{ fontSize: 11, color: '#78827E' }}>0 batches imported</span>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 12.5 }}>
            <thead>
              <tr style={{ background: '#F9F8F3', borderBottom: '1px solid #ECE7DC', color: '#68726E' }}>
                <th style={{ padding: '10px 14px', fontWeight: 600 }}>Settlement Batch ID</th>
                <th style={{ padding: '10px 14px', fontWeight: 600 }}>Gateway Provider</th>
                <th style={{ padding: '10px 14px', fontWeight: 600 }}>Settlement Date</th>
                <th style={{ padding: '10px 14px', fontWeight: 600 }}>Gross Amount</th>
                <th style={{ padding: '10px 14px', fontWeight: 600 }}>MDR / Deductions</th>
                <th style={{ padding: '10px 14px', fontWeight: 600 }}>Net Disbursed</th>
                <th style={{ padding: '10px 14px', fontWeight: 600 }}>Reconciliation Status</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan={7} style={{ padding: '60px 16px', textAlign: 'center', color: '#78827E' }}>
                  <FileSpreadsheet size={32} style={{ marginBottom: 10, color: '#A0AAA6' }} />
                  <div style={{ fontWeight: 700, fontSize: 14, color: '#183A34' }}>
                    No Settlement Batches Ingested
                  </div>
                  <div style={{ fontSize: 12, marginTop: 4, maxWidth: 460, margin: '6px auto 0', color: '#5A6561' }}>
                    Provider settlement files are ingested automatically via gateway webhooks once production credentials and settlement account mapping are linked.
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

export default PaymentSettlementsView;
