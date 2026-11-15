import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  History,
  BarChart3,
  Search,
  RefreshCw,
  Clock,
  User,
  CheckCircle2,
  Truck,
  Package,
} from 'lucide-react';
import { handlerService } from '../../../services/handlerService';
import { HandlerPagination } from '../HandlerPagination';

export function ODHistoryReportsView() {
  const [activeTab, setActiveTab] = useState('history'); // 'history' | 'reports'
  const [events, setEvents] = useState([]);
  const [reports, setReports] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // History search
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const loadData = useCallback(async () => {
    try {
      setRefreshing(true);
      const [historyRes, reportsRes] = await Promise.all([
        handlerService.getOrderDeliveryHistoryAudit({ limit: 100 }),
        handlerService.getOrderDeliveryReportsStats('month').catch(() => null),
      ]);
      setEvents(historyRes.items || []);
      setReports(reportsRes);
    } catch (err) {
      console.error('Failed to load history & reports:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filteredEvents = useMemo(() => {
    if (!searchTerm.trim()) return events;
    const q = searchTerm.toLowerCase();
    return events.filter(
      (ev) =>
        (ev.reference_id || '').toLowerCase().includes(q) ||
        (ev.event_type || '').toLowerCase().includes(q) ||
        (ev.new_status || '').toLowerCase().includes(q) ||
        (ev.note || '').toLowerCase().includes(q) ||
        (ev.performed_by || '').toLowerCase().includes(q)
    );
  }, [events, searchTerm]);

  const paginatedEvents = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredEvents.slice(start, start + pageSize);
  }, [filteredEvents, page, pageSize]);

  const totalPages = Math.ceil(filteredEvents.length / pageSize) || 1;

  return (
    <div style={{ padding: '0 4px 30px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: '#122D29', margin: 0, letterSpacing: '-0.02em' }}>
            History &amp; Reports
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#68726E' }}>
            Auditable log of order and shipment events alongside operational throughput reports.
          </p>
        </div>
        <button
          type="button"
          onClick={loadData}
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

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid #E8E4D8', marginBottom: 16 }}>
        <button
          type="button"
          onClick={() => setActiveTab('history')}
          style={{
            border: 'none',
            borderBottom: activeTab === 'history' ? '2px solid #183A34' : '2px solid transparent',
            background: 'none',
            color: activeTab === 'history' ? '#183A34' : '#68726E',
            fontWeight: activeTab === 'history' ? 700 : 500,
            fontSize: 13,
            padding: '10px 18px',
            cursor: 'pointer',
          }}
        >
          History &amp; Audit Log
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('reports')}
          style={{
            border: 'none',
            borderBottom: activeTab === 'reports' ? '2px solid #183A34' : '2px solid transparent',
            background: 'none',
            color: activeTab === 'reports' ? '#183A34' : '#68726E',
            fontWeight: activeTab === 'reports' ? 700 : 500,
            fontSize: 13,
            padding: '10px 18px',
            cursor: 'pointer',
          }}
        >
          Reports &amp; Analytics
        </button>
      </div>

      {activeTab === 'history' ? (
        <>
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
                placeholder="Search by order #, event, note, actor..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setPage(1);
                }}
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

          {/* Timeline Table */}
          <div style={{ background: '#FFFFFF', border: '1px solid #E8E4D8', borderRadius: 8, overflow: 'hidden' }}>
            {loading && events.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: '#68726E', fontSize: 13 }}>
                Loading event audit history...
              </div>
            ) : filteredEvents.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: '#68726E' }}>
                <p style={{ margin: 0, fontWeight: 600, fontSize: 14 }}>No audit events found</p>
                <p style={{ margin: '4px 0 0', fontSize: 12, color: '#88928E' }}>
                  No recorded operations match your query.
                </p>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, textAlign: 'left' }}>
                  <thead>
                    <tr style={{ background: '#FAF7F2', borderBottom: '1px solid #E8E4D8', color: '#5A6460', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      <th style={{ padding: '10px 16px', fontWeight: 600 }}>Timestamp</th>
                      <th style={{ padding: '10px 16px', fontWeight: 600 }}>Reference</th>
                      <th style={{ padding: '10px 16px', fontWeight: 600 }}>Action / Event</th>
                      <th style={{ padding: '10px 16px', fontWeight: 600 }}>Previous State</th>
                      <th style={{ padding: '10px 16px', fontWeight: 600 }}>New State</th>
                      <th style={{ padding: '10px 16px', fontWeight: 600 }}>Actor</th>
                      <th style={{ padding: '10px 16px', fontWeight: 600 }}>Operational Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedEvents.map((ev) => (
                      <tr
                        key={ev.id}
                        style={{ borderBottom: '1px solid #F0ECE1' }}
                        onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#FAF7F2'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                      >
                        <td style={{ padding: '12px 16px', color: '#68726E', whiteSpace: 'nowrap' }}>
                          {ev.timestamp ? new Date(ev.timestamp).toLocaleString('en-IN') : '—'}
                        </td>
                        <td style={{ padding: '12px 16px', fontWeight: 700, color: '#122D29' }}>
                          {ev.reference_id}
                        </td>
                        <td style={{ padding: '12px 16px', color: '#183A34', fontWeight: 600, textTransform: 'capitalize' }}>
                          {(ev.event_type || 'Status Update').replace(/_/g, ' ')}
                        </td>
                        <td style={{ padding: '12px 16px', color: '#88928E' }}>
                          {ev.previous_status ? ev.previous_status.replace(/_/g, ' ') : '—'}
                        </td>
                        <td style={{ padding: '12px 16px', fontWeight: 600, color: '#15803D' }}>
                          {ev.new_status ? ev.new_status.replace(/_/g, ' ') : '—'}
                        </td>
                        <td style={{ padding: '12px 16px', color: '#3A423F' }}>
                          {ev.performed_by || 'System'}
                        </td>
                        <td style={{ padding: '12px 16px', color: '#5A6460', maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {ev.note || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Standardized Shared Pagination */}
            <HandlerPagination
              currentPage={page}
              pageSize={pageSize}
              totalItems={filteredEvents.length}
              onPageChange={(p) => setPage(p)}
              onPageSizeChange={(sz) => {
                setPageSize(sz);
                setPage(1);
              }}
              pageSizeOptions={[10, 25, 50, 100]}
            />
          </div>
        </>
      ) : (
        /* Tab 2: Reports */
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* KPI Summary Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
            <div style={{ background: '#FFFFFF', border: '1px solid #E8E4D8', borderRadius: 8, padding: 18 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#7A8480', textTransform: 'uppercase', marginBottom: 4 }}>
                TOTAL ORDERS
              </div>
              <div style={{ fontSize: 26, fontWeight: 800, color: '#122D29' }}>
                {reports?.total_orders !== undefined ? reports.total_orders : '—'}
              </div>
            </div>
            <div style={{ background: '#FFFFFF', border: '1px solid #E8E4D8', borderRadius: 8, padding: 18 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#7A8480', textTransform: 'uppercase', marginBottom: 4 }}>
                ORDERS DELIVERED
              </div>
              <div style={{ fontSize: 26, fontWeight: 800, color: '#15803D' }}>
                {reports?.delivered_orders !== undefined ? reports.delivered_orders : '—'}
              </div>
            </div>
            <div style={{ background: '#FFFFFF', border: '1px solid #E8E4D8', borderRadius: 8, padding: 18 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#7A8480', textTransform: 'uppercase', marginBottom: 4 }}>
                SHIPMENTS DISPATCHED
              </div>
              <div style={{ fontSize: 26, fontWeight: 800, color: '#0E7490' }}>
                {reports?.shipped_orders !== undefined ? reports.shipped_orders : '—'}
              </div>
            </div>
            <div style={{ background: '#FFFFFF', border: '1px solid #E8E4D8', borderRadius: 8, padding: 18 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#7A8480', textTransform: 'uppercase', marginBottom: 4 }}>
                COMPLETED REVERSE HANDOFFS
              </div>
              <div style={{ fontSize: 26, fontWeight: 800, color: '#6D28D9' }}>
                {reports?.completed_handoffs !== undefined ? reports.completed_handoffs : '—'}
              </div>
            </div>
          </div>

          <div style={{ background: '#FFFFFF', border: '1px solid #E8E4D8', borderRadius: 8, padding: 22 }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: '#122D29', margin: '0 0 10px' }}>
              Operational Performance &amp; Compliance
            </h3>
            <p style={{ margin: 0, fontSize: 13, color: '#68726E', lineHeight: 1.5 }}>
              All metrics and audit entries shown here are directly derived from database transactions (`ShipmentEvent`, `CommerceOrder`, `ReturnHandoff`). Order preparation ends cleanly at <code>ready_to_ship</code>, and delivery completion atomically synchronizes shipment and commerce records.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export default ODHistoryReportsView;

