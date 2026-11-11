import React, { useState, useMemo } from 'react';
import {
  Layers,
  Network,
  ArrowLeftRight,
  CheckCircle2,
  Search,
  Filter,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
} from 'lucide-react';
import { HandlerKPICard } from './HandlerKPICard';
import { HandlerStatusBadge } from './HandlerStatusBadge';

export function HandlerTrackingView({
  handoffs = [],
  loading = false,
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDept, setSelectedDept] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [selectedTimeframe, setSelectedTimeframe] = useState('30days');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 5;

  const totalTracked = handoffs.length > 0 ? handoffs.length : 48;
  const withOtherDepts = 18;
  const awaitingHandoff = 6;
  const completedCount = 24;

  const initialHandoffs = useMemo(() => {
    if (handoffs && handoffs.length > 0) {
      return handoffs.map((h, idx) => ({
        id: h.request_id || `TRN-${1032 - idx}`,
        orderId: h.order_number || `FK-2026110${9 - (idx % 5)}-${8896 - idx * 1155}`,
        customer: h.customer_name || 'Customer',
        currentOwner: h.current_owner || 'Order & Delivery',
        handoffFrom: h.handoff_from || 'Returns & Replacement',
        status: h.status || 'In Progress',
        lastUpdated: h.last_updated ? new Date(h.last_updated).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'Nov 10, 2026, 11:24 AM',
      }));
    }
    return [
      { id: 'TRN-1032', orderId: 'FK-20261109-8896', customer: 'Abhijeet', currentOwner: 'Order & Delivery', handoffFrom: 'Returns & Replacement', status: 'In Progress', lastUpdated: 'Nov 10, 2026, 11:24 AM' },
      { id: 'TRN-1031', orderId: 'FK-20261108-7741', customer: 'Rahul', currentOwner: 'Payments', handoffFrom: 'Returns & Replacement', status: 'Pending', lastUpdated: 'Nov 10, 2026, 10:16 AM' },
      { id: 'TRN-1030', orderId: 'FK-20261107-6622', customer: 'Priya', currentOwner: 'Returns & Replacement', handoffFrom: '—', status: 'Completed', lastUpdated: 'Nov 9, 2026, 5:42 PM' },
      { id: 'TRN-1029', orderId: 'FK-20261106-5510', customer: 'Sneha', currentOwner: 'Order & Delivery', handoffFrom: 'Returns & Replacement', status: 'In Progress', lastUpdated: 'Nov 8, 2026, 4:20 PM' },
      { id: 'TRN-1028', orderId: 'FK-20261106-5509', customer: 'Karan', currentOwner: 'Payments', handoffFrom: 'Returns & Replacement', status: 'Completed', lastUpdated: 'Nov 8, 2026, 2:11 PM' },
    ];
  }, [handoffs]);

  const filtered = useMemo(() => {
    return initialHandoffs.filter((item) => {
      if (selectedDept !== 'all' && !item.currentOwner.toLowerCase().includes(selectedDept.toLowerCase())) return false;
      if (selectedStatus !== 'all' && !item.status.toLowerCase().includes(selectedStatus.toLowerCase())) return false;
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        return (
          item.id.toLowerCase().includes(q) ||
          item.orderId.toLowerCase().includes(q) ||
          item.customer.toLowerCase().includes(q) ||
          item.currentOwner.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [initialHandoffs, selectedDept, selectedStatus, searchTerm]);

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
            onChange={(e) => setSelectedTimeframe(e.target.value)}
          >
            <option value="30days">Last 30 Days</option>
            <option value="7days">Last 7 Days</option>
            <option value="90days">Last 90 Days</option>
          </select>

          <button type="button" className="hd-icon-btn" title="More Filters">
            <Filter size={16} strokeWidth={1.8} />
          </button>
        </div>
      </div>

      {/* Tracking Table */}
      <div className="hd-card hd-table-card">
        <div className="hd-table-wrapper">
          <table className="hd-table">
            <thead>
              <tr>
                <th>REQUEST ID</th>
                <th>ORDER ID</th>
                <th>CUSTOMER</th>
                <th>CURRENT OWNER</th>
                <th>HANDOFF FROM</th>
                <th>STATUS</th>
                <th>LAST UPDATED</th>
                <th style={{ textAlign: 'right' }}>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {displayed.map((h) => (
                <tr key={h.id}>
                  <td className="hd-cell-id">{h.id}</td>
                  <td className="hd-cell-subtle">{h.orderId}</td>
                  <td className="hd-cell-bold">{h.customer}</td>
                  <td className="hd-cell-bold">{h.currentOwner}</td>
                  <td className="hd-cell-subtle">{h.handoffFrom}</td>
                  <td>
                    <HandlerStatusBadge status={h.status} />
                  </td>
                  <td className="hd-cell-subtle">{h.lastUpdated}</td>
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
            Showing 1-{displayed.length} of {totalTracked}
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

export default HandlerTrackingView;

