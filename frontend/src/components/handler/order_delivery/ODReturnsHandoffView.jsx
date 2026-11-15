import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Search,
  RefreshCw,
  X,
  RotateCcw,
  Package,
  MapPin,
  Clock,
  CheckCircle2,
  AlertCircle,
  ChevronRight,
  ShieldAlert,
} from 'lucide-react';
import { handlerService } from '../../../services/handlerService';
import { HandlerPagination } from '../HandlerPagination';

function StatusBadge({ status }) {
  const config = {
    pending: { bg: '#FEF3C7', color: '#B45309', label: 'Pending' },
    accepted: { bg: '#E0F2FE', color: '#0369A1', label: 'Accepted' },
    in_progress: { bg: '#DBEAFE', color: '#1D4ED8', label: 'In Progress' },
    completed: { bg: '#DCFCE7', color: '#15803D', label: 'Completed' },
    failed: { bg: '#FEE2E2', color: '#991B1B', label: 'Failed' },
    cancelled: { bg: '#F5F5F4', color: '#78716C', label: 'Cancelled' },
  }[String(status || '').toLowerCase()] || { bg: '#F5F5F4', color: '#78716C', label: status || 'Unknown' };

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '3px 8px',
        borderRadius: 4,
        fontSize: 11,
        fontWeight: 600,
        backgroundColor: config.bg,
        color: config.color,
      }}
    >
      {config.label}
    </span>
  );
}

export function ODReturnsHandoffView({ onNavigate }) {
  const [handoffs, setHandoffs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState('pickup'); // 'pickup' | 'replacement'
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  // Pagination
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [selectedHandoff, setSelectedHandoff] = useState(null);
  const [handoffDetails, setHandoffDetails] = useState(null);
  const [milestoneInput, setMilestoneInput] = useState('');
  const [milestoneNote, setMilestoneNote] = useState('');
  const [savingMilestone, setSavingMilestone] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [actionError, setActionError] = useState('');
  const [actionSuccess, setActionSuccess] = useState('');

  const loadHandoffs = useCallback(async () => {
    try {
      setRefreshing(true);
      const res = await handlerService.getOrderDeliveryReturnHandoffs({ limit: 100 });
      setHandoffs(res.items || []);
    } catch (err) {
      console.error('Failed to load O&D return handoffs:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadHandoffs();
  }, [loadHandoffs]);

  const filteredHandoffs = useMemo(() => {
    return handoffs.filter((h) => {
      const type = (h.handoff_type || '').toLowerCase();
      if (activeTab === 'pickup' && !type.includes('pickup') && type.includes('replacement')) {
        return false;
      }
      if (activeTab === 'replacement' && !type.includes('replacement')) {
        return false;
      }
      const st = String(h.status || h.handoff_status || '').toLowerCase();
      if (statusFilter !== 'all' && st !== statusFilter) return false;
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const matchesId = String(h.id || h.handoff_id).includes(q);
        const matchesReq = String(h.return_request_id || h.claim_id || '').includes(q);
        const matchesOrder = (h.order_number || '').toLowerCase().includes(q);
        const matchesCustomer = (h.customer_name || '').toLowerCase().includes(q);
        if (!matchesId && !matchesReq && !matchesOrder && !matchesCustomer) return false;
      }
      return true;
    });
  }, [handoffs, activeTab, statusFilter, searchTerm]);

  const paginatedHandoffs = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredHandoffs.slice(start, start + pageSize);
  }, [filteredHandoffs, page, pageSize]);

  const handleOpenDetail = async (handoff) => {
    setSelectedHandoff(handoff);
    setActionError('');
    setActionSuccess('');
    setMilestoneNote('');
    try {
      const det = await handlerService.getOrderDeliveryReturnHandoffDetails(handoff.id || handoff.handoff_id);
      setHandoffDetails(det);
      setMilestoneInput(det.next_milestone_options?.[0] || '');
    } catch (err) {
      setActionError('Could not load detailed handoff milestones.');
    }
  };

  const handleCloseDetail = () => {
    setSelectedHandoff(null);
    setHandoffDetails(null);
  };

  const handleTransitionStatus = async (nextStatus, defaultNote) => {
    if (!selectedHandoff || updatingStatus) return;
    setUpdatingStatus(true);
    setActionError('');
    setActionSuccess('');
    try {
      const handoffId = selectedHandoff.id || selectedHandoff.handoff_id;
      await handlerService.updateHandoffStatus(handoffId, nextStatus, defaultNote);
      setActionSuccess(`Handoff status transitioned to ${nextStatus.replace(/_/g, ' ')}.`);
      await loadHandoffs();
      const det = await handlerService.getOrderDeliveryReturnHandoffDetails(handoffId);
      setHandoffDetails(det);
      setSelectedHandoff((prev) => ({ ...prev, status: nextStatus, handoff_status: nextStatus }));
      setMilestoneInput(det.next_milestone_options?.[0] || '');
    } catch (err) {
      setActionError(err.message || 'Status transition failed.');
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleRecordMilestone = async () => {
    if (!selectedHandoff || !milestoneInput || savingMilestone) return;
    setSavingMilestone(true);
    setActionError('');
    setActionSuccess('');
    try {
      const handoffId = selectedHandoff.id || selectedHandoff.handoff_id;
      await handlerService.recordOrderDeliveryMilestone(
        handoffId,
        milestoneInput,
        milestoneNote.trim() || 'Milestone recorded by handler'
      );
      setActionSuccess(`Recorded milestone: ${milestoneInput.replace(/_/g, ' ')}`);
      await loadHandoffs();
      const det = await handlerService.getOrderDeliveryReturnHandoffDetails(handoffId);
      setHandoffDetails(det);
      setMilestoneInput(det.next_milestone_options?.[0] || '');
      setMilestoneNote('');
    } catch (err) {
      setActionError(err.message || 'Milestone transition failed.');
    } finally {
      setSavingMilestone(false);
    }
  };

  const currentHandoffStatus = String(
    handoffDetails?.status || selectedHandoff?.status || selectedHandoff?.handoff_status || 'pending'
  ).toLowerCase();

  return (
    <div style={{ padding: '0 4px 30px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: '#122D29', margin: 0, letterSpacing: '-0.02em' }}>
            Returns &amp; Replacement Handoffs
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#68726E' }}>
            Complete assigned reverse pickups, collections, and replacement fulfilment milestones.
          </p>
        </div>
        <button
          type="button"
          onClick={loadHandoffs}
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
          onClick={() => { setActiveTab('pickup'); setPage(1); }}
          style={{
            border: 'none',
            borderBottom: activeTab === 'pickup' ? '2px solid #183A34' : '2px solid transparent',
            background: 'none',
            color: activeTab === 'pickup' ? '#183A34' : '#68726E',
            fontWeight: activeTab === 'pickup' ? 700 : 500,
            fontSize: 13,
            padding: '10px 18px',
            cursor: 'pointer',
          }}
        >
          Pickup &amp; Collection
        </button>
        <button
          type="button"
          onClick={() => { setActiveTab('replacement'); setPage(1); }}
          style={{
            border: 'none',
            borderBottom: activeTab === 'replacement' ? '2px solid #183A34' : '2px solid transparent',
            background: 'none',
            color: activeTab === 'replacement' ? '#183A34' : '#68726E',
            fontWeight: activeTab === 'replacement' ? 700 : 500,
            fontSize: 13,
            padding: '10px 18px',
            cursor: 'pointer',
          }}
        >
          Replacement Fulfilment
        </button>
      </div>

      {/* Toolbar Filter Card */}
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
          flexWrap: 'wrap',
        }}
      >
        <div style={{ position: 'relative', flex: '1 1 240px', minWidth: 200 }}>
          <Search size={14} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: '#88928E' }} />
          <input
            type="text"
            placeholder="Search handoff #, return req #, order #..."
            value={searchTerm}
            onChange={(e) => { setSearchTerm(e.target.value); setPage(1); }}
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

        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          style={{
            padding: '6px 10px',
            border: '1px solid #E8E4D8',
            borderRadius: 6,
            fontSize: 12,
            background: '#FFFFFF',
            color: '#122D29',
          }}
        >
          <option value="all">All Handoff Statuses</option>
          <option value="pending">Pending</option>
          <option value="accepted">Accepted</option>
          <option value="in_progress">In Progress</option>
          <option value="completed">Completed</option>
        </select>
      </div>

      {/* Main Table Card */}
      <div style={{ background: '#FFFFFF', border: '1px solid #E8E4D8', borderRadius: 8, overflow: 'hidden' }}>
        {loading && handoffs.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#68726E', fontSize: 13 }}>
            Loading handoffs...
          </div>
        ) : filteredHandoffs.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#68726E' }}>
            <p style={{ margin: 0, fontWeight: 600, fontSize: 14 }}>No reverse handoffs found</p>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: '#88928E' }}>
              No {activeTab === 'pickup' ? 'pickups' : 'replacements'} are currently assigned.
            </p>
          </div>
        ) : (
          <>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, textAlign: 'left' }}>
                <thead>
                  <tr style={{ background: '#FAF7F2', borderBottom: '1px solid #E8E4D8', color: '#5A6460', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    <th style={{ padding: '10px 16px', fontWeight: 600 }}>Handoff ID</th>
                    <th style={{ padding: '10px 16px', fontWeight: 600 }}>Return Req #</th>
                    <th style={{ padding: '10px 16px', fontWeight: 600 }}>Order Number</th>
                    <th style={{ padding: '10px 16px', fontWeight: 600 }}>Customer</th>
                    <th style={{ padding: '10px 16px', fontWeight: 600 }}>Item</th>
                    <th style={{ padding: '10px 16px', fontWeight: 600 }}>Type</th>
                    <th style={{ padding: '10px 16px', fontWeight: 600 }}>Status</th>
                    <th style={{ padding: '10px 16px', fontWeight: 600, textAlign: 'right' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedHandoffs.map((h) => (
                    <tr
                      key={h.id || h.handoff_id}
                      style={{ borderBottom: '1px solid #F0ECE1' }}
                      onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#FAF7F2'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                    >
                      <td style={{ padding: '12px 16px', fontWeight: 700, color: '#122D29' }}>
                        HND-{h.id || h.handoff_id}
                      </td>
                      <td style={{ padding: '12px 16px', color: '#183A34', fontWeight: 600 }}>
                        TRN-{h.return_request_id || h.claim_id}
                      </td>
                      <td style={{ padding: '12px 16px', color: '#3A423F' }}>
                        {h.order_number || '—'}
                      </td>
                      <td style={{ padding: '12px 16px', color: '#2B322F', fontWeight: 500 }}>
                        {h.customer_name || 'Customer'}
                      </td>
                      <td style={{ padding: '12px 16px', color: '#5A6460' }}>
                        {h.item_name || h.product_name || 'Item'}
                      </td>
                      <td style={{ padding: '12px 16px', textTransform: 'capitalize' }}>
                        {(h.handoff_type || '').replace(/_/g, ' ')}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <StatusBadge status={h.status || h.handoff_status} />
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                        <button
                          type="button"
                          onClick={() => handleOpenDetail(h)}
                          style={{
                            background: '#FFFFFF',
                            border: '1px solid #E8E4D8',
                            borderRadius: 5,
                            padding: '4px 10px',
                            fontSize: 11,
                            fontWeight: 600,
                            color: '#183A34',
                            cursor: 'pointer',
                          }}
                        >
                          Manage
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Standardized Shared Pagination */}
            <HandlerPagination
              currentPage={page}
              pageSize={pageSize}
              totalItems={filteredHandoffs.length}
              onPageChange={(p) => setPage(p)}
              onPageSizeChange={(sz) => {
                setPageSize(sz);
                setPage(1);
              }}
              pageSizeOptions={[5, 10, 20, 50]}
            />
          </>
        )}
      </div>

      {/* Right Drawer */}
      {selectedHandoff && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            right: 0,
            bottom: 0,
            width: 480,
            maxWidth: '100vw',
            backgroundColor: '#FFFFFF',
            boxShadow: '-4px 0 24px rgba(18, 45, 41, 0.15)',
            zIndex: 100,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* Drawer Header */}
          <div style={{ padding: '18px 22px', borderBottom: '1px solid #E8E4D8', display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#FAF7F2' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <h2 style={{ fontSize: 17, fontWeight: 800, color: '#122D29', margin: 0 }}>
                  Handoff #{selectedHandoff.id || selectedHandoff.handoff_id}
                </h2>
                <StatusBadge status={currentHandoffStatus} />
              </div>
              <span style={{ fontSize: 11.5, color: '#68726E' }}>
                {(selectedHandoff.handoff_type || '').replace(/_/g, ' ').toUpperCase()}
              </span>
            </div>
            <button
              type="button"
              onClick={handleCloseDetail}
              style={{ background: 'none', border: 'none', color: '#68726E', cursor: 'pointer', padding: 4 }}
            >
              <X size={18} />
            </button>
          </div>

          {/* Drawer Content */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '20px 22px' }}>
            {actionSuccess && (
              <div style={{ backgroundColor: '#DCFCE7', color: '#15803D', padding: '9px 12px', borderRadius: 6, fontSize: 12, marginBottom: 14 }}>
                {actionSuccess}
              </div>
            )}
            {actionError && (
              <div style={{ backgroundColor: '#FEE2E2', color: '#991B1B', padding: '9px 12px', borderRadius: 6, fontSize: 12, marginBottom: 14 }}>
                {actionError}
              </div>
            )}

            {/* Department Boundary Banner */}
            <div style={{ background: '#F5F2EA', border: '1px solid #E5DFC8', borderRadius: 6, padding: '10px 12px', fontSize: 11.5, color: '#4A524E', marginBottom: 16 }}>
              <strong>Operational Ownership:</strong> Physical collection and replacement delivery milestones are owned by Order &amp; Delivery. Claim approval is owned by Returns &amp; Replacement; Refund execution is owned by Payments &amp; Refunds.
            </div>

            {/* Linked Return Claim Context (Read-Only) */}
            <div style={{ marginBottom: 16, borderBottom: '1px solid #F0ECE1', paddingBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#88928E', textTransform: 'uppercase', marginBottom: 6 }}>
                Linked Return Request
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#122D29' }}>
                TRN-{selectedHandoff.return_request_id || selectedHandoff.claim_id} · Order {selectedHandoff.order_number}
              </div>
              <div style={{ fontSize: 12, color: '#5A6460', marginTop: 4 }}>
                Customer: <strong>{selectedHandoff.customer_name || 'Customer'}</strong>
              </div>
              {selectedHandoff.item_name && (
                <div style={{ fontSize: 12, color: '#5A6460', marginTop: 2 }}>
                  Item: <strong>{selectedHandoff.item_name}</strong>
                </div>
              )}
            </div>

            {/* Workflow Stage Transitions */}
            {currentHandoffStatus === 'pending' && (
              <div style={{ background: '#FEF3C7', border: '1px solid #FCD34D', borderRadius: 8, padding: 14, marginBottom: 18 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#92400E', marginBottom: 4 }}>
                  Action Required: Accept Handoff
                </div>
                <p style={{ margin: '0 0 10px', fontSize: 12, color: '#B45309' }}>
                  This reverse handoff has been assigned by Returns &amp; Replacement and is awaiting your acceptance before logistics work can begin.
                </p>
                <button
                  type="button"
                  disabled={updatingStatus}
                  onClick={() => handleTransitionStatus('accepted', 'Handoff accepted by Order & Delivery')}
                  style={{
                    background: '#183A34',
                    color: '#FFFFFF',
                    border: 'none',
                    borderRadius: 6,
                    padding: '8px 14px',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: updatingStatus ? 'not-allowed' : 'pointer',
                  }}
                >
                  {updatingStatus ? 'Updating…' : 'Accept Handoff'}
                </button>
              </div>
            )}

            {currentHandoffStatus === 'accepted' && (
              <div style={{ background: '#E0F2FE', border: '1px solid #BAE6FD', borderRadius: 8, padding: 14, marginBottom: 18 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#0369A1', marginBottom: 4 }}>
                  Ready to Start Reverse Logistics
                </div>
                <p style={{ margin: '0 0 10px', fontSize: 12, color: '#0284C7' }}>
                  Handoff accepted. Advance to In Progress to start recording required physical collection and fulfilment milestones.
                </p>
                <button
                  type="button"
                  disabled={updatingStatus}
                  onClick={() => handleTransitionStatus('in_progress', 'Started logistics processing')}
                  style={{
                    background: '#183A34',
                    color: '#FFFFFF',
                    border: 'none',
                    borderRadius: 6,
                    padding: '8px 14px',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: updatingStatus ? 'not-allowed' : 'pointer',
                  }}
                >
                  {updatingStatus ? 'Updating…' : 'Start Fulfilment (In Progress)'}
                </button>
              </div>
            )}

            {currentHandoffStatus === 'completed' && (
              <div style={{ background: '#DCFCE7', border: '1px solid #BBF7D0', borderRadius: 8, padding: 14, marginBottom: 18, display: 'flex', alignItems: 'center', gap: 10 }}>
                <CheckCircle2 size={18} color="#15803D" />
                <span style={{ fontSize: 12.5, fontWeight: 600, color: '#15803D' }}>
                  All Order &amp; Delivery milestones for this handoff are completed.
                </span>
              </div>
            )}

            {/* Milestone Actions (Active when in_progress) */}
            {currentHandoffStatus === 'in_progress' && (
              <div style={{ background: '#FAF7F2', border: '1px solid #E8E4D8', borderRadius: 8, padding: 16, marginBottom: 18 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#122D29', marginBottom: 8 }}>
                  Record Logistics Milestone
                </div>

                {handoffDetails?.next_milestone_options?.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div>
                      <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#5A6460', marginBottom: 4 }}>
                        Next Required Milestone:
                      </label>
                      <select
                        value={milestoneInput}
                        onChange={(e) => setMilestoneInput(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '8px 10px',
                          border: '1px solid #D6CEB5',
                          borderRadius: 6,
                          fontSize: 12.5,
                          backgroundColor: '#FFFFFF',
                        }}
                      >
                        {handoffDetails.next_milestone_options.map((m) => (
                          <option key={m} value={m}>{m.replace(/_/g, ' ').toUpperCase()}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#5A6460', marginBottom: 4 }}>
                        Milestone Note (Required):
                      </label>
                      <textarea
                        rows={2}
                        value={milestoneNote}
                        onChange={(e) => setMilestoneNote(e.target.value)}
                        placeholder="e.g. Package collected from customer address"
                        style={{
                          width: '100%',
                          padding: '7px 10px',
                          border: '1px solid #D6CEB5',
                          borderRadius: 6,
                          fontSize: 12,
                          backgroundColor: '#FFFFFF',
                        }}
                      />
                    </div>

                    <button
                      type="button"
                      onClick={handleRecordMilestone}
                      disabled={savingMilestone || !milestoneNote.trim()}
                      style={{
                        background: '#183A34',
                        color: '#FFFFFF',
                        border: 'none',
                        borderRadius: 6,
                        padding: '9px 16px',
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: savingMilestone || !milestoneNote.trim() ? 'not-allowed' : 'pointer',
                        opacity: !milestoneNote.trim() ? 0.6 : 1,
                      }}
                    >
                      {savingMilestone ? 'Recording...' : `Record: ${milestoneInput.replace(/_/g, ' ')}`}
                    </button>
                  </div>
                ) : (
                  <p style={{ margin: 0, fontSize: 12, color: '#88928E' }}>
                    All Order &amp; Delivery milestones for this handoff are complete.
                  </p>
                )}
              </div>
            )}

            {/* Milestones timeline */}
            {handoffDetails?.milestones && handoffDetails.milestones.length > 0 && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#88928E', textTransform: 'uppercase', marginBottom: 10 }}>
                  Recorded Milestones ({handoffDetails.milestones.length})
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {handoffDetails.milestones.map((m, idx) => (
                    <div
                      key={idx}
                      style={{
                        padding: '8px 10px',
                        background: '#FAF7F2',
                        border: '1px solid #EFECE4',
                        borderRadius: 6,
                        fontSize: 11.5,
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', color: '#122D29', fontWeight: 600, marginBottom: 2 }}>
                        <span>{m.milestone ? m.milestone.replace(/_/g, ' ').toUpperCase() : 'Milestone'}</span>
                        <span style={{ fontSize: 10.5, color: '#88928E' }}>
                          {m.created_at ? new Date(m.created_at).toLocaleString('en-IN') : '—'}
                        </span>
                      </div>
                      {m.note && <div style={{ color: '#5A6460' }}>{m.note}</div>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default ODReturnsHandoffView;

