import React, { useState, useMemo, useEffect } from 'react';
import { Search, FileText, GitCompare, Clock, CheckCircle2 } from 'lucide-react';
import { MetricCard } from './MetricCard';
import { ComplaintStatusBadge } from '../complaints/ComplaintStatusBadge';
import { HandlerPagination } from '../handler/HandlerPagination';
import { ComplaintDetailsModal } from './ComplaintDetailsModal';

export function ComplaintsOversightView({
  complaints = [],
  departments = [],
  redirectionData = { summary: {} },
  focusedComplaintId = null,
  onClearFocusedComplaint = null,
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [deptFilter, setDeptFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selectedComplaint, setSelectedComplaint] = useState(null);
  const [highlightedComplaintId, setHighlightedComplaintId] = useState(null);

  // Reset page when search or filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter, deptFilter]);

  const handleReset = () => {
    setSearchTerm('');
    setStatusFilter('all');
    setDeptFilter('all');
    setCurrentPage(1);
  };

  const handlePageSizeChange = (newSize) => {
    setPageSize(newSize);
    setCurrentPage(1);
  };

  // 4 KPI Calculations across the complete dataset
  const kpis = useMemo(() => {
    const total = complaints.length;
    const redirected = redirectionData?.summary?.total_complaints_forwarded || 0;
    const pending = complaints.filter(
      (c) => (c.status || '').toLowerCase() === 'pending' || (c.status || '').toLowerCase() === 'open'
    ).length;
    const resolved = complaints.filter(
      (c) => (c.status || '').toLowerCase() === 'resolved' || (c.status || '').toLowerCase() === 'completed'
    ).length;

    return { total, redirected, pending, resolved };
  }, [complaints, redirectionData]);

  // Filtered dataset
  const filteredComplaints = useMemo(() => {
    return complaints.filter((item) => {
      // Status filter
      if (statusFilter !== 'all') {
        const itemStatus = (item.status || '').toLowerCase();
        if (statusFilter === 'pending' && itemStatus !== 'pending' && itemStatus !== 'open') {
          return false;
        } else if (statusFilter === 'resolved' && itemStatus !== 'resolved' && itemStatus !== 'completed') {
          return false;
        } else if (statusFilter === 'followed_up' && itemStatus !== 'followed_up' && itemStatus !== 'in_progress') {
          return false;
        } else if (statusFilter !== 'pending' && statusFilter !== 'resolved' && statusFilter !== 'followed_up') {
          if (itemStatus !== statusFilter.toLowerCase()) return false;
        }
      }

      // Department filter
      if (deptFilter !== 'all') {
        if (
          String(item.department_id) !== String(deptFilter) &&
          item.current_department !== deptFilter
        ) {
          return false;
        }
      }

      // Search query across supported fields
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const text = (item.complaint_text || '').toLowerCase();
        const customer = (item.user_name || '').toLowerCase();
        const email = (item.user_email || '').toLowerCase();
        const idStr = String(item.id || '');
        const dept = (item.current_department || '').toLowerCase();

        return (
          text.includes(q) ||
          customer.includes(q) ||
          email.includes(q) ||
          idStr.includes(q) ||
          dept.includes(q)
        );
      }

      return true;
    });
  }, [complaints, statusFilter, deptFilter, searchTerm]);

  // Handle focused complaint navigation from overview (highlight row for 3-4s and open details)
  useEffect(() => {
    if (focusedComplaintId && complaints.length > 0) {
      const target = complaints.find((c) => String(c.id) === String(focusedComplaintId));
      if (target) {
        setSelectedComplaint(target);
        setHighlightedComplaintId(target.id);

        const indexInFiltered = filteredComplaints.findIndex((c) => String(c.id) === String(target.id));
        if (indexInFiltered !== -1) {
          const targetPage = Math.floor(indexInFiltered / pageSize) + 1;
          setCurrentPage(targetPage);
        } else {
          setSearchTerm('');
          setStatusFilter('all');
          setDeptFilter('all');
        }

        const timer = setTimeout(() => {
          setHighlightedComplaintId(null);
          if (onClearFocusedComplaint) onClearFocusedComplaint();
        }, 3500);

        return () => clearTimeout(timer);
      }
    }
  }, [focusedComplaintId, complaints, filteredComplaints, pageSize, onClearFocusedComplaint]);

  // Pagination calculations
  const totalPages = Math.max(1, Math.ceil(filteredComplaints.length / pageSize));
  const safeCurrentPage = Math.min(Math.max(1, currentPage), totalPages);

  const paginatedComplaints = useMemo(() => {
    const start = (safeCurrentPage - 1) * pageSize;
    return filteredComplaints.slice(start, start + pageSize);
  }, [filteredComplaints, safeCurrentPage, pageSize]);

  const formatDate = (isoString) => {
    if (!isoString) return '—';
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    } catch {
      return isoString;
    }
  };

  return (
    <>
      {/* Page Heading */}
      <div className="ad-header-row">
        <div>
          <h1 className="ad-page-heading">Complaints Oversight</h1>
          <p className="ad-page-subtext">
            Monitor and review customer complaints across all departments.
          </p>
        </div>
      </div>

      {/* KPI Cards Row (4 Cards) */}
      <div className="ad-kpi-grid-4">
        <MetricCard
          label="Total Complaints"
          value={kpis.total}
          sub="All Records"
          icon={FileText}
        />
        <MetricCard
          label="Redirected Complaints"
          value={kpis.redirected}
          sub="Forwarded Across Depts"
          icon={GitCompare}
        />
        <MetricCard
          label="Pending"
          value={kpis.pending}
          sub="Awaiting Action"
          icon={Clock}
          color="#C86830"
        />
        <MetricCard
          label="Resolved"
          value={kpis.resolved}
          sub="Closed Successfully"
          icon={CheckCircle2}
          color="#3A6943"
        />
      </div>

      {/* Full-Width Complaints Table Panel */}
      <div className="ad-table-panel">
        {/* Toolbar / Filters */}
        <div className="ad-table-toolbar">
          <div className="ad-search-box">
            <Search className="ad-search-icon" size={16} />
            <input
              type="text"
              placeholder="Search complaints, customer, or department..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <select
            className="ad-select-filter"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            aria-label="Filter by status"
          >
            <option value="all">All statuses</option>
            <option value="pending">Pending</option>
            <option value="followed_up">Followed Up</option>
            <option value="resolved">Resolved</option>
          </select>

          <select
            className="ad-select-filter"
            value={deptFilter}
            onChange={(e) => setDeptFilter(e.target.value)}
            aria-label="Filter by department"
          >
            <option value="all">All departments</option>
            {departments.map((dept) => (
              <option key={dept.id} value={dept.name}>
                {dept.name}
              </option>
            ))}
          </select>

          <button className="ad-btn-reset" onClick={handleReset}>
            Reset
          </button>
        </div>

        {/* Complaints Table */}
        {filteredComplaints.length === 0 ? (
          <div style={{ padding: '48px 20px', textAlign: 'center', color: '#637073', fontSize: '13.5px' }}>
            No complaints match the selected filters.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="ad-data-table">
              <thead>
                <tr>
                  <th>Complaint ID</th>
                  <th>Complaint Summary</th>
                  <th>Customer</th>
                  <th>Department</th>
                  <th>Submitted</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {paginatedComplaints.map((item) => {
                  const isSelected = selectedComplaint?.id === item.id;
                  const isHighlighted = highlightedComplaintId && String(highlightedComplaintId) === String(item.id);
                  return (
                    <tr
                      key={item.id}
                      className={`${isSelected ? 'active-row' : ''} ${isHighlighted ? 'ad-temporary-highlight-row' : ''}`.trim()}
                      onClick={() => setSelectedComplaint(item)}
                    >
                      <td style={{ fontFamily: 'monospace', fontWeight: '700' }}>#{item.id}</td>
                      <td
                        style={{
                          maxWidth: '260px',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                        title={item.complaint_text}
                      >
                        {item.complaint_text}
                      </td>
                      <td>
                        <span style={{ fontWeight: '600' }}>{item.user_name || 'Customer'}</span>
                      </td>
                      <td>
                        <strong>{item.current_department || '—'}</strong>
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>{formatDate(item.create_at)}</td>
                      <td>
                        <ComplaintStatusBadge status={item.status} />
                      </td>
                      <td>
                        <button
                          type="button"
                          className="ad-table-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedComplaint(item);
                          }}
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Controls */}
        {filteredComplaints.length > 0 && (
          <HandlerPagination
            currentPage={safeCurrentPage}
            pageSize={pageSize}
            totalItems={filteredComplaints.length}
            onPageChange={setCurrentPage}
            onPageSizeChange={handlePageSizeChange}
            pageSizeOptions={[5, 10, 25, 50]}
          />
        )}
      </div>

      {/* Centered Complaint Details Modal */}
      {selectedComplaint && (
        <ComplaintDetailsModal
          complaint={selectedComplaint}
          onClose={() => setSelectedComplaint(null)}
        />
      )}
    </>
  );
}

export default ComplaintsOversightView;
