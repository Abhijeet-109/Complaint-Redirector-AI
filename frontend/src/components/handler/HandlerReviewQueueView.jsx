import React, { useState, useMemo } from 'react';
import {
  Package,
  ClipboardList,
  Info,
  Search,
  Filter,
  RotateCcw,
  ArrowUpDown,
} from 'lucide-react';
import { HandlerKPICard } from './HandlerKPICard';
import { HandlerStatusBadge } from './HandlerStatusBadge';
import { HandlerPagination } from './HandlerPagination';

export function HandlerReviewQueueView({
  claims = [],
  tabCounts,
  loading = false,
  onNavigate,
  onFilterChange,
}) {
  const [activeTab, setActiveTab] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [selectedTimeframe, setSelectedTimeframe] = useState('30days');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);

  // Tab counts from real backend or calculated
  const totalQueue = tabCounts?.all ?? claims.length;
  const pendingQueue = tabCounts?.pending ?? claims.filter(c => ['pending_review', 'requested', 'under_review'].includes(c.workflow_status)).length;
  const infoQueue = tabCounts?.info ?? claims.filter(c => c.workflow_status === 'information_requested').length;
  const inspectionQueue = tabCounts?.inspection ?? claims.filter(c => ['under_inspection', 'inspection'].includes(c.workflow_status)).length;

  const handleResetFilters = () => {
    setSearchTerm('');
    setActiveTab('all');
    setSelectedStatus('all');
    setSelectedTimeframe('30days');
    setCurrentPage(1);
    if (onFilterChange) {
      onFilterChange({ search: '', status: 'all', timeframe: '30days', tab: 'all' });
    }
  };

  // Filter items locally or from backend
  const filteredClaims = useMemo(() => {
    return claims.filter((item) => {
      const statusStr = (item.workflow_status || '').toLowerCase();

      // Tab filter
      if (activeTab === 'pending' && !statusStr.includes('pending') && !statusStr.includes('requested') && !statusStr.includes('review')) {
        return false;
      }
      if (activeTab === 'info' && !statusStr.includes('info')) {
        return false;
      }
      if (activeTab === 'inspection' && !statusStr.includes('inspect')) {
        return false;
      }

      // Dropdown status filter
      if (selectedStatus !== 'all' && !statusStr.includes(selectedStatus.toLowerCase())) {
        return false;
      }

      // Search filter
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const idStr = String(item.id || '');
        const orderStr = String(item.order_number || item.order_id || '');
        const customerStr = String(item.customer_name || '');
        const productStr = String(item.product_name || '');
        return (
          idStr.toLowerCase().includes(q) ||
          orderStr.toLowerCase().includes(q) ||
          customerStr.toLowerCase().includes(q) ||
          productStr.toLowerCase().includes(q)
        );
      }

      return true;
    });
  }, [claims, activeTab, selectedStatus, searchTerm]);

  const displayedClaims = filteredClaims.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <div className="hd-page hd-review-queue-page">
      {/* Page Header */}
      <div className="hd-page-header">
        <h2 className="hd-page-title">Review Queue</h2>
        <span className="hd-page-subtitle">
          Return and replacement requests awaiting your review.
        </span>
      </div>

      {/* KPI Cards */}
      <div className="hd-kpi-row-4">
        <HandlerKPICard
          title="Total in Queue"
          value={totalQueue}
          icon={Package}
        />
        <HandlerKPICard
          title="Pending Review"
          value={pendingQueue}
          icon={ClipboardList}
        />
        <HandlerKPICard
          title="Information Requested"
          value={infoQueue}
          icon={Info}
        />
        <HandlerKPICard
          title="Under Inspection"
          value={inspectionQueue}
          icon={Search}
        />
      </div>

      {/* Filter Tabs Row */}
      <div className="hd-toolbar-row">
        <div className="hd-filter-tabs">
          <button
            type="button"
            className={`hd-filter-tab ${activeTab === 'all' ? 'active' : ''}`}
            onClick={() => { setActiveTab('all'); setCurrentPage(1); }}
          >
            All ({totalQueue})
          </button>
          <button
            type="button"
            className={`hd-filter-tab ${activeTab === 'pending' ? 'active' : ''}`}
            onClick={() => { setActiveTab('pending'); setCurrentPage(1); }}
          >
            Pending Review ({pendingQueue})
          </button>
          <button
            type="button"
            className={`hd-filter-tab ${activeTab === 'info' ? 'active' : ''}`}
            onClick={() => { setActiveTab('info'); setCurrentPage(1); }}
          >
            Info Requested ({infoQueue})
          </button>
          <button
            type="button"
            className={`hd-filter-tab ${activeTab === 'inspection' ? 'active' : ''}`}
            onClick={() => { setActiveTab('inspection'); setCurrentPage(1); }}
          >
            Under Inspection ({inspectionQueue})
          </button>
        </div>
      </div>

      {/* Unified Search & Filter Toolbar */}
      <div className="hd-toolbar-row hd-toolbar-full">
        <div className="hd-search-box hd-search-expanded">
          <Search size={16} className="hd-search-icon" />
          <input
            type="text"
            placeholder="Search by request ID, order ID, customer, or product..."
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
            <option value="pending">Pending Review</option>
            <option value="process">In Process</option>
            <option value="information">Info Requested</option>
            <option value="inspection">Under Inspection</option>
          </select>

          <select
            className="hd-select"
            value={selectedTimeframe}
            onChange={(e) => setSelectedTimeframe(e.target.value)}
          >
            <option value="30days">Last 30 Days</option>
            <option value="7days">Last 7 Days</option>
            <option value="90days">Last 90 Days</option>
            <option value="all">All Time</option>
          </select>

          <button
            type="button"
            className="hd-icon-btn"
            title="Reset and clear all filters"
            onClick={handleResetFilters}
          >
            <RotateCcw size={15} strokeWidth={2} />
          </button>
        </div>
      </div>

      {/* Table Container */}
      <div className="hd-card hd-table-card">
        <div className="hd-table-wrapper">
          <table className="hd-table">
            <thead>
              <tr>
                <th>REQUEST ID</th>
                <th>ORDER ID</th>
                <th>CUSTOMER</th>
                <th>PRODUCT</th>
                <th>TYPE</th>
                <th>STATUS</th>
                <th>
                  <div className="hd-th-sortable">
                    <span>SUBMITTED ON</span>
                    <ArrowUpDown size={13} />
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="hd-table-empty">Loading review queue...</td>
                </tr>
              ) : filteredClaims.length === 0 ? (
                <tr>
                  <td colSpan={7} className="hd-table-empty">
                    No review queue items match your filter criteria.
                  </td>
                </tr>
              ) : (
                displayedClaims.map((claim) => (
                  <tr
                    key={claim.id}
                    className="hd-row-clickable"
                    onClick={() => onNavigate && onNavigate('handler-dashboard', `/handler/requests/${claim.id}`)}
                  >
                    <td className="hd-cell-id">TRN-{claim.id}</td>
                    <td className="hd-cell-subtle">{claim.order_number || '—'}</td>
                    <td className="hd-cell-bold">{claim.customer_name || '—'}</td>
                    <td className="hd-cell-bold">{claim.product_name || '—'}</td>
                    <td className="hd-cell-subtle">
                      {claim.resolution_type === 'replacement' ? 'Replacement' : 'Refund'}
                    </td>
                    <td>
                      <HandlerStatusBadge status={claim.workflow_status} />
                    </td>
                    <td className="hd-cell-subtle hd-cell-nowrap">
                      {claim.requested_at
                        ? new Date(claim.requested_at).toLocaleString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                            hour: 'numeric',
                            minute: '2-digit',
                          })
                        : '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Server / Component Pagination with Rows-Per-Page */}
        <HandlerPagination
          currentPage={currentPage}
          pageSize={pageSize}
          totalItems={filteredClaims.length}
          onPageChange={setCurrentPage}
          onPageSizeChange={(sz) => { setPageSize(sz); setCurrentPage(1); }}
        />
      </div>
    </div>
  );
}

export default HandlerReviewQueueView;
