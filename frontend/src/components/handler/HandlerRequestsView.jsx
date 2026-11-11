import React, { useState, useMemo } from 'react';
import {
  Layers,
  Package,
  ArrowLeftRight,
  Clock,
  CheckCircle2,
  Search,
  RotateCcw,
  MoreHorizontal,
  ChevronRight,
  ExternalLink,
} from 'lucide-react';
import { HandlerKPICard } from './HandlerKPICard';
import { HandlerStatusBadge } from './HandlerStatusBadge';
import { HandlerPagination } from './HandlerPagination';

export function HandlerRequestsView({
  allRequests = [],
  stats,
  loading = false,
  onNavigate,
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedType, setSelectedType] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [selectedTimeframe, setSelectedTimeframe] = useState('30days');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);
  const [activeMenuId, setActiveMenuId] = useState(null);

  // Genuine KPI counts
  const totalRequests = stats?.total_requests ?? allRequests.length;
  const returnsCount = stats?.returns_count ?? allRequests.filter(r => (r.resolution_type || '').toLowerCase() === 'refund').length;
  const replacementsCount = stats?.replacements_count ?? allRequests.filter(r => (r.resolution_type || '').toLowerCase() === 'replacement').length;
  const pendingActionCount = stats?.pending_review ?? allRequests.filter(r => ['pending_review', 'requested', 'under_review'].includes((r.workflow_status || '').toLowerCase())).length;
  const resolvedCount = stats?.resolved ?? allRequests.filter(r => ['resolved', 'approved', 'completed'].includes((r.workflow_status || '').toLowerCase())).length;

  const handleResetFilters = () => {
    setSearchTerm('');
    setSelectedType('all');
    setSelectedStatus('all');
    setSelectedTimeframe('30days');
    setCurrentPage(1);
  };

  const handleRowClick = (requestId) => {
    if (onNavigate) {
      onNavigate('handler-dashboard', `/handler/requests/${requestId}`);
    }
  };

  const filtered = useMemo(() => {
    return allRequests.filter((item) => {
      const typeStr = (item.resolution_type || 'refund').toLowerCase();
      const statusStr = (item.workflow_status || '').toLowerCase();

      if (selectedType !== 'all') {
        if (selectedType === 'refund' && typeStr !== 'refund') return false;
        if (selectedType === 'replacement' && typeStr !== 'replacement') return false;
      }

      if (selectedStatus !== 'all') {
        if (!statusStr.includes(selectedStatus.toLowerCase())) return false;
      }

      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const idStr = String(item.id || item.claim_id || '');
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
  }, [allRequests, selectedType, selectedStatus, searchTerm]);

  const displayed = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <div className="hd-page hd-requests-page">
      {/* Page Header */}
      <div className="hd-page-header">
        <h2 className="hd-page-title">Requests</h2>
        <span className="hd-page-subtitle">
          All return and replacement requests in your department.
        </span>
      </div>

      {/* 5 KPI Cards Row */}
      <div className="hd-kpi-row-5">
        <HandlerKPICard
          title="Total Requests"
          value={totalRequests}
          icon={Layers}
        />
        <HandlerKPICard
          title="Returns"
          value={returnsCount}
          icon={Package}
        />
        <HandlerKPICard
          title="Replacements"
          value={replacementsCount}
          icon={ArrowLeftRight}
        />
        <HandlerKPICard
          title="Pending Action"
          value={pendingActionCount}
          icon={Clock}
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
            placeholder="Search by request ID, order ID, customer, or product..."
            value={searchTerm}
            onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
            className="hd-search-input"
          />
        </div>

        <div className="hd-filters-cluster">
          <select
            className="hd-select"
            value={selectedType}
            onChange={(e) => { setSelectedType(e.target.value); setCurrentPage(1); }}
          >
            <option value="all">All Types</option>
            <option value="refund">Returns</option>
            <option value="replacement">Replacements</option>
          </select>

          <select
            className="hd-select"
            value={selectedStatus}
            onChange={(e) => { setSelectedStatus(e.target.value); setCurrentPage(1); }}
          >
            <option value="all">All Statuses</option>
            <option value="pending">Pending Review</option>
            <option value="process">In Process</option>
            <option value="information">Information Requested</option>
            <option value="inspection">Under Inspection</option>
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
            <option value="all">All Time</option>
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

      {/* Requests Table */}
      <div className="hd-card hd-table-card">
        <div className="hd-table-wrapper">
          <table className="hd-table">
            <thead>
              <tr>
                <th style={{ width: '110px' }}>REQUEST ID</th>
                <th style={{ width: '150px' }}>ORDER ID</th>
                <th style={{ width: '130px' }}>CUSTOMER</th>
                <th>PRODUCT</th>
                <th style={{ width: '110px' }}>TYPE</th>
                <th style={{ width: '160px' }}>STATUS</th>
                <th style={{ width: '170px' }}>SUBMITTED ON</th>
                <th style={{ width: '80px', textAlign: 'right' }}>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="8" className="hd-table-empty">
                    Loading requests...
                  </td>
                </tr>
              ) : displayed.length === 0 ? (
                <tr>
                  <td colSpan="8" className="hd-table-empty">
                    No requests found matching the current criteria.
                  </td>
                </tr>
              ) : (
                displayed.map((r) => {
                  const reqId = r.id || r.claim_id;
                  const displayId = `TRN-${reqId}`;
                  const orderNum = r.order_number || (r.order_id ? `FK-${r.order_id}` : '—');
                  const customer = r.customer_name || 'Customer';
                  const productName = r.product_name || 'Product Item';
                  const typeLabel = (r.resolution_type || '').toLowerCase() === 'replacement' ? 'Replacement' : 'Refund';
                  const submittedDate = r.requested_at
                    ? new Date(r.requested_at).toLocaleString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                      })
                    : '—';

                  return (
                    <tr
                      key={reqId}
                      className="hd-table-row-clickable"
                      onClick={() => handleRowClick(reqId)}
                    >
                      <td className="hd-cell-id">{displayId}</td>
                      <td className="hd-cell-subtle">{orderNum}</td>
                      <td className="hd-cell-bold">{customer}</td>
                      <td className="hd-cell-plain-product">
                        <span className="hd-product-name-plain">{productName}</span>
                      </td>
                      <td className="hd-cell-subtle">{typeLabel}</td>
                      <td>
                        <HandlerStatusBadge status={r.workflow_status || 'Pending'} />
                      </td>
                      <td className="hd-cell-timestamp">{submittedDate}</td>
                      <td
                        style={{ textAlign: 'right', position: 'relative' }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          className="hd-table-action-btn"
                          title="Actions"
                          onClick={() => setActiveMenuId(activeMenuId === reqId ? null : reqId)}
                        >
                          <MoreHorizontal size={16} />
                        </button>
                        {activeMenuId === reqId && (
                          <div className="hd-action-dropdown">
                            <button
                              type="button"
                              className="hd-action-dropdown-item"
                              onClick={() => {
                                setActiveMenuId(null);
                                handleRowClick(reqId);
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

export default HandlerRequestsView;
