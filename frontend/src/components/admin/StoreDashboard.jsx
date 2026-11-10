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

function BarChart({ data, height = 80 }) {
  if (!data || data.length === 0) return <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#A8A293', fontSize: 13 }}>No data</div>;
  const maxVal = Math.max(...data.map(d => d.value || 0)) || 1;
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height }}>
      {data.map((d, i) => {
        const pct = maxVal > 0 ? (d.value / maxVal) : 0;
        const isHighest = d.value === maxVal;
        return (
          <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, height: '100%', justifyContent: 'flex-end' }}>
            <div title={`${d.label}: ${formatINR(d.value)}`} style={{
              width: '100%', height: `${Math.max(pct * (height - 20), 2)}px`,
              backgroundColor: isHighest ? '#122D29' : '#C2A15A',
              borderRadius: '3px 3px 0 0', opacity: isHighest ? 1 : 0.5,
              transition: 'height 0.3s ease', cursor: 'pointer',
            }} />
            <span style={{ fontSize: 9, color: '#A8A293', textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%' }}>{d.label}</span>
          </div>
        );
      })}
    </div>
  );
}

function QuickAction({ icon: Icon, label, onClick }) {
  return (
    <button onClick={onClick} style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
      background: 'none', border: 'none', cursor: 'pointer', padding: '8px 12px',
    }}>
      <div style={{
        width: 44, height: 44, borderRadius: '50%',
        backgroundColor: '#F5F0E8', border: '1px solid #E5DFC8',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'all 0.15s ease',
      }}>
        <Icon size={18} color="#122D29" strokeWidth={2} />
      </div>
      <span style={{ fontSize: 11, color: '#5C5A54', fontWeight: 500, textAlign: 'center', lineHeight: 1.2 }}>{label}</span>
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
        apiRequest('/api/admin/commerce/orders?limit=5').catch(() => ({ items: [] })),
        apiRequest('/api/admin/commerce/payments?limit=5').catch(() => ({ items: [] })),
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

  // 45-second auto-refresh while visible
  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden) {
        clearInterval(intervalRef.current);
      } else {
        intervalRef.current = setInterval(loadAll, 45000);
      }
    };
    intervalRef.current = setInterval(loadAll, 45000);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      clearInterval(intervalRef.current);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [loadAll]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([loadAll(), loadChart(chartPeriod), loadHotProducts(hotPeriod)]);
    setRefreshing(false);
  };

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 400, flexDirection: 'column', gap: 12 }}>
      <div style={{ width: 32, height: 32, border: '3px solid #E5DFC8', borderTopColor: '#122D29', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <span style={{ color: '#8B8578', fontSize: 14 }}>Loading store data...</span>
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
        <button className="sd-refresh-btn" onClick={handleRefresh} disabled={refreshing}>
          <RefreshCw size={15} className={refreshing ? 'sd-spinning' : ''} />
          {refreshing ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {/* UPPER THREE-COLUMN GRID */}
      <div className="sd-upper-grid">

        {/* LEFT: Revenue Overview + Quick Actions */}
        <div className="sd-card sd-revenue-card">
          <div className="sd-revenue-header">
            <span className="sd-card-label">Store Revenue</span>
            <button className="sd-eye-btn" onClick={() => setRevenueHidden(h => !h)}>
              {revenueHidden ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
          <div className="sd-revenue-amount">
            {revenueHidden ? '₹ ••••••' : formatINRDecimals(kpis?.total_revenue || 0)}
          </div>
          <div className="sd-revenue-sub">Confirmed Revenue (Captured + COD − Refunds)</div>

          <div className="sd-divider" />

          <div className="sd-quick-actions-title">Quick Actions</div>
          <div className="sd-quick-actions-grid">
            <QuickAction icon={ShoppingBag} label="View Orders" onClick={() => onNavigate('orders')} />
            <QuickAction icon={Package} label="Manage Inventory" onClick={() => onNavigate('inventory')} />
            <QuickAction icon={CreditCard} label="Payment History" onClick={() => onNavigate('payments')} />
            <QuickAction icon={Truck} label="Shipment Updates" onClick={() => onNavigate('orders')} />
            <QuickAction icon={RotateCcw} label="Returns & Refunds" onClick={() => onNavigate('returns')} />
            <QuickAction icon={Download} label="Export Payments" onClick={() => { window.open('/api/admin/commerce/payments/export/csv?mode=filtered', '_blank'); }} />
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

          {/* Earnings Activity Chart */}
          <div className="sd-card sd-chart-card">
            <div className="sd-chart-header">
              <div>
                <div className="sd-card-label">Earnings Activity</div>
                <div className="sd-chart-amount">{formatINR(kpis?.total_revenue || 0)}</div>
              </div>
              <div className="sd-period-tabs">
                {['day', 'month', 'year'].map(p => (
                  <button
                    key={p}
                    className={`sd-period-tab ${chartPeriod === p ? 'active' : ''}`}
                    onClick={() => setChartPeriod(p)}
                  >
                    {p.charAt(0).toUpperCase() + p.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            <BarChart data={chartData} height={90} />
          </div>
        </div>

        {/* RIGHT: Fulfilment Overview */}
        <div className="sd-card sd-fulfilment-card">
          <div className="sd-card-header-row">
            <span className="sd-card-title">Fulfilment Overview</span>
            <button className="sd-link-btn" onClick={() => onNavigate('orders')}>
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

      {/* LOWER THREE-COLUMN GRID */}
      <div className="sd-lower-grid">

        {/* Recent Orders */}
        <div className="sd-card">
          <div className="sd-card-header-row">
            <span className="sd-card-title">Recent Orders</span>
            <button className="sd-link-btn sd-view-all-text" onClick={() => onNavigate('orders')}>View all</button>
          </div>
          <div className="sd-table-wrap">
            {recentOrders.length === 0 ? (
              <div className="sd-empty">No recent orders</div>
            ) : recentOrders.map(order => (
              <div key={order.id} className="sd-order-row">
                <div className="sd-order-info">
                  <div className="sd-order-number">{order.order_number}</div>
                  <div className="sd-order-customer">{order.customer_name || 'Customer'}</div>
                  <div className="sd-order-product">{order.product_summary || order.items?.[0]?.product_name || '—'}</div>
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
        <div className="sd-card">
          <div className="sd-card-header-row">
            <span className="sd-card-title">Recent Payments</span>
            <button className="sd-link-btn sd-view-all-text" onClick={() => onNavigate('payments')}>View all</button>
          </div>
          <div className="sd-table-wrap">
            {recentPayments.length === 0 ? (
              <div className="sd-empty">No recent payments</div>
            ) : recentPayments.map((pay, i) => (
              <div key={pay.id || i} className="sd-payment-row">
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
            ))}
          </div>
        </div>

        {/* Hot Products + Returns Summary */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="sd-card">
            <div className="sd-card-header-row">
              <span className="sd-card-title">Hot Products</span>
              <div className="sd-period-tabs">
                {['day', 'week', 'month'].map(p => (
                  <button key={p} className={`sd-period-tab ${hotPeriod === p ? 'active' : ''}`} onClick={() => setHotPeriod(p)}>
                    {p.charAt(0).toUpperCase() + p.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            {hotProducts.length === 0 ? (
              <div className="sd-empty">No sales data yet</div>
            ) : hotProducts.map((p, i) => (
              <div key={i} className="sd-hot-product-row">
                <span className="sd-hot-rank">#{i + 1}</span>
                <div className="sd-hot-info">
                  <div className="sd-hot-name">{p.product_name}</div>
                  <div className="sd-hot-variant">{p.variant_name}</div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div className="sd-hot-revenue">{formatINR(p.revenue)}</div>
                  <div className="sd-hot-units">{p.units_sold} sold</div>
                </div>
              </div>
            ))}
          </div>

          {/* Returns Summary */}
          <div className="sd-card sd-returns-card">
            <div className="sd-card-title" style={{ marginBottom: 12 }}>Returns &amp; Refunds</div>
            <div className="sd-returns-grid">
              <div className="sd-returns-stat">
                <div className="sd-returns-value">{kpis?.pending_returns || 0}</div>
                <div className="sd-returns-label">Awaiting Action</div>
              </div>
              <div className="sd-returns-stat">
                <div className="sd-returns-value">{formatINR(kpis?.refunded_amount || 0)}</div>
                <div className="sd-returns-label">Total Refunded</div>
              </div>
            </div>
            <button className="sd-link-btn sd-view-all-text" onClick={() => onNavigate('returns')}>Manage returns →</button>
          </div>
        </div>

      </div>
    </div>
  );
}

export default StoreDashboard;
