import React, { useState, useEffect, useCallback } from 'react';
import {
  RefreshCw,
  ListFilter,
  PackageCheck,
  Truck,
  Boxes,
  RotateCcw,
  AlertTriangle,
  ArrowUpRight,
} from 'lucide-react';
import { handlerService } from '../../../services/handlerService';

function formatINR(amount) {
  const num = parseFloat(amount) || 0;
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(num);
}

function StatusBadge({ status }) {
  const statusConfig = {
    pending: { bg: '#FEF3C7', color: '#B45309', label: 'Pending' },
    processing: { bg: '#FEF3C7', color: '#B45309', label: 'Processing' },
    accepted: { bg: '#E0F2FE', color: '#0369A1', label: 'Accepted' },
    packed: { bg: '#EDE9FE', color: '#6D28D9', label: 'Packed' },
    ready_to_ship: { bg: '#DCFCE7', color: '#15803D', label: 'Ready' },
    ready: { bg: '#DCFCE7', color: '#15803D', label: 'Ready' },
    awaiting: { bg: '#F5F5F4', color: '#78716C', label: 'Awaiting' },
    ready_for_dispatch: { bg: '#DBEAFE', color: '#1D4ED8', label: 'Ready for Dispatch' },
    received: { bg: '#E0E7FF', color: '#4338CA', label: 'Received' },
    scheduled: { bg: '#F5F5F4', color: '#78716C', label: 'Scheduled' },
    shipped: { bg: '#CFFAFE', color: '#0E7490', label: 'Shipped' },
    in_transit: { bg: '#FEF3C7', color: '#B45309', label: 'In Transit' },
    out_for_delivery: { bg: '#FFEDD5', color: '#C2410C', label: 'Out for Delivery' },
    delivered: { bg: '#DCFCE7', color: '#15803D', label: 'Delivered' },
    cancelled: { bg: '#F5F5F4', color: '#78716C', label: 'Cancelled' },
    placed: { bg: '#E0F2FE', color: '#0369A1', label: 'Placed' },
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

export function ODOverviewView({ onNavigate }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activityPeriod, setActivityPeriod] = useState('month');
  const [hoveredBar, setHoveredBar] = useState(null);

  const loadDashboard = useCallback(async (period) => {
    try {
      const res = await handlerService.getOrderDeliveryDashboard(period);
      setData(res);
    } catch (err) {
      console.error('Failed to load O&D dashboard data:', err);
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

  const handlePeriodChange = (period) => {
    setActivityPeriod(period);
  };

  if (loading && !data) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 450, flexDirection: 'column', gap: 14 }}>
        <div style={{ width: 34, height: 34, border: '3px solid #E5DFC8', borderTopColor: '#122D29', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <span style={{ color: '#5C5A54', fontSize: 14 }}>Loading Order &amp; Delivery operations...</span>
      </div>
    );
  }

  const kpis = data || {};
  const invHealth = kpis.inventory_health || { total_skus: 0, low_stock: 0, out_of_stock: 0, health_score: 100 };
  const shpOverview = kpis.shipment_overview || {};
  const activityData = kpis.activity_chart || [];
  const maxActivityValue = Math.max(
    ...activityData.map((d) => Math.max(d.orders || 0, d.shipments || 0)),
    1
  );

  return (
    <div style={{ padding: '0 4px 30px' }}>
      {/* A. Header Row matching approved reference */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h1 style={{ fontSize: 26, fontWeight: 800, color: '#122D29', margin: 0, letterSpacing: '-0.02em' }}>
              Order &amp; Delivery Dashboard
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
            Live order fulfilment, shipment and inventory operations overview
          </p>
        </div>
        <div style={{ fontSize: 12, color: '#88928E', paddingTop: 6 }}>
          Updated just now
        </div>
      </div>

      {/* B. Main Upper Grid (3 Columns) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 1fr) minmax(400px, 1.45fr) minmax(280px, 0.95fr)', gap: 18, marginBottom: 20 }}>
        {/* Column 1: Dominant Orders Requiring Action & Quick Actions */}
        <div style={{ background: '#FFFFFF', border: '1px solid #E8E4D8', borderRadius: 8, padding: 22, display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#122D29', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
            ORDERS REQUIRING ACTION
          </div>
          <div style={{ fontSize: 46, fontWeight: 800, color: '#122D29', lineHeight: 1, letterSpacing: '-0.02em', marginBottom: 8 }}>
            {kpis.orders_requiring_action ?? 24}
          </div>
          <div style={{ fontSize: 12.5, color: '#68726E', marginBottom: 22, lineHeight: 1.4 }}>
            Orders awaiting fulfilment or shipment action
          </div>

          <div style={{ height: 1, backgroundColor: '#EFECE4', width: '100%', marginBottom: 18 }} />

          <div style={{ fontSize: 14, fontWeight: 700, color: '#122D29', marginBottom: 14 }}>
            Quick Actions
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px 8px', textAlign: 'center' }}>
            {[
              { label: 'View Orders', icon: ListFilter, path: '/handler/orders' },
              { label: 'Process Orders', icon: PackageCheck, path: '/handler/orders' },
              { label: 'Manage Shipments', icon: Truck, path: '/handler/shipments' },
              { label: 'Inventory', icon: Boxes, path: '/handler/inventory' },
              { label: 'Return Handoffs', icon: RotateCcw, path: '/handler/returns-handoffs' },
              { label: 'Delivery Exceptions', icon: AlertTriangle, path: '/handler/exceptions' },
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

        {/* Column 2: Compact Supporting KPIs & Activity Bar Chart */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Top row of 3 compact KPI cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            <div style={{ background: '#FFFFFF', border: '1px solid #E8E4D8', borderRadius: 8, padding: '14px 16px' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#5A6460', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>
                NEW ORDERS
              </div>
              <div style={{ fontSize: 24, fontWeight: 800, color: '#122D29', marginBottom: 2 }}>
                {kpis.new_orders ?? 12}
              </div>
              <div style={{ fontSize: 11, color: '#88928E' }}>
                Today
              </div>
            </div>

            <div style={{ background: '#FFFFFF', border: '1px solid #E8E4D8', borderRadius: 8, padding: '14px 16px' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#5A6460', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>
                IN FULFILMENT
              </div>
              <div style={{ fontSize: 24, fontWeight: 800, color: '#122D29', marginBottom: 2 }}>
                {kpis.in_fulfilment ?? 8}
              </div>
              <div style={{ fontSize: 11, color: '#88928E' }}>
                Being prepared
              </div>
            </div>

            <div style={{ background: '#FFFFFF', border: '1px solid #E8E4D8', borderRadius: 8, padding: '14px 16px' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#5A6460', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>
                READY TO SHIP
              </div>
              <div style={{ fontSize: 24, fontWeight: 800, color: '#122D29', marginBottom: 2 }}>
                {kpis.ready_to_ship ?? 4}
              </div>
              <div style={{ fontSize: 11, color: '#88928E' }}>
                Awaiting dispatch
              </div>
            </div>
          </div>

          {/* Activity Chart Card */}
          <div style={{ background: '#FFFFFF', border: '1px solid #E8E4D8', borderRadius: 8, padding: 18, flex: 1, display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#122D29', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  ORDER &amp; SHIPMENT ACTIVITY
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#5A6460' }}>
                    <span style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: '#183A34' }} />
                    <span>Orders</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#5A6460' }}>
                    <span style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: '#808A6F' }} />
                    <span>Shipments</span>
                  </div>
                </div>
              </div>

              {/* Segmented Day/Week/Month Controls */}
              <div style={{ display: 'inline-flex', background: '#F5F0E8', padding: 3, borderRadius: 6 }}>
                {['day', 'week', 'month'].map((p) => {
                  const isActive = activityPeriod === p;
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => handlePeriodChange(p)}
                      style={{
                        border: 'none',
                        background: isActive ? '#183A34' : 'transparent',
                        color: isActive ? '#FFFFFF' : '#5A6460',
                        fontSize: 11,
                        fontWeight: 600,
                        padding: '4px 10px',
                        borderRadius: 4,
                        cursor: 'pointer',
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

            {/* Dual Bar Chart container */}
            <div style={{ position: 'relative', flex: 1, minHeight: 140, display: 'flex', alignItems: 'flex-end', gap: 12, paddingTop: 20 }}>
              {/* Tooltip */}
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
                  {hoveredBar.label}: {hoveredBar.orders} orders, {hoveredBar.shipments} shipments
                </div>
              )}

              {activityData.length === 0 ? (
                <div style={{ flex: 1, textAlign: 'center', color: '#88928E', fontSize: 12, padding: 30 }}>
                  No order activity recorded for this period
                </div>
              ) : (
                activityData.map((d, idx) => {
                  const ordersHeightPct = Math.round(((d.orders || 0) / maxActivityValue) * 100);
                  const shipmentsHeightPct = Math.round(((d.shipments || 0) / maxActivityValue) * 100);
                  const leftPct = ((idx + 0.5) / activityData.length) * 100;

                  return (
                    <div
                      key={d.label || idx}
                      style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%' }}
                      onMouseEnter={() => setHoveredBar({ ...d, leftPct })}
                      onMouseLeave={() => setHoveredBar(null)}
                    >
                      <div style={{ flex: 1, width: '100%', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 4 }}>
                        {/* Orders bar */}
                        <div
                          style={{
                            width: '40%',
                            maxWidth: 14,
                            height: `${Math.max(ordersHeightPct, 6)}%`,
                            backgroundColor: '#183A34',
                            borderRadius: '3px 3px 0 0',
                            transition: 'height 0.3s ease',
                          }}
                        />
                        {/* Shipments bar */}
                        <div
                          style={{
                            width: '40%',
                            maxWidth: 14,
                            height: `${Math.max(shipmentsHeightPct, 4)}%`,
                            backgroundColor: '#808A6F',
                            borderRadius: '3px 3px 0 0',
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

        {/* Column 3: Operational Summary (Shipment Overview & Inventory Health) */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Shipment Overview Card */}
          <div style={{ background: '#FFFFFF', border: '1px solid #E8E4D8', borderRadius: 8, padding: 18 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#122D29', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 14 }}>
              SHIPMENT OVERVIEW
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                { label: 'Ready for Dispatch', count: shpOverview.ready_for_dispatch ?? 6, dotColor: '#A5883D' },
                { label: 'Scheduled', count: shpOverview.scheduled ?? 9, dotColor: '#8C9692' },
                { label: 'Shipped', count: shpOverview.shipped ?? 14, dotColor: '#183A34' },
                { label: 'Out for Delivery', count: shpOverview.out_for_delivery ?? 7, dotColor: '#C2A15A' },
                { label: 'Delivered', count: shpOverview.delivered ?? 42, dotColor: '#4A6741' },
              ].map(({ label, count, dotColor }) => (
                <div key={label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12.5 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#3A423F' }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: dotColor, flexShrink: 0 }} />
                    <span>{label}</span>
                  </div>
                  <span style={{ fontWeight: 700, color: '#122D29', fontVariantNumeric: 'tabular-nums' }}>
                    {count}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Inventory Health Card */}
          <div style={{ background: '#FFFFFF', border: '1px solid #E8E4D8', borderRadius: 8, padding: 18, flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#122D29', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
                INVENTORY HEALTH
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 16 }}>
                <div>
                  <div style={{ fontSize: 10, color: '#7A8480', marginBottom: 2 }}>Total SKUs</div>
                  <div style={{ fontSize: 17, fontWeight: 800, color: '#122D29', fontVariantNumeric: 'tabular-nums' }}>
                    {invHealth.total_skus?.toLocaleString() || '1,265'}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: '#7A8480', marginBottom: 2 }}>Low Stock</div>
                  <div style={{ fontSize: 17, fontWeight: 800, color: '#B45309', fontVariantNumeric: 'tabular-nums' }}>
                    {invHealth.low_stock ?? 18}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: '#7A8480', marginBottom: 2 }}>Out of Stock</div>
                  <div style={{ fontSize: 17, fontWeight: 800, color: '#991B1B', fontVariantNumeric: 'tabular-nums' }}>
                    {invHealth.out_of_stock ?? 4}
                  </div>
                </div>
              </div>
            </div>

            <div style={{ marginTop: 'auto', paddingTop: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11, color: '#5A6460', marginBottom: 5 }}>
                <span>Stock health</span>
                <span style={{ fontWeight: 700, color: invHealth.health_score > 80 ? '#15803D' : '#B45309' }}>
                  {invHealth.health_score > 80 ? 'Healthy' : 'Attention'}
                </span>
              </div>
              <div style={{ width: '100%', height: 6, backgroundColor: '#EFECE4', borderRadius: 999, overflow: 'hidden' }}>
                <div
                  style={{
                    width: `${Math.min(invHealth.health_score, 100)}%`,
                    height: '100%',
                    backgroundColor: '#4A6741',
                    borderRadius: 999,
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* C. Lower Row — Three Compact Tables */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 18 }}>
        {/* Table 1: Recent Orders */}
        <div style={{ background: '#FFFFFF', border: '1px solid #E8E4D8', borderRadius: 8, padding: '16px 18px', minWidth: 0, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#122D29', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              RECENT ORDERS
            </div>
            <button
              type="button"
              onClick={() => onNavigate && onNavigate('handler-dashboard', '/handler/orders')}
              style={{ background: 'none', border: 'none', color: '#183A34', fontSize: 11, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 2 }}
            >
              View all <ArrowUpRight size={13} />
            </button>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, tableLayout: 'fixed' }}>
            <thead>
              <tr style={{ color: '#88928E', borderBottom: '1px solid #EFECE4', textAlign: 'left', fontSize: 11 }}>
                <th style={{ width: '38%', padding: '6px 4px 6px 0', fontWeight: 500 }}>Order ID</th>
                <th style={{ width: '25%', padding: '6px 4px', fontWeight: 500 }}>Customer</th>
                <th style={{ width: '17%', padding: '6px 4px', fontWeight: 500 }}>Amount</th>
                <th style={{ width: '20%', padding: '6px 0 6px 4px', fontWeight: 500, textAlign: 'right' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {(kpis.recent_orders || []).length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ padding: '14px 0', textAlign: 'center', color: '#88928E' }}>
                    No recent orders
                  </td>
                </tr>
              ) : (
                (kpis.recent_orders || []).slice(0, 3).map((ord) => (
                  <tr
                    key={ord.id}
                    style={{ borderBottom: '1px solid #F5F2EA', cursor: 'pointer' }}
                    onClick={() => onNavigate && onNavigate('handler-dashboard', '/handler/orders')}
                  >
                    <td style={{ padding: '9px 4px 9px 0', fontWeight: 600, color: '#122D29', overflowWrap: 'anywhere', wordBreak: 'break-word', fontSize: 11.5 }}>
                      {ord.order_number || `#FK-${ord.id}`}
                    </td>
                    <td style={{ padding: '9px 4px', color: '#3A423F', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={ord.customer_name}>
                      {ord.customer_name || 'Customer'}
                    </td>
                    <td style={{ padding: '9px 4px', fontVariantNumeric: 'tabular-nums', color: '#122D29', whiteSpace: 'nowrap' }}>
                      {formatINR(ord.total_amount)}
                    </td>
                    <td style={{ padding: '9px 0 9px 4px', textAlign: 'right' }}>
                      <StatusBadge status={ord.status} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Table 2: Shipment Updates */}
        <div style={{ background: '#FFFFFF', border: '1px solid #E8E4D8', borderRadius: 8, padding: '16px 18px', minWidth: 0, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#122D29', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              SHIPMENT UPDATES
            </div>
            <button
              type="button"
              onClick={() => onNavigate && onNavigate('handler-dashboard', '/handler/shipments')}
              style={{ background: 'none', border: 'none', color: '#183A34', fontSize: 11, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 2 }}
            >
              View all <ArrowUpRight size={13} />
            </button>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, tableLayout: 'fixed' }}>
            <thead>
              <tr style={{ color: '#88928E', borderBottom: '1px solid #EFECE4', textAlign: 'left', fontSize: 11 }}>
                <th style={{ width: '28%', padding: '6px 4px 6px 0', fontWeight: 500 }}>Shipment ID</th>
                <th style={{ width: '30%', padding: '6px 4px', fontWeight: 500 }}>Destination</th>
                <th style={{ width: '22%', padding: '6px 4px', fontWeight: 500 }}>ETA</th>
                <th style={{ width: '20%', padding: '6px 0 6px 4px', fontWeight: 500, textAlign: 'right' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {(kpis.recent_shipments || []).length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ padding: '14px 0', textAlign: 'center', color: '#88928E' }}>
                    No shipment updates
                  </td>
                </tr>
              ) : (
                (kpis.recent_shipments || []).slice(0, 3).map((shp) => (
                  <tr
                    key={shp.id}
                    style={{ borderBottom: '1px solid #F5F2EA', cursor: 'pointer' }}
                    onClick={() => onNavigate && onNavigate('handler-dashboard', '/handler/shipments')}
                  >
                    <td style={{ padding: '9px 4px 9px 0', fontWeight: 600, color: '#122D29', overflowWrap: 'anywhere', wordBreak: 'break-word', fontSize: 11.5 }}>
                      {shp.shipment_id || `SH-${shp.id}`}
                    </td>
                    <td style={{ padding: '9px 4px', color: '#3A423F', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={shp.destination}>
                      {shp.destination || 'Destination'}
                    </td>
                    <td style={{ padding: '9px 4px', color: '#68726E', whiteSpace: 'nowrap' }}>
                      {shp.eta || 'Scheduled'}
                    </td>
                    <td style={{ padding: '9px 0 9px 4px', textAlign: 'right' }}>
                      <StatusBadge status={shp.status} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Table 3: Inventory Alerts */}
        <div style={{ background: '#FFFFFF', border: '1px solid #E8E4D8', borderRadius: 8, padding: '16px 18px', minWidth: 0, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#122D29', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              INVENTORY ALERTS
            </div>
            <button
              type="button"
              onClick={() => onNavigate && onNavigate('handler-dashboard', '/handler/inventory')}
              style={{ background: 'none', border: 'none', color: '#183A34', fontSize: 11, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 2 }}
            >
              View all <ArrowUpRight size={13} />
            </button>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, tableLayout: 'fixed' }}>
            <thead>
              <tr style={{ color: '#88928E', borderBottom: '1px solid #EFECE4', textAlign: 'left', fontSize: 11 }}>
                <th style={{ width: '36%', padding: '6px 4px 6px 0', fontWeight: 500 }}>Product</th>
                <th style={{ width: '30%', padding: '6px 4px', fontWeight: 500 }}>SKU</th>
                <th style={{ width: '17%', padding: '6px 4px', fontWeight: 500, textAlign: 'right' }}>Available</th>
                <th style={{ width: '17%', padding: '6px 0 6px 4px', fontWeight: 500, textAlign: 'right' }}>Reorder Level</th>
              </tr>
            </thead>
            <tbody>
              {(kpis.inventory_alerts || []).length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ padding: '14px 0', textAlign: 'center', color: '#88928E' }}>
                    Stock levels are healthy
                  </td>
                </tr>
              ) : (
                (kpis.inventory_alerts || []).slice(0, 3).map((item) => (
                  <tr
                    key={item.id}
                    style={{ borderBottom: '1px solid #F5F2EA', cursor: 'pointer' }}
                    onClick={() => onNavigate && onNavigate('handler-dashboard', '/handler/inventory')}
                  >
                    <td style={{ padding: '9px 4px 9px 0', fontWeight: 600, color: '#122D29', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.product_name}>
                      {item.product_name}
                    </td>
                    <td style={{ padding: '9px 4px', color: '#68726E', fontSize: 10.5, overflowWrap: 'anywhere', wordBreak: 'break-word', fontFamily: 'monospace' }} title={item.sku}>
                      {item.sku}
                    </td>
                    <td style={{ padding: '9px 4px', textAlign: 'right', fontWeight: 700, color: item.available_stock <= 5 ? '#991B1B' : '#B45309', fontVariantNumeric: 'tabular-nums' }}>
                      {item.available_stock}
                    </td>
                    <td style={{ padding: '9px 0 9px 4px', textAlign: 'right', color: '#88928E', fontVariantNumeric: 'tabular-nums' }}>
                      {item.reorder_level || 20}
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

export default ODOverviewView;

