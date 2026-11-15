import React, { useState, useEffect, useCallback } from 'react';
import {
  RefreshCw,
  Eye,
  EyeOff,
  CreditCard,
  RotateCcw,
  ChartNoAxesColumn,
  History,
  ArrowUpRight,
} from 'lucide-react';
import { handlerService } from '../../../services/handlerService';

function formatINR(amount) {
  const num = parseFloat(amount) || 0;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(num);
}

function StatusBadge({ status }) {
  const statusConfig = {
    captured: { bg: '#DCFCE7', color: '#15803D', label: 'Capture' },
    processed: { bg: '#DCFCE7', color: '#15803D', label: 'Completed' },
    completed: { bg: '#DCFCE7', color: '#15803D', label: 'Completed' },
    approved: { bg: '#E0F2FE', color: '#0369A1', label: 'Approved' },
    pending: { bg: '#FEF3C7', color: '#B45309', label: 'Pending' },
    processing: { bg: '#E0F2FE', color: '#0369A1', label: 'Processing' },
    failed: { bg: '#FEE2E2', color: '#991B1B', label: 'Failed' },
    cancelled: { bg: '#F5F5F4', color: '#78716C', label: 'Cancelled' },
  };
  const key = String(status || '').toLowerCase().replace(/\s+/g, '_');
  const config = statusConfig[key] || { bg: '#F5F5F4', color: '#78716C', label: status || 'Unknown' };

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '2px 8px',
        borderRadius: 4,
        fontSize: 11,
        fontWeight: 600,
        backgroundColor: config.bg,
        color: config.color,
        whiteSpace: 'nowrap',
      }}
    >
      {config.label}
    </span>
  );
}

export function PaymentsOverviewView({ onNavigate }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activityPeriod, setActivityPeriod] = useState('month');
  const [showNetCollections, setShowNetCollections] = useState(true);
  const [hoveredBar, setHoveredBar] = useState(null);

  const loadDashboard = useCallback(async (period) => {
    try {
      const res = await handlerService.getPaymentsDashboard(period);
      setData(res);
    } catch (err) {
      console.error('Failed to load Payments dashboard data:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard(activityPeriod);
  }, [loadDashboard, activityPeriod]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadDashboard(activityPeriod);
  };

  if (loading && !data) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 450, flexDirection: 'column', gap: 14 }}>
        <div style={{ width: 34, height: 34, border: '3px solid #E5DFC8', borderTopColor: '#122D29', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <span style={{ color: '#5C5A54', fontSize: 14 }}>Loading Payments &amp; Refunds overview...</span>
      </div>
    );
  }

  const kpis = data || {};
  const paymentOverview = kpis.payment_overview || {};
  const refundOverview = kpis.refund_overview || {};
  const activityData = kpis.activity_chart || [];
  const recentPayments = kpis.recent_payments || [];
  const refundRequests = kpis.refund_requests || [];
  const recentRefunds = kpis.recent_refunds || [];

  const maxActivityValue = Math.max(
    ...activityData.map((d) => Math.max(d.collections || 0, d.refunds || 0)),
    1000
  );

  return (
    <div style={{ padding: '0 4px 30px' }}>
      {/* A. Header Row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h1 style={{ fontSize: 26, fontWeight: 800, color: '#122D29', margin: 0, letterSpacing: '-0.02em' }}>
              Payments &amp; Refunds Dashboard
            </h1>
            <button
              type="button"
              onClick={handleRefresh}
              disabled={refreshing}
              title="Refresh dashboard"
              aria-label="Refresh dashboard"
              style={{
                background: '#FFFFFF',
                border: '1px solid #E8E4D8',
                borderRadius: '50%',
                width: 32,
                height: 32,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: refreshing ? 'not-allowed' : 'pointer',
                color: '#183A34',
                transition: 'all 0.15s',
              }}
            >
              <RefreshCw size={15} style={{ animation: refreshing ? 'spin 0.8s linear infinite' : 'none' }} />
            </button>
          </div>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#68726E' }}>
            Live payment performance, collections, refunds and financial operations overview
          </p>
        </div>
        <div style={{ fontSize: 12, color: '#88928E', paddingTop: 6 }}>
          Updated just now
        </div>
      </div>

      {/* B. Main Upper Grid (3 Columns) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 1fr) minmax(400px, 1.45fr) minmax(280px, 0.95fr)', gap: 18, marginBottom: 20 }}>
        {/* Column 1: Net Collections & Quick Actions */}
        <div style={{ background: '#FFFFFF', border: '1px solid #E8E4D8', borderRadius: 8, padding: 22, display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#122D29', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              NET COLLECTIONS
            </div>
            <button
              type="button"
              onClick={() => setShowNetCollections(!showNetCollections)}
              title={showNetCollections ? 'Hide amount' : 'Show amount'}
              aria-label={showNetCollections ? 'Hide amount' : 'Show amount'}
              style={{ color: '#68726E', padding: 2, display: 'flex', alignItems: 'center' }}
            >
              {showNetCollections ? <Eye size={15} /> : <EyeOff size={15} />}
            </button>
          </div>

          <div style={{ fontSize: 44, fontWeight: 800, color: '#122D29', lineHeight: 1, letterSpacing: '-0.02em', marginBottom: 8 }}>
            {showNetCollections ? formatINR(kpis.net_collections ?? 0) : '••••••••'}
          </div>
          <div style={{ fontSize: 12, color: '#68726E', marginBottom: 22, lineHeight: 1.4 }}>
            Successful payments less completed refunds
          </div>

          <div style={{ height: 1, backgroundColor: '#EFECE4', width: '100%', marginBottom: 18 }} />

          <div style={{ fontSize: 14, fontWeight: 700, color: '#122D29', marginBottom: 14 }}>
            Quick Actions
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px 12px', textAlign: 'center' }}>
            {[
              { label: 'View Transactions', icon: CreditCard, path: '/handler/transactions' },
              { label: 'Process Refunds', icon: RotateCcw, path: '/handler/refunds' },
              { label: 'Financial Reports', icon: ChartNoAxesColumn, path: '/handler/reports' },
              { label: 'Audit History', icon: History, path: '/handler/history' },
            ].map(({ label, icon: Icon, path }) => (
              <button
                key={label}
                type="button"
                onClick={() => onNavigate && onNavigate('handler-dashboard', path)}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: 4,
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 7,
                }}
              >
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: '50%',
                    border: '1px solid #E8E4D8',
                    backgroundColor: '#FAF7F2',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#183A34',
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#183A34';
                    e.currentTarget.style.color = '#FFFFFF';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = '#FAF7F2';
                    e.currentTarget.style.color = '#183A34';
                  }}
                >
                  <Icon size={18} strokeWidth={1.8} />
                </div>
                <span style={{ fontSize: 11, fontWeight: 500, color: '#3A423F', lineHeight: 1.2 }}>
                  {label}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Column 2: 2 Supporting KPIs & Activity Chart */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Top row of 2 balanced KPI cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
            <div style={{ background: '#FFFFFF', border: '1px solid #E8E4D8', borderRadius: 8, padding: '14px 16px' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#5A6460', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>
                TOTAL COLLECTED
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#122D29', marginBottom: 2 }}>
                {formatINR(kpis.total_collected ?? 0)}
              </div>
              <div style={{ fontSize: 11, color: '#88928E' }}>
                Successful payments
              </div>
            </div>

            <div style={{ background: '#FFFFFF', border: '1px solid #E8E4D8', borderRadius: 8, padding: '14px 16px' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#5A6460', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>
                TOTAL REFUNDED
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#122D29', marginBottom: 2 }}>
                {formatINR(kpis.total_refunded ?? 0)}
              </div>
              <div style={{ fontSize: 11, color: '#88928E' }}>
                Completed refunds
              </div>
            </div>
          </div>

          {/* Activity Chart Card */}
          <div style={{ background: '#FFFFFF', border: '1px solid #E8E4D8', borderRadius: 8, padding: 18, flex: 1, display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, gap: 12 }}>
              <div style={{ minWidth: 0, flex: '1 1 auto' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#122D29', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  COLLECTIONS &amp; REFUNDS ACTIVITY
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#5A6460' }}>
                    <span style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: '#183A34' }} />
                    <span>Collections</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#5A6460' }}>
                    <span style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: '#B86553' }} />
                    <span>Refunds</span>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 14, flex: '0 0 auto', marginLeft: 'auto' }}>
                <span style={{ fontSize: 11.5, color: '#5A6460', whiteSpace: 'nowrap' }}>
                  Selected {activityPeriod} net <strong style={{ color: '#122D29' }}>{formatINR(kpis.selected_period_net ?? 0)}</strong>
                </span>

                {/* Segmented Day/Week/Month Controls - firmly pinned to top right */}
                <div style={{ display: 'inline-flex', background: '#F5F0E8', padding: 3, borderRadius: 6, flexShrink: 0 }}>
                  {['day', 'week', 'month'].map((p) => {
                    const isActive = activityPeriod === p;
                    return (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setActivityPeriod(p)}
                        style={{
                          border: 'none',
                          background: isActive ? '#183A34' : 'transparent',
                          color: isActive ? '#FFFFFF' : '#5A6460',
                          fontSize: 11,
                          fontWeight: 600,
                          padding: '4px 10px',
                          borderRadius: 4,
                          cursor: 'pointer',
                          minWidth: 48,
                          textAlign: 'center',
                          textTransform: 'capitalize',
                          transition: 'all 0.15s',
                        }}
                      >
                        {p === 'day' ? 'Day' : p === 'week' ? 'Week' : 'Month'}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Dual Bar Chart container */}
            <div style={{ position: 'relative', flex: 1, minHeight: 140, display: 'flex', alignItems: 'flex-end', gap: 10, paddingTop: 20 }}>
              {hoveredBar && (
                <div
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: `${hoveredBar.leftPct}%`,
                    transform: 'translateX(-50%)',
                    backgroundColor: '#122D29',
                    color: '#FFFFFF',
                    padding: '4px 8px',
                    borderRadius: 4,
                    fontSize: 10,
                    fontWeight: 600,
                    pointerEvents: 'none',
                    zIndex: 10,
                    whiteSpace: 'nowrap',
                    boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
                  }}
                >
                  {hoveredBar.label}: Collected {formatINR(hoveredBar.collections)}, Refunded {formatINR(hoveredBar.refunds)}
                </div>
              )}

              {activityData.length === 0 ? (
                <div style={{ flex: 1, textAlign: 'center', color: '#88928E', fontSize: 12, padding: 30 }}>
                  No payment activity recorded for this period
                </div>
              ) : (
                activityData.map((d, idx) => {
                  const colPct = Math.round(((d.collections || 0) / maxActivityValue) * 100);
                  const refPct = Math.round(((d.refunds || 0) / maxActivityValue) * 100);
                  const leftPct = ((idx + 0.5) / activityData.length) * 100;

                  return (
                    <div
                      key={d.label || idx}
                      style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%' }}
                      onMouseEnter={() => setHoveredBar({ ...d, leftPct })}
                      onMouseLeave={() => setHoveredBar(null)}
                    >
                      <div style={{ flex: 1, width: '100%', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 3 }}>
                        <div
                          style={{
                            width: '45%',
                            maxWidth: 12,
                            height: `${Math.max(colPct, 4)}%`,
                            backgroundColor: '#183A34',
                            borderRadius: '2px 2px 0 0',
                            transition: 'height 0.3s ease',
                          }}
                        />
                        <div
                          style={{
                            width: '45%',
                            maxWidth: 12,
                            height: `${Math.max(refPct, 4)}%`,
                            backgroundColor: '#B86553',
                            borderRadius: '2px 2px 0 0',
                            transition: 'height 0.3s ease',
                          }}
                        />
                      </div>
                      <span style={{ fontSize: 10, color: '#7A8480', marginTop: 6, fontWeight: 500 }}>
                        {d.label}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Column 3: Payment Overview & Refund Overview */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Payment Overview Card */}
          <div style={{ background: '#FFFFFF', border: '1px solid #E8E4D8', borderRadius: 8, padding: 18 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#122D29', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
              PAYMENT OVERVIEW
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              {[
                { label: 'UPI', amount: paymentOverview.upi ?? 0 },
                { label: 'Cards', amount: paymentOverview.cards ?? 0 },
                { label: 'Net Banking', amount: paymentOverview.net_banking ?? 0 },
                { label: 'Wallets', amount: paymentOverview.wallets ?? 0 },
                { label: 'Cash on Delivery', amount: paymentOverview.cash_on_delivery ?? 0 },
              ].map(({ label, amount }) => (
                <div key={label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12.5 }}>
                  <span style={{ color: '#5A6460' }}>{label}</span>
                  <span style={{ fontWeight: 700, color: '#122D29', fontVariantNumeric: 'tabular-nums' }}>
                    {formatINR(amount)}
                  </span>
                </div>
              ))}
            </div>

            <div style={{ height: 1, backgroundColor: '#EFECE4', width: '100%', margin: '14px 0 10px' }} />
            <div style={{ fontSize: 11, color: '#88928E' }}>
              {paymentOverview.successful_transactions || 0} successful transactions
            </div>
          </div>

          {/* Refund Overview Card */}
          <div style={{ background: '#FFFFFF', border: '1px solid #E8E4D8', borderRadius: 8, padding: 18, flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#122D29', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
                REFUND OVERVIEW
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                {[
                  { label: 'Awaiting Review', count: refundOverview.awaiting_review ?? 0, bg: '#FEF3C7', color: '#B45309' },
                  { label: 'Processing', count: refundOverview.processing ?? 0, bg: '#E0F2FE', color: '#0369A1' },
                  { label: 'Completed', count: refundOverview.completed ?? 0, bg: '#DCFCE7', color: '#15803D' },
                  { label: 'Failed', count: refundOverview.failed ?? 0, bg: '#FEE2E2', color: '#991B1B' },
                ].map(({ label, count, bg, color }) => (
                  <div key={label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12.5 }}>
                    <span style={{ color: '#5A6460' }}>{label}</span>
                    <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700, backgroundColor: bg, color }}>
                      {count}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div style={{ height: 1, backgroundColor: '#EFECE4', width: '100%', margin: '14px 0 10px' }} />
              <div style={{ fontSize: 11, color: '#88928E' }}>
                Refund success rate {refundOverview.success_rate ?? 100}%
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* C. Bottom Row: 3 Operational Tables */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 18 }}>
        {/* Table 1: Recent Payments */}
        <div style={{ background: '#FFFFFF', border: '1px solid #E8E4D8', borderRadius: 8, padding: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#122D29', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              RECENT PAYMENTS
            </div>
            <button
              type="button"
              onClick={() => onNavigate && onNavigate('handler-dashboard', '/handler/transactions')}
              style={{ fontSize: 11.5, fontWeight: 600, color: '#8A875D', display: 'flex', alignItems: 'center', gap: 2 }}
            >
              View all <ArrowUpRight size={13} />
            </button>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ color: '#88928E', borderBottom: '1px solid #EFECE4', textAlign: 'left' }}>
                  <th style={{ padding: '6px 4px', fontWeight: 500, fontSize: 11 }}>Order / Txn ID</th>
                  <th style={{ padding: '6px 4px', fontWeight: 500, fontSize: 11 }}>Customer</th>
                  <th style={{ padding: '6px 4px', fontWeight: 500, fontSize: 11 }}>Method</th>
                  <th style={{ padding: '6px 4px', fontWeight: 500, fontSize: 11 }}>Amount</th>
                  <th style={{ padding: '6px 4px', fontWeight: 500, fontSize: 11 }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {recentPayments.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ padding: '16px 4px', textAlign: 'center', color: '#88928E' }}>
                      No recent payments
                    </td>
                  </tr>
                ) : (
                  recentPayments.map((p) => (
                    <tr key={p.id} style={{ borderBottom: '1px solid #F7F5F0' }}>
                      <td style={{ padding: '8px 4px', fontWeight: 600, color: '#122D29' }}>
                        {p.order_number || p.provider_payment_id}
                      </td>
                      <td style={{ padding: '8px 4px', color: '#5A6460' }}>{p.customer_name}</td>
                      <td style={{ padding: '8px 4px', color: '#5A6460' }}>{p.method}</td>
                      <td style={{ padding: '8px 4px', fontWeight: 600, color: '#122D29' }}>{formatINR(p.amount)}</td>
                      <td style={{ padding: '8px 4px' }}><StatusBadge status={p.status} /></td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Table 2: Refund Requests */}
        <div style={{ background: '#FFFFFF', border: '1px solid #E8E4D8', borderRadius: 8, padding: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#122D29', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              REFUND REQUESTS
            </div>
            <button
              type="button"
              onClick={() => onNavigate && onNavigate('handler-dashboard', '/handler/refunds')}
              style={{ fontSize: 11.5, fontWeight: 600, color: '#8A875D', display: 'flex', alignItems: 'center', gap: 2 }}
            >
              View all <ArrowUpRight size={13} />
            </button>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ color: '#88928E', borderBottom: '1px solid #EFECE4', textAlign: 'left' }}>
                  <th style={{ padding: '6px 4px', fontWeight: 500, fontSize: 11 }}>Refund ID</th>
                  <th style={{ padding: '6px 4px', fontWeight: 500, fontSize: 11 }}>Order ID</th>
                  <th style={{ padding: '6px 4px', fontWeight: 500, fontSize: 11 }}>Customer</th>
                  <th style={{ padding: '6px 4px', fontWeight: 500, fontSize: 11 }}>Amount</th>
                  <th style={{ padding: '6px 4px', fontWeight: 500, fontSize: 11 }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {refundRequests.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ padding: '16px 4px', textAlign: 'center', color: '#88928E' }}>
                      No pending refund requests
                    </td>
                  </tr>
                ) : (
                  refundRequests.map((r) => (
                    <tr key={r.handoff_id} style={{ borderBottom: '1px solid #F7F5F0' }}>
                      <td style={{ padding: '8px 4px', fontWeight: 600, color: '#122D29' }}>{r.refund_id}</td>
                      <td style={{ padding: '8px 4px', color: '#5A6460' }}>{r.order_number}</td>
                      <td style={{ padding: '8px 4px', color: '#5A6460' }}>{r.customer_name}</td>
                      <td style={{ padding: '8px 4px', fontWeight: 600, color: '#122D29' }}>{formatINR(r.amount)}</td>
                      <td style={{ padding: '8px 4px' }}><StatusBadge status={r.status} /></td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Table 3: Recent Refunds */}
        <div style={{ background: '#FFFFFF', border: '1px solid #E8E4D8', borderRadius: 8, padding: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#122D29', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              RECENT REFUNDS
            </div>
            <button
              type="button"
              onClick={() => onNavigate && onNavigate('handler-dashboard', '/handler/refunds')}
              style={{ fontSize: 11.5, fontWeight: 600, color: '#8A875D', display: 'flex', alignItems: 'center', gap: 2 }}
            >
              View all <ArrowUpRight size={13} />
            </button>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ color: '#88928E', borderBottom: '1px solid #EFECE4', textAlign: 'left' }}>
                  <th style={{ padding: '6px 4px', fontWeight: 500, fontSize: 11 }}>Refund ID</th>
                  <th style={{ padding: '6px 4px', fontWeight: 500, fontSize: 11 }}>Method</th>
                  <th style={{ padding: '6px 4px', fontWeight: 500, fontSize: 11 }}>Amount</th>
                  <th style={{ padding: '6px 4px', fontWeight: 500, fontSize: 11 }}>Processed</th>
                  <th style={{ padding: '6px 4px', fontWeight: 500, fontSize: 11 }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {recentRefunds.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ padding: '16px 4px', textAlign: 'center', color: '#88928E' }}>
                      No recent refunds
                    </td>
                  </tr>
                ) : (
                  recentRefunds.map((ref) => (
                    <tr key={ref.id} style={{ borderBottom: '1px solid #F7F5F0' }}>
                      <td style={{ padding: '8px 4px', fontWeight: 600, color: '#122D29' }}>{ref.refund_id}</td>
                      <td style={{ padding: '8px 4px', color: '#5A6460' }}>{ref.method}</td>
                      <td style={{ padding: '8px 4px', fontWeight: 600, color: '#122D29' }}>{formatINR(ref.amount)}</td>
                      <td style={{ padding: '8px 4px', color: '#5A6460' }}>{ref.processed_at}</td>
                      <td style={{ padding: '8px 4px' }}><StatusBadge status={ref.status} /></td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

export default PaymentsOverviewView;
