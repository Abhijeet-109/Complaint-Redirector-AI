import React, { useState, useEffect, useCallback } from 'react';
import {
  History,
  RefreshCw,
  Search,
  X,
  CreditCard,
  RotateCcw,
  CheckCircle2,
  Clock,
  AlertTriangle,
  User,
  Receipt,
  FileText,
} from 'lucide-react';
import { handlerService } from '../../../services/handlerService';
import { HandlerPagination } from '../HandlerPagination';

function formatINR(amount) {
  const num = parseFloat(amount) || 0;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(num);
}

function EventBadge({ eventType }) {
  const config = {
    payment_captured: { bg: '#DCFCE7', color: '#15803D', label: 'Payment Captured' },
    payment_attempt: { bg: '#FAF8F4', color: '#183A34', label: 'Payment Attempt' },
    payment_failed: { bg: '#FEE2E2', color: '#991B1B', label: 'Payment Failed' },
    refund_handoff_created: { bg: '#FEF3C7', color: '#B45309', label: 'Refund Handoff Created' },
    refund_processed: { bg: '#DCFCE7', color: '#15803D', label: 'Refund Completed' },
    refund_status_changed: { bg: '#E0F2FE', color: '#0369A1', label: 'Refund Updated' },
  }[String(eventType || '').toLowerCase()] || { bg: '#F5F5F4', color: '#5A6561', label: eventType || 'Audit Event' };

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

export function PaymentAuditView({ onNavigate }) {
  const [events, setEvents] = useState([]);
  const [totalItems, setTotalItems] = useState(0);
  const [summary, setSummary] = useState({
    total_events: 0,
    payment_events: 0,
    refund_events: 0,
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [eventTypeFilter, setEventTypeFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // Detail Modal / Inspector
  const [selectedEvent, setSelectedEvent] = useState(null);

  const fetchAuditLogs = useCallback(async () => {
    try {
      const params = {
        limit: pageSize,
        offset: (page - 1) * pageSize,
      };
      if (searchTerm.trim()) params.search = searchTerm.trim();
      if (eventTypeFilter !== 'all') params.event_type = eventTypeFilter;

      const res = await handlerService.getPaymentsHistoryAudit(params);
      setEvents(res.items || []);
      setTotalItems(res.total || 0);
      if (res.summary || res.kpis) setSummary(res.summary || res.kpis);
      setError(null);
    } catch (err) {
      console.error('Failed to load payment history and audit:', err);
      setError(err.message || 'Failed to load audit events');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [page, pageSize, searchTerm, eventTypeFilter]);

  useEffect(() => {
    setLoading(true);
    fetchAuditLogs();
  }, [fetchAuditLogs]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchAuditLogs();
  };

  const handleResetFilters = () => {
    setSearchTerm('');
    setEventTypeFilter('all');
    setPage(1);
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
            History & Audit
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#68726E' }}>
            Chronological, immutable audit trail of payment captures, refund transitions, and handler actions.
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

      {/* Summary KPI Strip */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 12,
          marginBottom: 18,
        }}
      >
        {[
          { label: 'Total Audit Events', value: summary.total_events, icon: History, color: '#183A34', bg: '#F4EFE6' },
          { label: 'Payment Attempt Events', value: summary.payment_events, icon: CreditCard, color: '#15803D', bg: '#DCFCE7' },
          { label: 'Refund Handoff Events', value: summary.refund_events, icon: RotateCcw, color: '#0369A1', bg: '#E0F2FE' },
        ].map((kpi, idx) => {
          const Icon = kpi.icon;
          return (
            <div
              key={idx}
              style={{
                background: '#FFFFFF',
                border: '1px solid #ECE7DC',
                borderRadius: 8,
                padding: '12px 16px',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
              }}
            >
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 6,
                  backgroundColor: kpi.bg,
                  color: kpi.color,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <Icon size={18} />
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#78827E', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  {kpi.label}
                </div>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#122D29', marginTop: 2 }}>
                  {kpi.value.toLocaleString()}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Toolbar */}
      <div
        style={{
          background: '#FFFFFF',
          border: '1px solid #ECE7DC',
          borderRadius: 8,
          padding: '12px 16px',
          marginBottom: 16,
          display: 'flex',
          flexWrap: 'wrap',
          gap: 12,
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', flex: 1 }}>
          {/* Search */}
          <div
            style={{
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
              minWidth: 260,
              maxWidth: 380,
              flex: 1,
            }}
          >
            <Search size={14} style={{ position: 'absolute', left: 10, color: '#8E9894' }} />
            <input
              type="text"
              placeholder="Search by ID, Order #, Provider Ref, Actor..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setPage(1);
              }}
              style={{
                width: '100%',
                padding: '7px 10px 7px 32px',
                fontSize: 12,
                borderRadius: 6,
                border: '1px solid #E8E4D8',
                backgroundColor: '#FAF8F4',
                color: '#122D29',
                outline: 'none',
              }}
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => {
                  setSearchTerm('');
                  setPage(1);
                }}
                style={{
                  position: 'absolute',
                  right: 8,
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  color: '#8E9894',
                  padding: 2,
                }}
              >
                <X size={13} />
              </button>
            )}
          </div>

          {/* Event Type Filter */}
          <select
            value={eventTypeFilter}
            onChange={(e) => {
              setEventTypeFilter(e.target.value);
              setPage(1);
            }}
            style={{
              padding: '7px 10px',
              fontSize: 12,
              borderRadius: 6,
              border: '1px solid #E8E4D8',
              backgroundColor: '#FAF8F4',
              color: '#122D29',
              cursor: 'pointer',
            }}
          >
            <option value="all">All Event Types</option>
            <option value="payment_captured">Payment Captured</option>
            <option value="payment_attempt">Payment Attempt</option>
            <option value="payment_failed">Payment Failed</option>
            <option value="refund_processed">Refund Processed</option>
            <option value="refund_handoff_created">Refund Handoff Created</option>
          </select>

          {(searchTerm || eventTypeFilter !== 'all') && (
            <button
              type="button"
              onClick={handleResetFilters}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#8E9894',
                fontSize: 12,
                cursor: 'pointer',
                textDecoration: 'underline',
                padding: '4px 6px',
              }}
            >
              Reset Filters
            </button>
          )}
        </div>

        <div style={{ fontSize: 12, color: '#68726E' }}>
          Total: <strong>{totalItems}</strong> audit records
        </div>
      </div>

      {/* Table Container */}
      <div
        style={{
          background: '#FFFFFF',
          border: '1px solid #ECE7DC',
          borderRadius: 8,
          overflow: 'hidden',
        }}
      >
        <div style={{ overflowX: 'auto' }}>
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              textAlign: 'left',
              fontSize: 12.5,
            }}
          >
            <thead>
              <tr style={{ background: '#F9F8F3', borderBottom: '1px solid #ECE7DC', color: '#68726E' }}>
                <th style={{ padding: '10px 14px', fontWeight: 600 }}>Timestamp</th>
                <th style={{ padding: '10px 14px', fontWeight: 600 }}>Reference / ID</th>
                <th style={{ padding: '10px 14px', fontWeight: 600 }}>Event Type</th>
                <th style={{ padding: '10px 14px', fontWeight: 600 }}>Order #</th>
                <th style={{ padding: '10px 14px', fontWeight: 600 }}>Transition</th>
                <th style={{ padding: '10px 14px', fontWeight: 600 }}>Amount</th>
                <th style={{ padding: '10px 14px', fontWeight: 600 }}>Actor</th>
                <th style={{ padding: '10px 14px', fontWeight: 600 }}>Note / Outcome</th>
                <th style={{ padding: '10px 14px', fontWeight: 600, textAlign: 'right' }}>Inspect</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={9} style={{ padding: '40px 16px', textAlign: 'center', color: '#68726E' }}>
                    <RefreshCw size={18} style={{ animation: 'spin 1s linear infinite', marginBottom: 8 }} />
                    <div>Loading audit logs...</div>
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={9} style={{ padding: '40px 16px', textAlign: 'center', color: '#991B1B' }}>
                    <AlertTriangle size={18} style={{ marginBottom: 8 }} />
                    <div>{error}</div>
                  </td>
                </tr>
              ) : events.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ padding: '50px 16px', textAlign: 'center', color: '#78827E' }}>
                    <History size={28} style={{ marginBottom: 8, color: '#A0AAA6' }} />
                    <div style={{ fontWeight: 600, fontSize: 14, color: '#183A34' }}>No audit events found</div>
                    <div style={{ fontSize: 12, marginTop: 4 }}>
                      {searchTerm || eventTypeFilter !== 'all'
                        ? 'Try modifying your search or filter criteria.'
                        : 'No payment or refund lifecycle events have been recorded yet.'}
                    </div>
                  </td>
                </tr>
              ) : (
                events.map((evt) => (
                  <tr
                    key={evt.id}
                    onClick={() => setSelectedEvent(evt)}
                    style={{
                      borderBottom: '1px solid #F1ECE1',
                      cursor: 'pointer',
                      transition: 'background-color 0.15s ease',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#FCFBF8')}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                  >
                    <td style={{ padding: '10px 14px', color: '#68726E', fontSize: 11.5 }}>
                      {evt.timestamp ? new Date(evt.timestamp).toLocaleString() : '—'}
                    </td>
                    <td style={{ padding: '10px 14px', fontWeight: 600, color: '#183A34', fontFamily: 'monospace' }}>
                      {evt.reference_id || `EVT-${evt.id}`}
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <EventBadge eventType={evt.event_type} />
                    </td>
                    <td style={{ padding: '10px 14px', color: '#122D29' }}>
                      {evt.order_number || (evt.order_id ? `#${evt.order_id}` : '—')}
                    </td>
                    <td style={{ padding: '10px 14px', fontSize: 11.5, color: '#5A6561' }}>
                      {evt.previous_state ? (
                        <span>
                          <span style={{ color: '#8E9894' }}>{evt.previous_state}</span> →{' '}
                          <strong style={{ color: '#183A34' }}>{evt.new_state}</strong>
                        </span>
                      ) : (
                        <strong style={{ color: '#183A34' }}>{evt.new_state || '—'}</strong>
                      )}
                    </td>
                    <td style={{ padding: '10px 14px', fontWeight: 600, color: '#122D29' }}>
                      {evt.amount ? formatINR(evt.amount) : '—'}
                    </td>
                    <td style={{ padding: '10px 14px', color: '#4A5552', fontSize: 11.5 }}>
                      {evt.actor || evt.actor_role || 'System'}
                    </td>
                    <td style={{ padding: '10px 14px', color: '#5A6561', fontSize: 11.5, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {evt.note || '—'}
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedEvent(evt);
                        }}
                        style={{
                          background: '#FAF8F4',
                          border: '1px solid #ECE7DC',
                          borderRadius: 4,
                          padding: '4px 8px',
                          fontSize: 11,
                          fontWeight: 600,
                          color: '#183A34',
                          cursor: 'pointer',
                        }}
                      >
                        Inspect
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <HandlerPagination
          currentPage={page}
          pageSize={pageSize}
          totalItems={totalItems}
          onPageChange={(nextPage) => setPage(nextPage)}
          onPageSizeChange={(nextSize) => {
            setPageSize(nextSize);
            setPage(1);
          }}
          pageSizeOptions={[10, 20, 50, 100]}
        />
      </div>

      {/* Inspect Event Modal */}
      {selectedEvent && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(18, 45, 41, 0.4)',
            zIndex: 100,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
          }}
          onClick={() => setSelectedEvent(null)}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 520,
              backgroundColor: '#FFFFFF',
              borderRadius: 8,
              boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
              overflow: 'hidden',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div
              style={{
                padding: '16px 20px',
                borderBottom: '1px solid #ECE7DC',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: '#FAF8F4',
              }}
            >
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#78827E', textTransform: 'uppercase' }}>
                  Audit Event Record
                </div>
                <div style={{ fontSize: 15, fontWeight: 800, color: '#183A34', fontFamily: 'monospace', marginTop: 2 }}>
                  {selectedEvent.reference_id || `EVT-${selectedEvent.id}`}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedEvent(null)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#68726E',
                  cursor: 'pointer',
                  padding: 4,
                }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 12 }}>
                <div>
                  <div style={{ color: '#78827E', fontSize: 11 }}>Event Type</div>
                  <div style={{ marginTop: 2 }}>
                    <EventBadge eventType={selectedEvent.event_type} />
                  </div>
                </div>
                <div>
                  <div style={{ color: '#78827E', fontSize: 11 }}>Timestamp</div>
                  <div style={{ fontWeight: 600, color: '#122D29', marginTop: 2 }}>
                    {new Date(selectedEvent.timestamp).toLocaleString()}
                  </div>
                </div>
                <div>
                  <div style={{ color: '#78827E', fontSize: 11 }}>Order Reference</div>
                  <div style={{ fontWeight: 600, color: '#183A34', marginTop: 2 }}>
                    {selectedEvent.order_number || (selectedEvent.order_id ? `#${selectedEvent.order_id}` : '—')}
                  </div>
                </div>
                <div>
                  <div style={{ color: '#78827E', fontSize: 11 }}>Amount Involved</div>
                  <div style={{ fontWeight: 700, color: '#122D29', marginTop: 2 }}>
                    {selectedEvent.amount ? formatINR(selectedEvent.amount) : '—'}
                  </div>
                </div>
                <div>
                  <div style={{ color: '#78827E', fontSize: 11 }}>Actor</div>
                  <div style={{ fontWeight: 600, color: '#122D29', marginTop: 2 }}>
                    {selectedEvent.actor || selectedEvent.actor_role || 'System'}
                  </div>
                </div>
                <div>
                  <div style={{ color: '#78827E', fontSize: 11 }}>Gateway Provider</div>
                  <div style={{ fontWeight: 600, color: '#122D29', marginTop: 2 }}>
                    {selectedEvent.provider || 'Gateway'}
                  </div>
                </div>
              </div>

              {selectedEvent.note && (
                <div style={{ background: '#FAF8F4', padding: 12, borderRadius: 6, fontSize: 12 }}>
                  <div style={{ color: '#78827E', fontSize: 11, marginBottom: 2 }}>Audit Note / Response Details</div>
                  <div style={{ color: '#183A34', lineHeight: 1.4 }}>{selectedEvent.note}</div>
                </div>
              )}

              {selectedEvent.metadata && Object.keys(selectedEvent.metadata).length > 0 && (
                <div>
                  <div style={{ color: '#78827E', fontSize: 11, marginBottom: 4 }}>Structured Metadata</div>
                  <pre
                    style={{
                      background: '#F9F8F3',
                      border: '1px solid #ECE7DC',
                      padding: 10,
                      borderRadius: 4,
                      fontSize: 11,
                      fontFamily: 'monospace',
                      overflowX: 'auto',
                      margin: 0,
                    }}
                  >
                    {JSON.stringify(selectedEvent.metadata, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default PaymentAuditView;
