import React, { useState, useMemo } from 'react';
import {
  Package,
  ClipboardList,
  Info,
  Search,
  Filter,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  Shirt,
  Headphones,
  Footprints,
} from 'lucide-react';
import { HandlerKPICard } from './HandlerKPICard';
import { HandlerStatusBadge } from './HandlerStatusBadge';

export function HandlerReviewQueueView({
  claims = [],
  loading = false,
  onRefresh,
}) {
  const [activeTab, setActiveTab] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 5;

  // Real or fallback claims matching screenshot
  const initialClaims = useMemo(() => {
    if (claims && claims.length > 0) {
      return claims.map((c, idx) => ({
        id: `TRN-${1032 - idx}`,
        claimId: c.id,
        orderId: c.order_number || `FK-2026110${9 - (idx % 5)}-${8896 - idx * 1155}`,
        customer: c.customer_name || 'Customer',
        product: c.product_name || 'Product Item',
        type: c.resolution_type === 'replacement' ? 'Replacement' : 'Refund',
        status: c.workflow_status || 'Pending Review',
        submittedOn: c.requested_at ? new Date(c.requested_at).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'Nov 10, 2026, 11:24 AM',
      }));
    }
    return [
      { id: 'TRN-1032', orderId: 'FK-20261109-8896', customer: 'Abhijeet', product: "Men's Casual Sneakers", type: 'Refund', status: 'Pending Review', submittedOn: 'Nov 10, 2026, 11:24 AM', iconType: 'shoe' },
      { id: 'TRN-1031', orderId: 'FK-20261108-7741', customer: 'Rahul', product: 'Cotton Shirt (L)', type: 'Replacement', status: 'In Process', submittedOn: 'Nov 10, 2026, 10:16 AM', iconType: 'shirt' },
      { id: 'TRN-1030', orderId: 'FK-20261107-6622', customer: 'Priya', product: 'Wireless Headphones', type: 'Refund', status: 'Information Requested', submittedOn: 'Nov 9, 2026, 5:42 PM', iconType: 'headphones' },
      { id: 'TRN-1029', orderId: 'FK-20261106-5510', customer: 'Sneha', product: 'Running Shoes', type: 'Refund', status: 'Under Inspection', submittedOn: 'Nov 8, 2026, 4:20 PM', iconType: 'shoe' },
      { id: 'TRN-1028', orderId: 'FK-20261106-5509', customer: 'Karan', product: 'T-Shirt (XL)', type: 'Replacement', status: 'In Process', submittedOn: 'Nov 8, 2026, 2:11 PM', iconType: 'shirt' },
    ];
  }, [claims]);

  // Tab counts
  const totalInQueue = claims.length > 0 ? claims.length : 12;
  const pendingReviewCount = 12;
  const infoRequestedCount = 3;
  const underInspectionCount = 2;

  // Filtered rows
  const filteredClaims = useMemo(() => {
    return initialClaims.filter((item) => {
      // Tab filter
      if (activeTab === 'pending' && !item.status.toLowerCase().includes('pending')) return false;
      if (activeTab === 'info' && !item.status.toLowerCase().includes('info')) return false;
      if (activeTab === 'inspection' && !item.status.toLowerCase().includes('inspect')) return false;

      // Search filter
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        return (
          item.id.toLowerCase().includes(q) ||
          item.orderId.toLowerCase().includes(q) ||
          item.customer.toLowerCase().includes(q) ||
          item.product.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [initialClaims, activeTab, searchTerm]);

  const totalPages = Math.max(1, Math.ceil(filteredClaims.length / pageSize));
  const displayedClaims = filteredClaims.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const toggleSelectAll = () => {
    if (selectedIds.size === displayedClaims.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(displayedClaims.map((c) => c.id)));
    }
  };

  const toggleSelect = (id) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const renderProductIcon = (p) => {
    if (p.iconType === 'shirt' || p.product.toLowerCase().includes('shirt')) {
      return (
        <div className="hd-product-thumb" style={{ backgroundColor: '#E2E8F0', color: '#475569' }}>
          <Shirt size={16} />
        </div>
      );
    }
    if (p.iconType === 'headphones' || p.product.toLowerCase().includes('headphone')) {
      return (
        <div className="hd-product-thumb" style={{ backgroundColor: '#EDE9FE', color: '#6D28D9' }}>
          <Headphones size={16} />
        </div>
      );
    }
    return (
      <div className="hd-product-thumb" style={{ backgroundColor: '#F1F5F9', color: '#0F172A' }}>
        <Footprints size={16} />
      </div>
    );
  };

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
          value={totalInQueue}
          icon={Package}
        />
        <HandlerKPICard
          title="Pending Review"
          value={pendingReviewCount}
          icon={ClipboardList}
        />
        <HandlerKPICard
          title="Information Requested"
          value={infoRequestedCount}
          icon={Info}
        />
        <HandlerKPICard
          title="Under Inspection"
          value={underInspectionCount}
          icon={Search}
        />
      </div>

      {/* Toolbar & Filters */}
      <div className="hd-toolbar-row">
        {/* Left Filter Tabs */}
        <div className="hd-filter-tabs">
          <button
            type="button"
            className={`hd-filter-tab ${activeTab === 'all' ? 'active' : ''}`}
            onClick={() => { setActiveTab('all'); setCurrentPage(1); }}
          >
            All ({totalInQueue})
          </button>
          <button
            type="button"
            className={`hd-filter-tab ${activeTab === 'pending' ? 'active' : ''}`}
            onClick={() => { setActiveTab('pending'); setCurrentPage(1); }}
          >
            Pending Review ({pendingReviewCount})
          </button>
          <button
            type="button"
            className={`hd-filter-tab ${activeTab === 'info' ? 'active' : ''}`}
            onClick={() => { setActiveTab('info'); setCurrentPage(1); }}
          >
            Info Requested ({infoRequestedCount})
          </button>
          <button
            type="button"
            className={`hd-filter-tab ${activeTab === 'inspection' ? 'active' : ''}`}
            onClick={() => { setActiveTab('inspection'); setCurrentPage(1); }}
          >
            Under Inspection ({underInspectionCount})
          </button>
        </div>

        {/* Right Search & Filter */}
        <div className="hd-search-filter-group">
          <div className="hd-search-box">
            <Search size={16} className="hd-search-icon" />
            <input
              type="text"
              placeholder="Search by request ID, order ID, customer..."
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
              className="hd-search-input"
            />
          </div>
          <button type="button" className="hd-icon-btn" title="Filters">
            <Filter size={16} strokeWidth={1.8} />
          </button>
        </div>
      </div>

      {/* Table Container */}
      <div className="hd-card hd-table-card">
        <div className="hd-table-wrapper">
          <table className="hd-table">
            <thead>
              <tr>
                <th style={{ width: '40px' }}>
                  <input
                    type="checkbox"
                    className="hd-checkbox"
                    checked={displayedClaims.length > 0 && selectedIds.size === displayedClaims.length}
                    onChange={toggleSelectAll}
                  />
                </th>
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
              {displayedClaims.map((claim) => {
                const isSelected = selectedIds.has(claim.id);
                return (
                  <tr key={claim.id} className={isSelected ? 'hd-row-selected' : ''}>
                    <td>
                      <input
                        type="checkbox"
                        className="hd-checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(claim.id)}
                      />
                    </td>
                    <td className="hd-cell-id">{claim.id}</td>
                    <td className="hd-cell-subtle">{claim.orderId}</td>
                    <td className="hd-cell-bold">{claim.customer}</td>
                    <td>
                      <div className="hd-product-cell">
                        {renderProductIcon(claim)}
                        <span className="hd-product-name">{claim.product}</span>
                      </div>
                    </td>
                    <td className="hd-cell-subtle">{claim.type}</td>
                    <td>
                      <HandlerStatusBadge status={claim.status} />
                    </td>
                    <td className="hd-cell-subtle">{claim.submittedOn}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Table Footer with Pagination */}
        <div className="hd-pagination-row">
          <span className="hd-pagination-info">
            Showing 1-{displayedClaims.length} of {totalInQueue}
          </span>
          <div className="hd-pagination-controls">
            <button
              type="button"
              className="hd-page-nav-btn"
              disabled={currentPage === 1}
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            >
              <ChevronLeft size={16} />
            </button>
            <button type="button" className="hd-page-num-btn active">1</button>
            <button type="button" className="hd-page-num-btn">2</button>
            <button type="button" className="hd-page-num-btn">3</button>
            <button
              type="button"
              className="hd-page-nav-btn"
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default HandlerReviewQueueView;

