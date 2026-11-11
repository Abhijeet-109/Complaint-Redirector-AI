import React, { useState, useMemo } from 'react';
import {
  Layers,
  Package,
  ArrowLeftRight,
  Clock,
  CheckCircle2,
  Search,
  Filter,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  Shirt,
  Headphones,
  Footprints,
} from 'lucide-react';
import { HandlerKPICard } from './HandlerKPICard';
import { HandlerStatusBadge } from './HandlerStatusBadge';

export function HandlerRequestsView({
  allRequests = [],
  stats,
  loading = false,
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedType, setSelectedType] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [selectedTimeframe, setSelectedTimeframe] = useState('30days');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 5;

  const totalRequests = stats?.total_requests ?? 48;
  const returnsCount = stats?.returns_count ?? 28;
  const replacementsCount = stats?.replacements_count ?? 20;
  const pendingActionCount = stats?.pending_review ?? 12;
  const resolvedCount = stats?.resolved ?? 18;

  const initialRequests = useMemo(() => {
    if (allRequests && allRequests.length > 0) {
      return allRequests.map((r, idx) => ({
        id: `TRN-${1032 - idx}`,
        orderId: r.order_number || `FK-2026110${9 - (idx % 5)}-${8896 - idx * 1155}`,
        customer: r.customer_name || 'Customer',
        product: r.product_name || 'Product Item',
        type: r.resolution_type === 'replacement' ? 'Replacement' : 'Refund',
        status: r.workflow_status || 'Pending Review',
        submittedOn: r.requested_at ? new Date(r.requested_at).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'Nov 10, 2026, 11:24 AM',
      }));
    }
    return [
      { id: 'TRN-1032', orderId: 'FK-20261109-8896', customer: 'Abhijeet', product: "Men's Casual Sneakers", type: 'Refund', status: 'Pending Review', submittedOn: 'Nov 10, 2026, 11:24 AM', iconType: 'shoe' },
      { id: 'TRN-1031', orderId: 'FK-20261108-7741', customer: 'Rahul', product: 'Cotton Shirt (L)', type: 'Replacement', status: 'In Process', submittedOn: 'Nov 10, 2026, 10:16 AM', iconType: 'shirt' },
      { id: 'TRN-1030', orderId: 'FK-20261107-6622', customer: 'Priya', product: 'Wireless Headphones', type: 'Refund', status: 'Information Requested', submittedOn: 'Nov 9, 2026, 5:42 PM', iconType: 'headphones' },
      { id: 'TRN-1029', orderId: 'FK-20261106-5510', customer: 'Sneha', product: 'Running Shoes', type: 'Refund', status: 'Under Inspection', submittedOn: 'Nov 8, 2026, 4:20 PM', iconType: 'shoe' },
      { id: 'TRN-1028', orderId: 'FK-20261106-5509', customer: 'Karan', product: 'T-Shirt (XL)', type: 'Replacement', status: 'Resolved', submittedOn: 'Nov 8, 2026, 2:11 PM', iconType: 'shirt' },
    ];
  }, [allRequests]);

  const filtered = useMemo(() => {
    return initialRequests.filter((item) => {
      if (selectedType !== 'all' && item.type.toLowerCase() !== selectedType.toLowerCase()) return false;
      if (selectedStatus !== 'all' && !item.status.toLowerCase().includes(selectedStatus.toLowerCase())) return false;
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
  }, [initialRequests, selectedType, selectedStatus, searchTerm]);

  const displayed = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

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
            <option value="refund">Refund</option>
            <option value="replacement">Replacement</option>
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
            onChange={(e) => setSelectedTimeframe(e.target.value)}
          >
            <option value="30days">Last 30 Days</option>
            <option value="7days">Last 7 Days</option>
            <option value="90days">Last 90 Days</option>
            <option value="all">All Time</option>
          </select>

          <button type="button" className="hd-icon-btn" title="More Filters">
            <Filter size={16} strokeWidth={1.8} />
          </button>
        </div>
      </div>

      {/* Requests Table */}
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
                <th>SUBMITTED ON</th>
                <th style={{ textAlign: 'right' }}>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {displayed.map((r) => (
                <tr key={r.id}>
                  <td className="hd-cell-id">{r.id}</td>
                  <td className="hd-cell-subtle">{r.orderId}</td>
                  <td className="hd-cell-bold">{r.customer}</td>
                  <td>
                    <div className="hd-product-cell">
                      {renderProductIcon(r)}
                      <span className="hd-product-name">{r.product}</span>
                    </div>
                  </td>
                  <td className="hd-cell-subtle">{r.type}</td>
                  <td>
                    <HandlerStatusBadge status={r.status} />
                  </td>
                  <td className="hd-cell-subtle">{r.submittedOn}</td>
                  <td style={{ textAlign: 'right' }}>
                    <button type="button" className="hd-table-action-btn" title="Actions">
                      <MoreHorizontal size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <div className="hd-pagination-row">
          <span className="hd-pagination-info">
            Showing 1-{displayed.length} of {totalRequests}
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
            <span className="hd-pagination-ellipsis">...</span>
            <button type="button" className="hd-page-num-btn">10</button>
            <button
              type="button"
              className="hd-page-nav-btn"
              onClick={() => setCurrentPage(p => p + 1)}
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default HandlerRequestsView;

