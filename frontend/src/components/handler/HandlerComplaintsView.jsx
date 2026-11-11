import React, { useState, useMemo } from 'react';
import {
  MessageCircle,
  Clock,
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

export function HandlerComplaintsView({
  complaints = [],
  loading = false,
  onNavigate,
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [selectedTimeframe, setSelectedTimeframe] = useState('30days');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);
  const [activeMenuId, setActiveMenuId] = useState(null);

  // Real KPI calculations from genuine data
  const totalComplaints = complaints.length;
  const pendingActionCount = complaints.filter(
    (c) => (c.status || '').toLowerCase() === 'pending'
  ).length;
  const inProgressCount = complaints.filter(
    (c) =>
      ['in progress', 'in_progress', 'followed_up', 'in-process'].includes(
        (c.status || '').toLowerCase()
      )
  ).length;
  const resolvedCount = complaints.filter(
    (c) =>
      ['resolved', 'closed', 'completed'].includes(
        (c.status || '').toLowerCase()
      )
  ).length;

  const handleResetFilters = () => {
    setSearchTerm('');
    setSelectedStatus('all');
    setSelectedTimeframe('30days');
    setCurrentPage(1);
  };

  const handleRowClick = (complaintId) => {
    if (onNavigate) {
      onNavigate('handler-dashboard', `/handler/complaints/${complaintId}`);
    }
  };

  const filtered = useMemo(() => {
    return complaints.filter((item) => {
      const statusStr = (item.status || '').toLowerCase();
      if (selectedStatus !== 'all') {
        if (selectedStatus === 'pending' && statusStr !== 'pending') return false;
        if (
          selectedStatus === 'progress' &&
          !['in progress', 'in_progress', 'followed_up', 'in-process'].includes(statusStr)
        )
          return false;
        if (
          selectedStatus === 'resolved' &&
          !['resolved', 'closed', 'completed'].includes(statusStr)
        )
          return false;
      }

      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const idStr = String(item.id || item.complaint_id || '');
        const reqStr = String(item.request_id || item.claim_id || '');
        const orderStr = String(item.order_number || item.order_id || '');
        const custStr = String(item.user_name || item.customer_name || '');
        const textStr = String(item.subject || item.complaint_text || '');
        return (
          idStr.toLowerCase().includes(q) ||
          reqStr.toLowerCase().includes(q) ||
          orderStr.toLowerCase().includes(q) ||
          custStr.toLowerCase().includes(q) ||
          textStr.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [complaints, selectedStatus, searchTerm]);

  const displayed = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <div className="hd-page hd-complaints-page">
      {/* Page Header */}
      <div className="hd-page-header">
        <h2 className="hd-page-title">Complaints</h2>
        <span className="hd-page-subtitle">
          Customer complaints related to return and replacement requests.
        </span>
      </div>

      {/* 4 KPI Cards */}
      <div className="hd-kpi-row-4">
        <HandlerKPICard
          title="Total Complaints"
          value={totalComplaints}
          icon={MessageCircle}
        />
        <HandlerKPICard
          title="Pending Action"
          value={pendingActionCount}
          icon={Clock}
        />
        <HandlerKPICard
          title="In Progress"
          value={inProgressCount}
          icon={ArrowLeftRight}
        />
        <HandlerKPICard
          title="Resolved"
          value={resolvedCount}
          icon={CheckCircle2}
        />
      </div>

      {/* Search & Filter Toolbar */}
      <div className="hd-toolbar-row hd-toolbar-full">
        <div className="hd-search-box hd-search-expanded">
          <Search size={16} className="hd-search-icon" />
          <input
            type="text"
            placeholder="Search by complaint ID, request ID, order ID, or customer..."
            value={searchTerm}
            onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
            className="hd-search-input"
          />
        </div>

        <div className="hd-filters-cluster">
          <select
            className="hd-select"
            value={selectedStatus}
            onChange={(e) => { setSelectedStatus(e.target.value); setCurrentPage(1); }}
          >
            <option value="all">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="progress">In Progress</option>
            <option value="resolved">Resolved</option>
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

      {/* Complaints Table */}
      <div className="hd-card hd-table-card">
        <div className="hd-table-wrapper">
          <table className="hd-table">
            <thead>
              <tr>
                <th style={{ width: '110px' }}>COMPLAINT ID</th>
                <th style={{ width: '110px' }}>REQUEST ID</th>
                <th style={{ width: '120px' }}>ORDER ID</th>
                <th style={{ width: '120px' }}>CUSTOMER</th>
                <th>SUBJECT</th>
                <th style={{ width: '120px' }}>STATUS</th>
                <th style={{ width: '160px' }}>RAISED ON</th>
                <th style={{ width: '70px', textAlign: 'right' }}>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="8" className="hd-table-empty">
                    Loading complaints...
                  </td>
                </tr>
              ) : displayed.length === 0 ? (
                <tr>
                  <td colSpan="8" className="hd-table-empty">
                    No complaints found matching the current criteria.
                  </td>
                </tr>
              ) : (
                displayed.map((c) => {
                  const cmpId = c.id || c.complaint_id;
                  const displayId = `CMP-${cmpId}`;
                  const reqId = c.request_id || c.claim_id ? `TRN-${c.request_id || c.claim_id}` : '—';
                  const orderId = c.order_number || '—';
                  const customer = c.user_name || c.customer_name || '—';
                  const subject = c.subject || c.complaint_text || 'Customer complaint';
                  const raisedOn = c.create_at
                    ? new Date(c.create_at).toLocaleString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                      })
                    : '—';

                  return (
                    <tr
                      key={cmpId}
                      className="hd-table-row-clickable"
                      onClick={() => handleRowClick(cmpId)}
                    >
                      <td className="hd-cell-id">{displayId}</td>
                      <td className="hd-cell-subtle">{reqId}</td>
                      <td className="hd-cell-subtle">{orderId}</td>
                      <td className="hd-cell-bold">{customer}</td>
                      <td className="hd-cell-subject" title={subject}>
                        {subject}
                      </td>
                      <td>
                        <HandlerStatusBadge status={c.status || 'Pending'} />
                      </td>
                      <td className="hd-cell-timestamp">{raisedOn}</td>
                      <td
                        style={{ textAlign: 'right', position: 'relative' }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          className="hd-table-action-btn"
                          title="Actions"
                          onClick={() => setActiveMenuId(activeMenuId === cmpId ? null : cmpId)}
                        >
                          <MoreHorizontal size={16} />
                        </button>
                        {activeMenuId === cmpId && (
                          <div className="hd-action-dropdown">
                            <button
                              type="button"
                              className="hd-action-dropdown-item"
                              onClick={() => {
                                setActiveMenuId(null);
                                handleRowClick(cmpId);
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

export default HandlerComplaintsView;
