import React, { useState, useMemo } from 'react';
import { Search } from 'lucide-react';
import { ComplaintStatusBadge } from '../complaints/ComplaintStatusBadge';
import { formatConfidence } from '../../utils/formatConfidence';

export function ComplaintsTable({
  complaints = [],
  departments = [],
  selectedComplaint,
  onSelectComplaint,
  title = 'Recent Complaints',
  subtext = 'Complaints registered in the system',
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [deptFilter, setDeptFilter] = useState('all');

  const handleReset = () => {
    setSearchTerm('');
    setStatusFilter('all');
    setDeptFilter('all');
  };

  const filteredComplaints = useMemo(() => {
    return complaints.filter((item) => {
      // Status filter
      if (statusFilter !== 'all') {
        if ((item.status || '').toLowerCase() !== statusFilter.toLowerCase()) {
          return false;
        }
      }

      // Department filter
      if (deptFilter !== 'all') {
        if (String(item.department_id) !== String(deptFilter) && item.current_department !== deptFilter) {
          return false;
        }
      }

      // Search term
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const text = (item.complaint_text || '').toLowerCase();
        const customer = (item.user_name || '').toLowerCase();
        const email = (item.user_email || '').toLowerCase();
        const idStr = String(item.id);
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

      {/* Table */}
      {filteredComplaints.length === 0 ? (
        <div style={{ padding: '36px 20px', textAlign: 'center', color: '#637073', fontSize: '13.5px' }}>
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
                <th>Current Department</th>
                <th>Submitted</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredComplaints.map((item) => {
                const isSelected = selectedComplaint?.id === item.id;
                return (
                  <tr
                    key={item.id}
                    className={isSelected ? 'active-row' : ''}
                    onClick={() => onSelectComplaint && onSelectComplaint(item)}
                  >
                    <td style={{ fontFamily: 'monospace', fontWeight: '700' }}>#{item.id}</td>
                    <td style={{ maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.complaint_text}>
                      {item.complaint_text}
                    </td>
                    <td>
                      <div>{item.user_name || 'Customer'}</div>
                      <div style={{ fontSize: '11px', color: '#909B9D' }}>
                        {item.user_email || 'Email unavailable'}
                      </div>
                    </td>
                    <td><strong>{item.current_department || '—'}</strong></td>
                    <td style={{ whiteSpace: 'nowrap' }}>{formatDate(item.create_at)}</td>
                    <td>
                      <ComplaintStatusBadge status={item.status} />
                      {formatConfidence(item.confidence) && <div className="ad-complaint-confidence">{formatConfidence(item.confidence)}</div>}
                    </td>
                    <td>
                      <button
                        className="ad-table-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (onSelectComplaint) onSelectComplaint(item);
                        }}
                      >
                        View Details
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default ComplaintsTable;
