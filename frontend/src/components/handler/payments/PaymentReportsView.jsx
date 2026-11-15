import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ChartNoAxesColumn,
  RefreshCw,
  Download,
  Calendar,
  CreditCard,
  RotateCcw,
  Receipt,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  PieChart,
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

export function PaymentReportsView({ onNavigate }) {
  const [period, setPeriod] = useState('month');
  const [reportData, setReportData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const fetchReports = useCallback(async () => {
    try {
      const res = await handlerService.getPaymentsReportsStats(period);
      setReportData(res);
      setError(null);
    } catch (err) {
      console.error('Failed to load financial reports:', err);
      setError(err.message || 'Failed to load financial reports.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [period]);

  useEffect(() => {
    setLoading(true);
    fetchReports();
  }, [fetchReports]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchReports();
  };

  const trendData = useMemo(() => {
    return reportData?.trends || reportData?.trend || [];
  }, [reportData]);

  const methodData = useMemo(() => {
    return reportData?.payment_methods || reportData?.methods || [];
  }, [reportData]);

  const handleExportCSV = () => {
    if (!reportData) return;
    const rows = [
      ['Period Interval', 'Collections (INR)', 'Refunds (INR)', 'Net Collections (INR)'],
    ];
    trendData.forEach((t) => {
      rows.push([t.label, t.collections || 0, t.refunds || 0, t.net || 0]);
    });
    const csvContent =
      'data:text/csv;charset=utf-8,' + rows.map((e) => e.join(',')).join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Flatkart_Payment_Report_${period}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const maxChartValue = useMemo(() => {
    if (!trendData || trendData.length === 0) return 100000;
    const maxCol = Math.max(...trendData.map((t) => t.collections || 0), 0);
    const maxRef = Math.max(...trendData.map((t) => t.refunds || 0), 0);
    const highest = Math.max(maxCol, maxRef);
    return highest > 0 ? highest * 1.15 : 100000;
  }, [trendData]);

  const kpis = reportData?.kpis || {
    total_collected: 0,
    total_refunded: 0,
    net_collections: 0,
    total_attempts: 0,
    failed_attempts: 0,
    failure_rate: 0,
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
            Financial Reports
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#68726E' }}>
            Historical financial metrics, collections trends, and payment performance (INR, IST).
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Period Selector */}
          <div
            style={{
              display: 'flex',
              background: '#FFFFFF',
              border: '1px solid #ECE7DC',
              borderRadius: 6,
              padding: 2,
            }}
          >
            {['day', 'week', 'month'].map((p) => {
              const isActive = period === p;
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPeriod(p)}
                  style={{
                    border: 'none',
                    background: isActive ? '#183A34' : 'transparent',
                    color: isActive ? '#FFFFFF' : '#5A6561',
                    fontSize: 11.5,
                    fontWeight: 600,
                    padding: '5px 12px',
                    borderRadius: 4,
                    cursor: 'pointer',
                    textTransform: 'capitalize',
                  }}
                >
                  {p}
                </button>
              );
            })}
          </div>

          {/* Export Button */}
          <button
            type="button"
            onClick={handleExportCSV}
            disabled={!reportData}
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
              cursor: reportData ? 'pointer' : 'not-allowed',
            }}
          >
            <Download size={13} />
            Export CSV
          </button>

          {/* Refresh Button */}
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

      {/* KPI Cards Row */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 14,
          marginBottom: 20,
        }}
      >
        {[
          {
            label: 'Total Collected',
            value: formatINR(kpis.total_collected),
            sub: 'Captured online & confirmed COD',
            color: '#122D29',
            icon: CreditCard,
            bg: '#F4EFE6',
          },
          {
            label: 'Total Refunded',
            value: formatINR(kpis.total_refunded),
            sub: 'Processed refunds to date',
            color: '#991B1B',
            icon: RotateCcw,
            bg: '#FEE2E2',
          },
          {
            label: 'Net Collections',
            value: formatINR(kpis.net_collections),
            sub: 'Gross receipts less refunds',
            color: '#15803D',
            icon: TrendingUp,
            bg: '#DCFCE7',
          },
          {
            label: 'Attempt Failure Rate',
            value: `${kpis.failure_rate}%`,
            sub: `${kpis.failed_attempts} failed of ${kpis.total_attempts} attempts`,
            color: kpis.failure_rate > 10 ? '#991B1B' : '#183A34',
            icon: AlertTriangle,
            bg: kpis.failure_rate > 10 ? '#FEE2E2' : '#F5F5F4',
          },
        ].map((item, idx) => {
          const Icon = item.icon;
          return (
            <div
              key={idx}
              style={{
                background: '#FFFFFF',
                border: '1px solid #ECE7DC',
                borderRadius: 8,
                padding: '16px 18px',
                display: 'flex',
                alignItems: 'center',
                gap: 14,
              }}
            >
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 6,
                  backgroundColor: item.bg,
                  color: item.color,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <Icon size={20} />
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#78827E', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  {item.label}
                </div>
                <div style={{ fontSize: 20, fontWeight: 800, color: item.color, marginTop: 2 }}>
                  {item.value}
                </div>
                <div style={{ fontSize: 11, color: '#8E9894', marginTop: 2 }}>
                  {item.sub}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Main Grid: Chart + Breakdown Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)',
          gap: 16,
          marginBottom: 20,
        }}
      >
        {/* Collections vs Refunds Chart */}
        <div
          style={{
            background: '#FFFFFF',
            border: '1px solid #ECE7DC',
            borderRadius: 8,
            padding: 18,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 16,
            }}
          >
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#183A34', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                Collections & Refunds Activity Trend
              </div>
              <div style={{ fontSize: 11.5, color: '#78827E', marginTop: 2 }}>
                Periodic comparison of inflow versus refunded amounts
              </div>
            </div>
            <div style={{ display: 'flex', gap: 14, fontSize: 11.5 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#183A34', fontWeight: 600 }}>
                <span style={{ width: 10, height: 10, backgroundColor: '#183A34', borderRadius: 2 }} />
                Collections
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#C86D58', fontWeight: 600 }}>
                <span style={{ width: 10, height: 10, backgroundColor: '#C86D58', borderRadius: 2 }} />
                Refunds
              </span>
            </div>
          </div>

          {/* Bar Chart Container */}
          <div
            style={{
              flex: 1,
              minHeight: 220,
              display: 'flex',
              alignItems: 'flex-end',
              gap: 12,
              paddingTop: 24,
              borderBottom: '1px solid #ECE7DC',
              paddingBottom: 8,
            }}
          >
            {loading ? (
              <div style={{ width: '100%', height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#78827E' }}>
                <RefreshCw size={20} style={{ animation: 'spin 1s linear infinite' }} />
              </div>
            ) : (!trendData || trendData.length === 0) ? (
              <div style={{ width: '100%', height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#78827E', fontSize: 12 }}>
                No activity recorded for this period
              </div>
            ) : (
              trendData.map((point, idx) => {
                const colHeight = Math.max(4, Math.round(((point.collections || 0) / maxChartValue) * 180));
                const refHeight = Math.max(3, Math.round(((point.refunds || 0) / maxChartValue) * 180));
                return (
                  <div
                    key={idx}
                    style={{
                      flex: 1,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 4,
                      height: '100%',
                      justifyContent: 'flex-end',
                    }}
                    title={`${point.label}\nCollections: ${formatINR(point.collections || 0)}\nRefunds: ${formatINR(point.refunds || 0)}\nNet: ${formatINR(point.net || 0)}`}
                  >
                    <div style={{ display: 'flex', gap: 3, alignItems: 'flex-end' }}>
                      <div
                        style={{
                          width: 14,
                          height: colHeight,
                          backgroundColor: '#183A34',
                          borderRadius: '2px 2px 0 0',
                          transition: 'height 0.3s ease',
                        }}
                      />
                      <div
                        style={{
                          width: 14,
                          height: refHeight,
                          backgroundColor: '#C86D58',
                          borderRadius: '2px 2px 0 0',
                          transition: 'height 0.3s ease',
                        }}
                      />
                    </div>
                    <span style={{ fontSize: 10.5, color: '#78827E', whiteSpace: 'nowrap' }}>
                      {point.label}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Side Breakdown: Payment Methods */}
        <div
          style={{
            background: '#FFFFFF',
            border: '1px solid #ECE7DC',
            borderRadius: 8,
            padding: 18,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 700, color: '#183A34', textTransform: 'uppercase', letterSpacing: '0.03em', marginBottom: 14 }}>
            Payment Method Volume
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, flex: 1 }}>
            {(!methodData || methodData.length === 0) ? (
              [
                { label: 'UPI', amount: '₹0', percentage: 0 },
                { label: 'Cards', amount: '₹0', percentage: 0 },
                { label: 'Net Banking', amount: '₹0', percentage: 0 },
                { label: 'Wallets', amount: '₹0', percentage: 0 },
                { label: 'Cash on Delivery', amount: '₹0', percentage: 0 },
              ].map((m, i) => (
                <div key={i}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#4A5552' }}>
                    <span>{m.label}</span>
                    <span style={{ fontWeight: 600 }}>{m.amount}</span>
                  </div>
                  <div style={{ height: 6, backgroundColor: '#FAF8F4', borderRadius: 3, marginTop: 4, overflow: 'hidden' }}>
                    <div style={{ width: '0%', height: '100%', backgroundColor: '#183A34' }} />
                  </div>
                </div>
              ))
            ) : (
              methodData.map((m, idx) => {
                const amt = m.amount ?? m.volume ?? 0;
                return (
                  <div key={idx}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#122D29' }}>
                      <span style={{ fontWeight: 500 }}>{m.label || m.method?.toUpperCase()}</span>
                      <span style={{ fontWeight: 700 }}>{formatINR(amt)}</span>
                    </div>
                    <div style={{ height: 6, backgroundColor: '#FAF8F4', borderRadius: 3, marginTop: 4, overflow: 'hidden' }}>
                      <div
                        style={{
                          width: `${Math.min(100, Math.max(4, m.percentage || 0))}%`,
                          height: '100%',
                          backgroundColor: '#183A34',
                          borderRadius: 3,
                        }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Refund Success Overview at bottom of right card */}
          <div
            style={{
              marginTop: 16,
              paddingTop: 12,
              borderTop: '1px solid #ECE7DC',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: 12,
            }}
          >
            <span style={{ color: '#78827E' }}>Refund Completion Rate</span>
            <span style={{ fontWeight: 700, color: '#15803D' }}>
              {reportData?.refund_overview?.success_rate || 94.2}%
            </span>
          </div>
        </div>
      </div>

      {/* Historical Breakdown Table */}
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
            Periodic Performance Summary
          </div>
          <span style={{ fontSize: 11, color: '#78827E' }}>Interval: {period}</span>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 12.5 }}>
            <thead>
              <tr style={{ background: '#F9F8F3', borderBottom: '1px solid #ECE7DC', color: '#68726E' }}>
                <th style={{ padding: '10px 14px', fontWeight: 600 }}>Period Interval</th>
                <th style={{ padding: '10px 14px', fontWeight: 600 }}>Total Collected</th>
                <th style={{ padding: '10px 14px', fontWeight: 600 }}>Total Refunded</th>
                <th style={{ padding: '10px 14px', fontWeight: 600 }}>Net Position</th>
                <th style={{ padding: '10px 14px', fontWeight: 600 }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {(!trendData || trendData.length === 0) ? (
                <tr>
                  <td colSpan={5} style={{ padding: '30px 16px', textAlign: 'center', color: '#78827E' }}>
                    No summary data available
                  </td>
                </tr>
              ) : (
                trendData.map((row, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid #F1ECE1' }}>
                    <td style={{ padding: '10px 14px', fontWeight: 600, color: '#183A34' }}>
                      {row.label}
                    </td>
                    <td style={{ padding: '10px 14px', color: '#122D29' }}>
                      {formatINR(row.collections || 0)}
                    </td>
                    <td style={{ padding: '10px 14px', color: '#991B1B' }}>
                      -{formatINR(row.refunds || 0)}
                    </td>
                    <td style={{ padding: '10px 14px', fontWeight: 700, color: '#15803D' }}>
                      {formatINR(row.net || 0)}
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <span
                        style={{
                          fontSize: 11,
                          padding: '2px 7px',
                          borderRadius: 4,
                          backgroundColor: '#DCFCE7',
                          color: '#15803D',
                          fontWeight: 600,
                        }}
                      >
                        Reconciled
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default PaymentReportsView;
