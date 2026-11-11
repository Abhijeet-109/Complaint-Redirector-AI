import React, { useState, useMemo } from 'react';
import {
  MessageCircle,
  Clock,
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

export function HandlerComplaintsView({
  complaints = [],
  loading = false,
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [selectedTimeframe, setSelectedTimeframe] = useState('30days');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 5;

  const totalComplaints = complaints.length > 0 ? complaints.length : 6;
  const pendingActionCount = 2;
  const inProgressCount = 2;
  const resolvedCount = 2;

  const initialComplaints = useMemo(() => {
    if (complaints && complaints.length > 0) {
      return complaints.map((c, idx) => ({
        id: `CMP-${1006 - idx}`,
        rawId: c.id,
        requestId: `TRN-${1030 - idx * 2}`,
        orderId: c.order_number || `FK-2026110${7 - (idx % 4)}-${6622 - idx * 1112}`,
        customer: c.user_name || 'Customer',
        subject: c.subject || c.description || 'Status update for my return request',
        status: c.status || 'Pending',
        raisedOn: c.create_at ? new Date(c.create_at).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'Nov 9, 2026, 5:42 PM',
      }));
    }
    return [
      { id: 'CMP-1006', requestId: 'TRN-1030', orderId: 'FK-20261107-6622', customer: 'Priya', subject: 'Status update for my return request', status: 'Pending', raisedOn: 'Nov 9, 2026, 5:42 PM' },
      { id: 'CMP-1005', requestId: 'TRN-1029', orderId: 'FK-20261106-5510', customer: 'Sneha', subject: 'When will my pickup be scheduled?', status: 'In Progress', raisedOn: 'Nov 8, 2026, 4:20 PM' },
      { id: 'CMP-1004', requestId: 'TRN-1028', orderId: 'FK-20261106-5509', customer: 'Karan', subject: 'Need update on replacement delivery', status: 'Resolved', raisedOn: 'Nov 8, 2026, 2:11 PM' },
      { id: 'CMP-1003', requestId: 'TRN-1026', orderId: 'FK-20261105-4390', customer: 'Rahul', subject: 'Return pickup delayed', status: 'Pending', raisedOn: 'Nov 7, 2026, 11:37 AM' },
      { id: 'CMP-1002', requestId: 'TRN-1024', orderId: 'FK-20261104-3210', customer: 'Neha', subject: 'Replacement not yet dispatched', status: 'Resolved', raisedOn: 'Nov 6, 2026, 6:14 PM' },
      { id: 'CMP-1001', requestId: 'TRN-1022', orderId: 'FK-20261103-2109', customer: 'Amit', subject: 'Refund amount mismatch', status: 'In Progress', raisedOn: 'Nov 5, 2026, 3:10 PM' },
    ];
  }, [complaints]);

  const filtered = useMemo(() => {
    return initialComplaints.filter((item) => {
      if (selectedStatus !== 'all' && !item.status.toLowerCase().includes(selectedStatus.toLowerCase())) return false;
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        return (
          item.id.toLowerCase().includes(q) ||
          item.requestId.toLowerCase().includes(q) ||
          item.orderId.toLowerCase().includes(q) ||
          item.customer.toLowerCase().includes(q) ||
          item.subject.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [initialComplaints, selectedStatus, searchTerm]);

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

      {/* Complaints Table */}
      <div className="hd-card hd-table-card">
        <div className="hd-table-wrapper">
          <table className="hd-table">
            <thead>
              <tr>
                <th>COMPLAINT ID</th>
                <th>REQUEST ID</th>
                <th>ORDER ID</th>
                <th>CUSTOMER</th>
                <th>SUBJECT</th>
                <th>STATUS</th>
                <th>RAISED ON</th>
                <th style={{ textAlign: 'right' }}>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {displayed.map((c) => (
                <tr key={c.id}>
                  <td className="hd-cell-id">{c.id}</td>
                  <td className="hd-cell-subtle">{c.requestId}</td>
                  <td className="hd-cell-subtle">{c.orderId}</td>
                  <td className="hd-cell-bold">{c.customer}</td>
                  <td className="hd-cell-subject">{c.subject}</td>
                  <td>
                    <HandlerStatusBadge status={c.status} />
                  </td>
                  <td className="hd-cell-subtle">{c.raisedOn}</td>
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
            Showing 1-{displayed.length} of {totalComplaints}
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
            <button
              type="button"
              className="hd-page-nav-btn"
              disabled={currentPage === 2}
              onClick={() => setCurrentPage(2)}
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default HandlerComplaintsView;

