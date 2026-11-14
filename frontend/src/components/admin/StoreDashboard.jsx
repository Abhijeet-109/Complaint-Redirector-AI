import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  ShoppingBag, Package, CreditCard, Truck, RotateCcw, Download,
  RefreshCw, Eye, EyeOff, ArrowUpRight, ChevronRight,
} from 'lucide-react';
import { apiRequest } from '../../services/api';

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatINR(amount) {
  const num = parseFloat(amount) || 0;
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(num);
}

function formatINRDecimals(amount) {
  const num = parseFloat(amount) || 0;
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num);
}

function StatusBadge({ status }) {
  const statusConfig = {
    pending: { bg: '#FEF3C7', color: '#B45309', label: 'Pending' },
    processing: { bg: '#CCFBF1', color: '#0F766E', label: 'Processing' },
    accepted: { bg: '#E0F2FE', color: '#0369A1', label: 'Accepted' },
    packed: { bg: '#EDE9FE', color: '#6D28D9', label: 'Packed' },
    ready_to_ship: { bg: '#EDE9FE', color: '#6D28D9', label: 'Ready to Ship' },
    ready_for_dispatch: { bg: '#DBEAFE', color: '#1D4ED8', label: 'Ready for Dispatch' },
    received: { bg: '#E0E7FF', color: '#4338CA', label: 'Received' },
    scheduled: { bg: '#FEF3C7', color: '#B45309', label: 'Scheduled' },
    shipped: { bg: '#CFFAFE', color: '#0E7490', label: 'Shipped' },
    out_for_delivery: { bg: '#FFEDD5', color: '#C2410C', label: 'Out for Delivery' },
    delivered: { bg: '#DCFCE7', color: '#15803D', label: 'Delivered' },
    cancelled: { bg: '#F5F5F4', color: '#78716C', label: 'Cancelled' },
    placed: { bg: '#DCFCE7', color: '#15803D', label: 'Placed' },
    pending_payment: { bg: '#FEF3C7', color: '#B45309', label: 'Pending Payment' },
    payment_failed: { bg: '#FEF2F2', color: '#991B1B', label: 'Payment Failed' },
    captured: { bg: '#DCFCE7', color: '#15803D', label: 'Captured' },
    failed: { bg: '#FEF2F2', color: '#991B1B', label: 'Failed' },
    created: { bg: '#FEF3C7', color: '#B45309', label: 'Pending' },
    expired: { bg: '#F5F5F4', color: '#78716C', label: 'Expired' },
    cod: { bg: '#E0F2FE', color: '#0369A1', label: 'COD' },
    upi: { bg: '#F3E8FF', color: '#7E22CE', label: 'UPI' },
    netbanking: { bg: '#ECFDF5', color: '#065F46', label: 'Net Banking' },
    refunded: { bg: '#FEF2F2', color: '#991B1B', label: 'Refunded' },
  };
  const config = statusConfig[status?.toLowerCase()] || { bg: '#F5F5F4', color: '#78716C', label: status || 'Unknown' };
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      backgroundColor: config.bg, color: config.color,
      padding: '2px 8px', borderRadius: 9999, fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap'
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: config.color, flexShrink: 0 }} />
      {config.label}
    </span>
  );
}

function BarChart({ data }) {
  const [hovered, setHovered] = useState(null);

  if (!data || data.length === 0) {
    return (
      <div style={{ flex: 1, minHeight: 140, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#5C5A54', fontSize: 13 }}>
        No revenue activity recorded
      </div>
    );
  }

  const maxCol = Math.max(...data.map(d => parseFloat(d.collections ?? d.value) || 0), 0);
  const maxRef = Math.max(...data.map(d => parseFloat(d.refunds) || 0), 0);
  const hasRefunds = maxRef > 0;
  const effectiveMaxCol = maxCol > 0 ? maxCol : 1;
  const effectiveMaxRef = maxRef > 0 ? maxRef : 1;
  const is30Days = data.length > 20;

  // Apportion vertical space between positive collections (above baseline) and refunds (below baseline)
  const totalBarHeight = 154;
  let posHeight = 142;
  let negHeight = 10;
  if (hasRefunds) {
    const rawRatio = maxCol / (maxCol + maxRef);
    const ratio = Math.min(Math.max(rawRatio, 0.62), 0.80);
    posHeight = Math.round(totalBarHeight * ratio);
    negHeight = totalBarHeight - posHeight;
  }

  return (
    <div style={{ position: 'relative', width: '100%', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', marginTop: 8 }}>
      
      {/* Sleek Custom Floating Tooltip */}
      {hovered && (
        <div
          style={{
            position: 'absolute',
            bottom: 'calc(100% - 6px)',
            left: `${Math.min(Math.max(hovered.leftPct, 16), 84)}%`,
            transform: 'translateX(-50%)',
            backgroundColor: '#122D29',
            color: '#FFFFFF',
            padding: '9px 14px',
            borderRadius: '8px',
            boxShadow: '0 8px 24px rgba(18, 45, 41, 0.35)',
            border: '1px solid rgba(194, 161, 90, 0.55)',
            pointerEvents: 'none',
            zIndex: 30,
            whiteSpace: 'nowrap',
            display: 'flex',
            flexDirection: 'column',
            gap: 3,
            minWidth: 154,
            transition: 'left 0.08s ease-out',
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 700, color: '#C2A15A', textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '1px solid rgba(255,255,255,0.14)', paddingBottom: 4, marginBottom: 2, textAlign: 'center' }}>
            {hovered.fullLabel || hovered.label}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 14, fontSize: 11.5 }}>
            <span style={{ color: '#D4CEBF' }}>Collections:</span>
            <span style={{ fontWeight: 700, color: '#4ADE80', fontVariantNumeric: 'tabular-nums' }}>
              +{formatINRDecimals(hovered.collections)}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 14, fontSize: 11.5 }}>
            <span style={{ color: '#D4CEBF' }}>Refunds:</span>
            <span style={{ fontWeight: 700, color: hovered.refunds > 0 ? '#F87171' : '#9CA3AF', fontVariantNumeric: 'tabular-nums' }}>
              {hovered.refunds > 0 ? `-${formatINRDecimals(hovered.refunds)}` : formatINRDecimals(0)}
            </span>
          </div>
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.14)', paddingTop: 4, marginTop: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 14, fontSize: 12, fontWeight: 700 }}>
            <span style={{ color: '#FFFFFF' }}>Net:</span>
            <span style={{ color: hovered.net >= 0 ? '#FFFFFF' : '#FCA5A5', fontVariantNumeric: 'tabular-nums' }}>
              {hovered.net < 0 ? '-' : ''}{formatINRDecimals(Math.abs(hovered.net))}
            </span>
          </div>
          {/* Downward Arrow */}
          <div
            style={{
              position: 'absolute',
              top: '100%',
              left: '50%',
              transform: 'translateX(-50%)',
              width: 0,
              height: 0,
              borderLeft: '5px solid transparent',
              borderRight: '5px solid transparent',
              borderTop: '5px solid #122D29',
            }}
          />
        </div>
      )}

      {/* Plot Columns Container */}
      <div
        style={{
          display: 'flex',
          gap: is30Days ? 2 : (data.length <= 7 ? 12 : 8),
          height: totalBarHeight,
          width: '100%',
          position: 'relative',
        }}
        onMouseLeave={() => setHovered(null)}
      >
        {/* Continuous Horizontal Baseline Line */}
        <div
          style={{
            position: 'absolute',
            top: `${posHeight}px`,
            left: 0,
            right: 0,
            height: '1.5px',
            backgroundColor: '#D4CEBF',
            zIndex: 1,
            pointerEvents: 'none',
          }}
        />

        {data.map((d, i) => {
          const colVal = parseFloat(d.collections ?? d.value) || 0;
          const refVal = parseFloat(d.refunds) || 0;
          const netVal = d.net !== undefined ? parseFloat(d.net) : (colVal - refVal);
          const isHighestCol = colVal === maxCol && colVal > 0;
          const isHovered = hovered?.index === i;
          const colBarPx = colVal > 0 ? Math.max((colVal / effectiveMaxCol) * (posHeight - 6), 4) : 0;
          const refBarPx = refVal > 0 ? Math.max((refVal / effectiveMaxRef) * (negHeight - 4), 4) : 0;
          const leftPct = ((i + 0.5) / data.length) * 100;

          return (
            <div
              key={i}
              style={{
                flex: 1,
                minWidth: 0,
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                position: 'relative',
                cursor: 'pointer',
                zIndex: 2,
              }}
              onMouseEnter={() => setHovered({
                index: i,
                label: d.label,
                fullLabel: d.full_label || d.label,
                collections: colVal,
                refunds: refVal,
                net: netVal,
                leftPct,
              })}
            >
              {/* Top Positive Area: Collections growing upwards */}
              <div
                style={{
                  height: `${posHeight}px`,
                  width: '100%',
                  display: 'flex',
                  alignItems: 'flex-end',
                  justifyContent: 'center',
                }}
              >
                {colVal > 0 ? (
                  <div
                    style={{
                      width: '100%',
                      height: `${colBarPx}px`,
                      backgroundColor: isHovered
                        ? '#183A34'
                        : (isHighestCol ? '#122D29' : '#122D29'),
                      borderRadius: '3px 3px 0 0',
                      opacity: isHovered ? 1 : 0.95,
                      transform: isHovered ? 'scaleY(1.03)' : 'scaleY(1)',
                      transformOrigin: 'bottom',
                      boxShadow: isHovered ? '0 0 6px rgba(18, 45, 41, 0.35)' : 'none',
                      transition: 'height 0.25s ease, transform 0.12s ease, background-color 0.12s ease',
                    }}
                  />
                ) : (
                  <div
                    style={{
                      width: '100%',
                      height: '2px',
                      backgroundColor: isHovered ? '#122D29' : '#E5DFC8',
                      opacity: 0.6,
                      borderRadius: '1px 1px 0 0',
                    }}
                  />
                )}
              </div>

              {/* Bottom Negative Area: Refunds growing downwards */}
              <div
                style={{
                  height: `${negHeight}px`,
                  width: '100%',
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'center',
                }}
              >
                {refVal > 0 ? (
                  <div
                    style={{
                      width: '100%',
                      height: `${refBarPx}px`,
                      backgroundColor: isHovered ? '#991B1B' : '#C03E33',
                      borderRadius: '0 0 3px 3px',
                      opacity: isHovered ? 1 : 0.95,
                      transform: isHovered ? 'scaleY(1.04)' : 'scaleY(1)',
                      transformOrigin: 'top',
                      boxShadow: isHovered ? '0 0 6px rgba(192, 62, 51, 0.4)' : 'none',
                      transition: 'height 0.25s ease, transform 0.12s ease, background-color 0.12s ease',
                    }}
                  />
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      {/* X-Axis Labels Row */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: is30Days ? 2 : (data.length <= 7 ? 12 : 8),
          width: '100%',
          marginTop: 6,
        }}
      >
        {data.map((d, i) => {
          const isHovered = hovered?.index === i;
          return (
            <span
              key={i}
              style={{
                flex: 1,
                minWidth: 0,
                fontSize: is30Days ? 8.5 : 10.5,
                color: isHovered ? '#122D29' : '#5C5A54',
                fontWeight: isHovered ? 700 : 500,
                textAlign: 'center',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                transition: 'color 0.15s ease',
              }}
            >
              {d.short_label || d.label}
            </span>
          );
        })}
      </div>

    </div>
  );
}

function QuickAction({ icon: Icon, label, onClick }) {
  return (
    <button
      onClick={onClick}
      className="sd-quick-action-btn"
      type="button"
    >
      <div className="sd-quick-action-icon-wrap">
        <Icon size={20} color="#122D29" strokeWidth={2} />
      </div>
      <span className="sd-quick-action-label">{label}</span>
    </button>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function StoreDashboard({ onNavigate }) {
  const [kpis, setKpis] = useState(null);
  const [chartData, setChartData] = useState([]);
  const [chartPeriod, setChartPeriod] = useState('month');
  const [recentOrders, setRecentOrders] = useState([]);
  const [recentPayments, setRecentPayments] = useState([]);
  const [hotProducts, setHotProducts] = useState([]);
  const [hotPeriod, setHotPeriod] = useState('week');
  const [loading, setLoading] = useState(true);
  const [revenueHidden, setRevenueHidden] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const intervalRef = useRef(null);

  const loadAll = useCallback(async () => {
    try {
      const [kpisData, ordersData, paymentsData] = await Promise.all([
        apiRequest('/api/admin/commerce/dashboard/kpis').catch(() => null),
        apiRequest('/api/admin/commerce/orders?limit=6').catch(() => ({ items: [] })),
        apiRequest('/api/admin/commerce/payments?limit=6').catch(() => ({ items: [] })),
      ]);
      setKpis(kpisData);
      setRecentOrders(ordersData?.items || []);
      setRecentPayments(paymentsData?.items || []);
    } catch (e) {
      console.error('Dashboard load error:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadChart = useCallback(async (period) => {
    try {
      const data = await apiRequest(`/api/admin/commerce/dashboard/revenue-chart?period=${period}`);
      setChartData(Array.isArray(data) ? data : []);
    } catch (e) {
      setChartData([]);
    }
  }, []);

  const loadHotProducts = useCallback(async (period) => {
    try {
      const data = await apiRequest(`/api/admin/commerce/dashboard/hot-products?period=${period}&limit=5`);
      setHotProducts(Array.isArray(data) ? data : []);
    } catch (e) {
      setHotProducts([]);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);
  useEffect(() => { loadChart(chartPeriod); }, [loadChart, chartPeriod]);
  useEffect(() => { loadHotProducts(hotPeriod); }, [loadHotProducts, hotPeriod]);

  const refreshAll = useCallback(async () => {
    await Promise.all([
      loadAll(),
      loadChart(chartPeriod),
      loadHotProducts(hotPeriod),
    ]);
  }, [loadAll, loadChart, chartPeriod, loadHotProducts, hotPeriod]);

  // Periodic auto-refresh (45s) while tab is visible
  useEffect(() => {
    const runRefresh = () => {
      if (!document.hidden) {
        refreshAll();
      }
    };

    intervalRef.current = setInterval(runRefresh, 45000);

    const handleVisibility = () => {
      if (!document.hidden) {
        runRefresh();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [refreshAll]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await refreshAll();
    setRefreshing(false);
  };

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 400, flexDirection: 'column', gap: 12 }}>
      <div style={{ width: 32, height: 32, border: '3px solid #E5DFC8', borderTopColor: '#122D29', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <span style={{ color: '#5C5A54', fontSize: 14 }}>Loading store data...</span>
    </div>
  );

  const fc = kpis?.fulfilment_counts || {};

  return (
    <div className="sd-dashboard">
      {/* Page Header */}
      <div className="sd-page-header">
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
          <h1 className="sd-page-title" style={{ marginBottom: 0 }}>Store Dashboard</h1>
          <span className="sd-page-subtitle" style={{ margin: 0 }}>Live commerce operations overview</span>
        </div>
        <button
          className="sd-refresh-icon-btn"
          onClick={handleRefresh}
          disabled={refreshing}
          title="Refresh dashboard data"
          aria-label="Refresh dashboard data"
        >
          <RefreshCw size={16} className={refreshing ? 'sd-spinning' : ''} />
        </button>
      </div>

      {/* UPPER THREE-COLUMN GRID */}
      <div className="sd-upper-grid">

        {/* LEFT: Revenue Overview + 6 Quick Actions */}
        <div className="sd-card sd-revenue-card">
          <div className="sd-revenue-header">
            <span className="sd-card-label">Total Collected</span>
            <button className="sd-eye-btn" onClick={() => setRevenueHidden(h => !h)} title={revenueHidden ? 'Show total collected' : 'Hide total collected'}>
              {revenueHidden ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
          <div className="sd-revenue-amount">
            {revenueHidden ? '₹ ••••••' : formatINRDecimals(kpis?.total_collected || kpis?.total_revenue || 0)}
          </div>
          <div className="sd-revenue-sub">Confirmed Gross Collections (Captured + Confirmed COD)</div>

          <div className="sd-divider" />

          <div className="sd-quick-actions-title">Quick Actions</div>
          <div className="sd-quick-actions-grid-6">
            <QuickAction icon={ShoppingBag} label="View Orders" onClick={() => onNavigate('orders')} />
            <QuickAction icon={Package} label="Manage Inventory" onClick={() => onNavigate('inventory')} />
            <QuickAction icon={CreditCard} label="Payment History" onClick={() => onNavigate('payments')} />
            <QuickAction icon={Truck} label="Shipment Updates" onClick={() => onNavigate('orders')} />
            <QuickAction icon={RotateCcw} label="Returns & Refunds" onClick={() => onNavigate('returns')} />
            <QuickAction icon={Download} label="Export Payments" onClick={() => window.open('/api/admin/commerce/payments/export/csv?mode=filtered', '_blank')} />
          </div>
        </div>

        {/* CENTER: KPI cards + Earnings Chart */}
        <div className="sd-center-col">
          {/* Two compact KPI cards */}
          <div className="sd-kpi-row">
            <div className="sd-card sd-kpi-card">
              <div className="sd-kpi-label">Total Orders</div>
              <div className="sd-kpi-value">{(kpis?.total_orders || 0).toLocaleString('en-IN')}</div>
              <div className="sd-kpi-sub">All time</div>
            </div>
            <div className="sd-card sd-kpi-card">
              <div className="sd-kpi-label">Available Stock</div>
              <div className="sd-kpi-value">{(kpis?.available_stock || 0).toLocaleString('en-IN')}</div>
              <div className="sd-kpi-sub">units ready to sell</div>
            </div>
          </div>

          {/* Earnings Activity Chart Pinned to Bottom */}
          <div className="sd-card sd-chart-card">
            <div className="sd-chart-header">
              <div>
                <div className="sd-card-label">Earnings Activity</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, flexWrap: 'wrap', marginTop: 2 }}>
                  <div className="sd-chart-amount">{formatINR(kpis?.total_collected || kpis?.total_revenue || 0)}</div>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 12, fontSize: 11, color: '#5C5A54' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                      <span style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: '#122D29' }} />
                      <span>Collections</span>
                    </span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                      <span style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: '#C03E33' }} />
                      <span>Refunds</span>
                    </span>
                  </div>
                </div>
              </div>
              <div className="sd-period-tabs">
                {[
                  { key: 'day', label: 'Day' },
                  { key: 'week', label: 'Week' },
                  { key: 'month', label: 'Month' },
                ].map(tab => (
                  <button
                    key={tab.key}
                    className={`sd-period-tab ${chartPeriod === tab.key ? 'active' : ''}`}
                    onClick={() => setChartPeriod(tab.key)}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>
            <BarChart data={chartData} />
          </div>
        </div>

        {/* RIGHT: Returns & Refunds KPI + Fulfilment Overview */}
        <div className="sd-right-col">
          {/* Compact Returns & Refunds KPI */}
          <div className="sd-card sd-returns-compact-card">
            <div className="sd-card-header-row" style={{ marginBottom: 6 }}>
              <span className="sd-card-label" style={{ margin: 0, textTransform: 'uppercase' }}>Returns &amp; Refunds</span>
              <button
                className="sd-link-btn sd-view-all-text"
                onClick={() => onNavigate('returns')}
                title="Manage Returns and Refunds"
              >
                Manage &rarr;
              </button>
            </div>
            <div className="sd-returns-compact-grid">
              <div className="sd-returns-compact-stat">
                <div className="sd-returns-compact-val">{kpis?.pending_returns || 0}</div>
                <div className="sd-returns-compact-lbl">Awaiting Action</div>
              </div>
              <div className="sd-returns-compact-stat">
                <div className="sd-returns-compact-val">{formatINR(kpis?.refunded_amount || 0)}</div>
                <div className="sd-returns-compact-lbl">Total Refunded</div>
              </div>
            </div>
          </div>

          {/* Fulfilment Overview */}
          <div className="sd-card sd-fulfilment-card">
            <div className="sd-card-header-row">
              <span className="sd-card-title">Fulfilment Overview</span>
              <button className="sd-link-btn" onClick={() => onNavigate('orders')} title="View Orders">
                <ArrowUpRight size={14} />
              </button>
            </div>

            <div className="sd-fulfilment-list">
              {[
                { key: 'placed', label: 'Placed', count: fc.placed || 0 },
                { key: 'accepted', label: 'Accepted', count: fc.accepted || 0 },
                { key: 'processing', label: 'Processing', count: fc.processing || 0 },
                { key: 'packed', label: 'Packed', count: fc.packed || 0 },
                { key: 'ready_to_ship', label: 'Ready to Ship', count: fc.ready_to_ship || 0 },
                { key: 'ready_for_dispatch', label: 'Ready for Dispatch', count: fc.ready_for_dispatch || 0 },
                { key: 'received', label: 'Received', count: fc.received || 0 },
                { key: 'scheduled', label: 'Scheduled', count: fc.scheduled || 0 },
                { key: 'shipped', label: 'Shipped', count: fc.shipped || 0 },
                { key: 'out_for_delivery', label: 'Out for Delivery', count: fc.out_for_delivery || 0 },
                { key: 'delivered', label: 'Delivered', count: fc.delivered || 0 },
              ].map(item => (
                <div key={item.key} className="sd-fulfilment-row">
                  <StatusBadge status={item.key} />
                  <span className="sd-fulfilment-count">{item.count}</span>
                </div>
              ))}
            </div>

            <button className="sd-view-all-btn" onClick={() => onNavigate('orders')}>
              View All Orders <ChevronRight size={14} />
            </button>
          </div>
        </div>

      </div>

      {/* LOWER THREE-COLUMN GRID */}
      <div className="sd-lower-grid">

        {/* Recent Orders */}
        <div className="sd-card sd-panel-card">
          <div className="sd-card-header-row">
            <span className="sd-card-title">Recent Orders</span>
            <button className="sd-link-btn sd-view-all-text" onClick={() => onNavigate('orders')}>View all</button>
          </div>
          <div className="sd-scroll-list">
            {recentOrders.length === 0 ? (
              <div className="sd-empty">No recent orders</div>
            ) : recentOrders.map(order => (
              <div
                key={order.id}
                className="sd-order-row sd-clickable-row"
                onClick={() => onNavigate('orders', order.id || order.order_number)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onNavigate('orders', order.id || order.order_number); }}
                title="Click to view and highlight in Orders"
              >
                <div className="sd-order-info">
                  <div className="sd-order-number">{order.order_number}</div>
                  <div className="sd-order-product" title={order.product_summary || 'Order items'}>
                    {order.product_summary || 'Order items'}
                  </div>
                  {order.quantity > 0 && (
                    <div className="sd-order-meta">
                      {order.quantity} unit{order.quantity > 1 ? 's' : ''}
                    </div>
                  )}
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div className="sd-order-amount">{formatINR(order.total_amount)}</div>
                  <StatusBadge status={order.status} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Payments */}
        <div className="sd-card sd-panel-card">
          <div className="sd-card-header-row">
            <span className="sd-card-title">Recent Payments</span>
            <button className="sd-link-btn sd-view-all-text" onClick={() => onNavigate('payments')}>View all</button>
          </div>
          <div className="sd-scroll-list">
            {recentPayments.length === 0 ? (
              <div className="sd-empty">No recent payments</div>
            ) : recentPayments.map((pay, i) => {
              const paymentRef = pay.id || (pay.attempt_id ? `attempt-${pay.attempt_id}` : `cod-${pay.order_id}`);
              return (
                <div
                  key={pay.id || i}
                  className="sd-payment-row sd-clickable-row"
                  onClick={() => onNavigate('payments', paymentRef)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onNavigate('payments', paymentRef); }}
                  title="Click to view transaction in Payment History"
                >
                  <div className="sd-customer-avatar">
                    {(pay.customer_name || 'U').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                  </div>
                  <div className="sd-payment-info">
                    <div className="sd-payment-customer">{pay.customer_name || 'Customer'}</div>
                    <div className="sd-payment-method">{pay.payment_method?.toUpperCase() || '—'}</div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div className="sd-payment-amount">{formatINR(pay.amount)}</div>
                    <StatusBadge status={pay.status} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Hot Products */}
        <div className="sd-card sd-panel-card">
          <div className="sd-card-header-row">
            <span className="sd-card-title">Hot Products</span>
            <div className="sd-period-tabs">
              {['day', 'week', 'month'].map(p => (
                <button
                  key={p}
                  className={`sd-period-tab ${hotPeriod === p ? 'active' : ''}`}
                  onClick={() => setHotPeriod(p)}
                >
                  {p.charAt(0).toUpperCase() + p.slice(1)}
                </button>
              ))}
            </div>
          </div>
          <div className="sd-scroll-list">
            {hotProducts.length === 0 ? (
              <div className="sd-empty">No sales data for this period</div>
            ) : hotProducts.map((p, i) => (
              <div key={i} className="sd-hot-product-row">
                <span className="sd-hot-rank">#{p.rank || (i + 1)}</span>
                <div className="sd-hot-info">
                  <div className="sd-hot-name" title={p.product_name}>{p.product_name}</div>
                  <div className="sd-hot-variant">
                    {p.variant_name ? `${p.variant_name} · ` : ''}{p.units_sold || p.total_qty || 0} sold
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div className="sd-hot-revenue">{formatINRDecimals(p.revenue || p.total_revenue || 0)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}

export default StoreDashboard;
