import React, { useState, useMemo } from 'react';
import {
  Layers,
  Network,
  ArrowLeftRight,
  CheckCircle2,
  Search,
  RotateCcw,
  MoreHorizontal,
  ExternalLink,
} from 'lucide-react';
import { HandlerKPICard } from './HandlerKPICard';
import { HandlerStatusBadge } from './HandlerStatusBadge';
import { HandlerPagination } from './HandlerPagination';

export function HandlerTrackingView({
  handoffs = [],
  kpiCounts,
  loading = false,
  onNavigate,
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDept, setSelectedDept] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [selectedTimeframe, setSelectedTimeframe] = useState('30days');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);
  const [activeMenuId, setActiveMenuId] = useState(null);

  // Real KPI calculations from genuine data
  const totalTracked = kpiCounts?.total_tracked ?? handoffs.length;
  const withOtherDepts = kpiCounts?.with_other_depts ?? handoffs.filter(
    (h) => (h.current_owner || '').toLowerCase() !== 'returns & replacement' && (h.current_owner || '').toLowerCase() !== 'returns'
  ).length;
  const awaitingHandoff = kpiCounts?.awaiting_handoff ?? handoffs.filter(
    (h) => ['pending', 'awaiting'].includes((h.status || '').toLowerCase())
  ).length;
  const completedCount = kpiCounts?.completed ?? handoffs.filter(
    (h) => ['completed', 'resolved', 'closed'].includes((h.status || '').toLowerCase())
  ).length;

  const handleResetFilters = () => {
    setSearchTerm('');
    setSelectedDept('all');
    setSelectedStatus('all');
    setSelectedTimeframe('30days');
    setCurrentPage(1);
  };

  const handleRowClick = (handoffId) => {
    if (onNavigate) {
      onNavigate('handler-dashboard', `/handler/tracking/${handoffId}`);
    }
  };

  const filtered = useMemo(() => {
    return handoffs.filter((item) => {
      const ownerStr = (item.current_owner || '').toLowerCase();
      const statusStr = (item.status || '').toLowerCase();

      if (selectedDept !== 'all') {
        if (!ownerStr.includes(selectedDept.toLowerCase())) return false;
      }

      if (selectedStatus !== 'all') {
        if (!statusStr.includes(selectedStatus.toLowerCase())) return false;
      }

      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const idStr = String(item.id || item.handoff_id || '');
        const reqStr = String(item.request_id || '');
        const orderStr = String(item.order_number || item.order_id || '');
        const custStr = String(item.customer_name || '');
        const owner = String(item.current_owner || '');
        return (
          idStr.toLowerCase().includes(q) ||
          reqStr.toLowerCase().includes(q) ||
          orderStr.toLowerCase().includes(q) ||
          custStr.toLowerCase().includes(q) ||
          owner.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [handoffs, selectedDept, selectedStatus, searchTerm]);

  const displayed = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <div className="hd-page hd-tracking-page">
      {/* Page Header */}
      <div className="hd-page-header">
        <h2 className="hd-page-title">Tracking & Handoffs</h2>
        <span className="hd-page-subtitle">
          Track request progress and handoffs to other departments.
        </span>
      </div>

      {/* 4 KPI Cards */}
      <div className="hd-kpi-row-4">
        <HandlerKPICard
          title="Total Tracked"
          value={totalTracked}
          icon={Layers}
        />
        <HandlerKPICard
          title="With Other Departments"
          value={withOtherDepts}
          icon={Network}
        />
        <HandlerKPICard
          title="Awaiting Handoff"
          value={awaitingHandoff}
          icon={ArrowLeftRight}
        />
        <HandlerKPICard
          title="Completed"
          value={completedCount}
          icon={CheckCircle2}
        />
      </div>

      {/* Toolbar */}
      <div className="hd-toolbar-row hd-toolbar-full">
        <div className="hd-search-box hd-search-expanded">
          <Search size={16} className="hd-search-icon" />
          <input
            type="text"
            placeholder="Search by request ID, order ID, or customer..."
            value={searchTerm}
            onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
            className="hd-search-input"
          />
        </div>

        <div className="hd-filters-cluster">
          <select
            className="hd-select"
            value={selectedDept}
            onChange={(e) => { setSelectedDept(e.target.value); setCurrentPage(1); }}
          >
            <option value="all">All Departments</option>
            <option value="order">Order & Delivery</option>
            <option value="payment">Payments</option>
            <option value="returns">Returns & Replacement</option>
          </select>

          <select
            className="hd-select"
            value={selectedStatus}
            onChange={(e) => { setSelectedStatus(e.target.value); setCurrentPage(1); }}
          >
            <option value="all">All Statuses</option>
            <option value="progress">In Progress</option>
            <option value="pending">Pending</option>
            <option value="completed">Completed</option>
          </select>

          <select
            className="hd-select"
            value={selectedTimeframe}
            onChange={(e) => { setSelectedTimeframe(e.target.value); setCurrentPage(1); }}
          >
            <option value="30days">Last 30 Days</option>
            <option value="7days">Last 7 Days</option>
            <option value="90days">Last 90 Days</option>
          </select>

          <button
            type="button"
            className="hd-icon-btn hd-filter-reset-btn"
            title="Reset all filters"
            onClick={handleResetFilters}
          >
            <RotateCcw size={16} strokeWidth={2} />
          </button>
        </div>
      </div>

      {/* Tracking Table */}
      <div className="hd-card hd-table-card">
        <div className="hd-table-wrapper">
          <table className="hd-table">
            <thead>
              <tr>
                <th style={{ width: '120px' }}>REQUEST ID</th>
                <th style={{ width: '150px' }}>ORDER ID</th>
                <th style={{ width: '130px' }}>CUSTOMER</th>
                <th>CURRENT OWNER</th>
                <th>HANDOFF FROM</th>
                <th style={{ width: '130px' }}>STATUS</th>
                <th style={{ width: '170px' }}>LAST UPDATED</th>
                <th style={{ width: '80px', textAlign: 'right' }}>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="8" className="hd-table-empty">
                    Loading tracking and handoffs...
                  </td>
                </tr>
              ) : displayed.length === 0 ? (
                <tr>
                  <td colSpan="8" className="hd-table-empty">
                    No tracking or handoff records found matching the current criteria.
                  </td>
                </tr>
              ) : (
                displayed.map((h) => {
                  const rawId = h.id || h.handoff_id;
                  const reqId = h.request_id
                    ? (String(h.request_id).startsWith('TRN-') ? h.request_id : `TRN-${h.request_id}`)
                    : `TRN-${rawId}`;
                  const orderId = h.order_number || (h.order_id ? `FK-${h.order_id}` : '—');
                  const customer = h.customer_name || 'Customer';
                  const currentOwner = h.current_owner || 'Order & Delivery';
                  const handoffFrom = h.handoff_from || 'Returns & Replacement';
                  const lastUpdated = h.last_updated
                    ? new Date(h.last_updated).toLocaleString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                      })
                    : '—';

                  return (
                    <tr
                      key={rawId}
                      className="hd-table-row-clickable"
                      onClick={() => handleRowClick(rawId)}
                    >
                      <td className="hd-cell-id">{reqId}</td>
                      <td className="hd-cell-subtle">{orderId}</td>
                      <td className="hd-cell-bold">{customer}</td>
                      <td className="hd-cell-bold">{currentOwner}</td>
                      <td className="hd-cell-subtle">{handoffFrom}</td>
                      <td>
                        <HandlerStatusBadge status={h.status || 'Pending'} />
                      </td>
                      <td className="hd-cell-timestamp">{lastUpdated}</td>
                      <td
                        style={{ textAlign: 'right', position: 'relative' }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          className="hd-table-action-btn"
                          title="Actions"
                          onClick={() => setActiveMenuId(activeMenuId === rawId ? null : rawId)}
                        >
                          <MoreHorizontal size={16} />
                        </button>
                        {activeMenuId === rawId && (
                          <div className="hd-action-dropdown">
                            <button
                              type="button"
                              className="hd-action-dropdown-item"
                              onClick={() => {
                                setActiveMenuId(null);
                                handleRowClick(rawId);
                              }}
                            >
                              <ExternalLink size={14} />
                              View & Manage
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <HandlerPagination
          currentPage={currentPage}
          totalItems={filtered.length}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
          onPageSizeChange={(newSize) => {
            setPageSize(newSize);
            setCurrentPage(1);
          }}
        />
      </div>
    </div>
  );
}

export default HandlerTrackingView;
