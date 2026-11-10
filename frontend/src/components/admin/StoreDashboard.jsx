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
    packed: { bg: '#EDE9FE', color: '#6D28D9', label: 'Packed' },
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

  const maxVal = Math.max(...data.map(d => parseFloat(d.value) || 0)) || 1;
  const is30Days = data.length > 20;

  return (
    <div style={{ position: 'relative', width: '100%', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', marginTop: 8 }}>
      
      {/* Sleek Custom Floating Tooltip (No ugly black native box) */}
      {hovered && (
        <div
          style={{
            position: 'absolute',
            bottom: 'calc(100% - 6px)',
            left: `${hovered.leftPct}%`,
            transform: 'translateX(-50%)',
            backgroundColor: '#122D29',
            color: '#FFFFFF',
            padding: '7px 12px',
            borderRadius: '8px',
            boxShadow: '0 8px 20px rgba(18, 45, 41, 0.25)',
            border: '1px solid rgba(194, 161, 90, 0.45)',
            pointerEvents: 'none',
            zIndex: 30,
            whiteSpace: 'nowrap',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 2,
            transition: 'left 0.08s ease-out',
          }}
        >
          <span style={{ fontSize: 10, fontWeight: 700, color: '#C2A15A', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            {hovered.fullLabel || hovered.label}
          </span>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#FFFFFF', fontVariantNumeric: 'tabular-nums' }}>
            {formatINRDecimals(hovered.value)}
          </span>
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

      {/* Bars Row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          gap: is30Days ? 2 : 8,
          height: 125,
          width: '100%',
        }}
        onMouseLeave={() => setHovered(null)}
      >
        {data.map((d, i) => {
          const valNum = parseFloat(d.value) || 0;
          const pct = maxVal > 0 ? (valNum / maxVal) : 0;
          const isHighest = valNum === maxVal && valNum > 0;
          const isHovered = hovered?.index === i;
          const barHeightPx = Math.max(pct * 115, 3);
          const leftPct = ((i + 0.5) / data.length) * 100;

          return (
            <div
              key={i}
              style={{
                flex: 1,
                minWidth: 0,
                height: '100%',
                display: 'flex',
                alignItems: 'flex-end',
                justifyContent: 'center',
                position: 'relative',
              }}
              onMouseEnter={() => setHovered({
                index: i,
                label: d.label,
                fullLabel: d.full_label || d.label,
                value: valNum,
                leftPct,
              })}
            >
              <div
                style={{
                  width: '100%',
                  height: `${barHeightPx}px`,
                  backgroundColor: isHovered
                    ? '#183A34'
                    : (isHighest ? '#122D29' : (valNum > 0 ? '#C2A15A' : '#E5DFC8')),
                  borderRadius: '3px 3px 0 0',
                  opacity: isHovered ? 1 : (isHighest ? 1 : (valNum > 0 ? 0.8 : 0.4)),
                  transform: isHovered ? 'scaleY(1.05)' : 'scaleY(1)',
                  transformOrigin: 'bottom',
                  boxShadow: isHovered ? '0 0 6px rgba(18, 45, 41, 0.3)' : 'none',
                  transition: 'height 0.3s ease, transform 0.15s ease, background-color 0.15s ease',
                  cursor: 'pointer',
                }}
              />
            </div>
          );
        })}
      </div>

      {/* Bottom X-Axis Line: Pinned to Bottom */}
      <div style={{ width: '100%', height: 1.5, backgroundColor: '#E5DFC8', marginTop: 4, marginBottom: 5 }} />

      {/* X-Axis Labels Row */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: is30Days ? 2 : 8,
          width: '100%',
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
        <Icon size={19} color="#122D29" strokeWidth={2.2} />
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
        <div>
          <h1 className="sd-page-title">Store Dashboard</h1>
          <p className="sd-page-subtitle">Live commerce operations overview</p>
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

        {/* LEFT: Revenue Overview + 6 Quick Actions (Utilizing Whitespace) */}
        <div className="sd-card sd-revenue-card">
          <div className="sd-revenue-header">
            <span className="sd-card-label">Store Revenue</span>
            <button className="sd-eye-btn" onClick={() => setRevenueHidden(h => !h)} title={revenueHidden ? 'Show revenue' : 'Hide revenue'}>
              {revenueHidden ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
          <div className="sd-revenue-amount">
            {revenueHidden ? '₹ ••••••' : formatINRDecimals(kpis?.total_revenue || 0)}
          </div>
          <div className="sd-revenue-sub">Confirmed Revenue (Captured + COD − Refunds)</div>

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
                <div className="sd-chart-amount">{formatINR(kpis?.total_revenue || 0)}</div>
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
                { key: 'pending', label: 'Pending', count: fc.pending || 0 },
                { key: 'processing', label: 'Processing', count: fc.processing || 0 },
                { key: 'packed', label: 'Packed', count: fc.packed || 0 },
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
