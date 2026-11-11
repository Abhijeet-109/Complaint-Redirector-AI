import React, { useState, useMemo } from 'react';
import {
  Layers,
  ClipboardList,
  ArrowLeftRight,
  FileText,
  Search,
  Filter,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  MessageCircle,
  CheckCircle2,
  Package,
} from 'lucide-react';
import { HandlerKPICard } from './HandlerKPICard';
import { HandlerStatusBadge } from './HandlerStatusBadge';

export function HandlerHistoryView({
  auditLogs = [],
  loading = false,
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedAction, setSelectedAction] = useState('all');
  const [selectedModule, setSelectedModule] = useState('all');
  const [selectedTimeframe, setSelectedTimeframe] = useState('30days');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 5;

  const totalActivities = auditLogs.length > 0 ? auditLogs.length : 128;
  const requestUpdates = 56;
  const handoffsCount = 28;
  const auditLogsCount = 44;

  const initialLogs = useMemo(() => {
    if (auditLogs && auditLogs.length > 0) {
      return auditLogs.map((log, idx) => ({
        id: log.id || idx,
        timestamp: log.timestamp ? new Date(log.timestamp).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'Nov 10, 2026, 11:24 AM',
        action: log.action || 'Request Updated',
        referenceId: log.reference_id || `TRN-${1032 - idx}`,
        details: log.details || 'Status updated',
        performedBy: log.performed_by || 'Abhijeet (R&R)',
        newStatus: log.new_status,
      }));
    }
    return [
      { id: 1, timestamp: 'Nov 10, 2026, 11:24 AM', action: 'Request Updated', iconType: 'clipboard', referenceId: 'TRN-1032', detailsPrefix: 'Status changed to', statusBadge: 'Pending Review', performedBy: 'Abhijeet (R&R)' },
      { id: 2, timestamp: 'Nov 10, 2026, 10:16 AM', action: 'Handoff Initiated', iconType: 'handoff', referenceId: 'TRN-1031', details: 'Handoff to Order & Delivery', performedBy: 'Rahul (R&R)' },
      { id: 3, timestamp: 'Nov 9, 2026, 5:42 PM', action: 'Complaint Created', iconType: 'complaint', referenceId: 'CMP-1006', details: 'New complaint registered', performedBy: 'System' },
      { id: 4, timestamp: 'Nov 8, 2026, 4:20 PM', action: 'Status Updated', iconType: 'status', referenceId: 'TRN-1029', detailsPrefix: 'Status changed to', statusBadge: 'In Progress', performedBy: 'Sneha (R&R)' },
      { id: 5, timestamp: 'Nov 8, 2026, 2:11 PM', action: 'Request Resolved', iconType: 'resolved', referenceId: 'TRN-1028', detailsPrefix: 'Request marked as', statusBadge: 'Resolved', performedBy: 'Karan (R&R)' },
    ];
  }, [auditLogs]);

  const filtered = useMemo(() => {
    return initialLogs.filter((item) => {
      if (selectedAction !== 'all' && !item.action.toLowerCase().includes(selectedAction.toLowerCase())) return false;
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        return (
          item.referenceId.toLowerCase().includes(q) ||
          item.action.toLowerCase().includes(q) ||
          (item.details && item.details.toLowerCase().includes(q)) ||
          item.performedBy.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [initialLogs, selectedAction, searchTerm]);

  const displayed = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const renderActionIcon = (log) => {
    const act = (log.action || '').toLowerCase();
    if (act.includes('handoff')) return <ArrowLeftRight size={16} strokeWidth={1.8} />;
    if (act.includes('complaint')) return <MessageCircle size={16} strokeWidth={1.8} />;
    if (act.includes('status')) return <CheckCircle2 size={16} strokeWidth={1.8} />;
    if (act.includes('resolved')) return <Package size={16} strokeWidth={1.8} />;
    return <ClipboardList size={16} strokeWidth={1.8} />;
  };

  return (
    <div className="hd-page hd-history-page">
      {/* Page Header */}
      <div className="hd-page-header">
        <h2 className="hd-page-title">History & Audit</h2>
        <span className="hd-page-subtitle">
          Complete history of requests, complaints, handoffs, and all key actions.
        </span>
      </div>

      {/* 4 KPI Cards */}
      <div className="hd-kpi-row-4">
        <HandlerKPICard
          title="Total Activities"
          value={totalActivities}
          icon={Layers}
        />
        <HandlerKPICard
          title="Request Updates"
          value={requestUpdates}
          icon={ClipboardList}
        />
        <HandlerKPICard
          title="Handoffs"
          value={handoffsCount}
          icon={ArrowLeftRight}
        />
        <HandlerKPICard
          title="Audit Logs"
          value={auditLogsCount}
          icon={FileText}
        />
      </div>

      {/* Toolbar */}
      <div className="hd-toolbar-row hd-toolbar-full">
        <div className="hd-search-box hd-search-expanded">
          <Search size={16} className="hd-search-icon" />
          <input
            type="text"
            placeholder="Search by request ID, order ID, complaint ID, or user..."
            value={searchTerm}
            onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
            className="hd-search-input"
          />
        </div>

        <div className="hd-filters-cluster">
          <select
            className="hd-select"
            value={selectedAction}
            onChange={(e) => { setSelectedAction(e.target.value); setCurrentPage(1); }}
          >
            <option value="all">All Actions</option>
            <option value="update">Request Updated</option>
            <option value="handoff">Handoff Initiated</option>
            <option value="complaint">Complaint Created</option>
            <option value="status">Status Updated</option>
            <option value="resolved">Request Resolved</option>
          </select>

          <select
            className="hd-select"
            value={selectedModule}
            onChange={(e) => setSelectedModule(e.target.value)}
          >
            <option value="all">All Modules</option>
            <option value="returns">Returns</option>
            <option value="complaints">Complaints</option>
            <option value="handoffs">Handoffs</option>
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

      {/* History Table */}
      <div className="hd-card hd-table-card">
        <div className="hd-table-wrapper">
          <table className="hd-table">
            <thead>
              <tr>
                <th>
                  <div className="hd-th-sortable">
                    <span>TIMESTAMP</span>
                    <ArrowUpDown size={13} />
                  </div>
                </th>
                <th>ACTION</th>
                <th>REFERENCE ID</th>
                <th>DETAILS</th>
                <th>PERFORMED BY</th>
              </tr>
            </thead>
            <tbody>
              {displayed.map((log) => (
                <tr key={log.id}>
                  <td className="hd-cell-subtle">{log.timestamp}</td>
                  <td>
                    <div className="hd-action-cell">
                      <span className="hd-action-icon">{renderActionIcon(log)}</span>
                      <span className="hd-action-name">{log.action}</span>
                    </div>
                  </td>
                  <td className="hd-cell-id">{log.referenceId}</td>
                  <td>
                    <div className="hd-details-cell">
                      {log.statusBadge || log.newStatus ? (
                        <>
                          <span className="hd-cell-subtle">{log.detailsPrefix || 'Status changed to'}</span>
                          <HandlerStatusBadge status={log.statusBadge || log.newStatus} />
                        </>
                      ) : (
                        <span className="hd-cell-subtle">{log.details}</span>
                      )}
                    </div>
                  </td>
                  <td className="hd-cell-bold">{log.performedBy}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <div className="hd-pagination-row">
          <span className="hd-pagination-info">
            Showing 1-{displayed.length} of {totalActivities}
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
            <button type="button" className="hd-page-num-btn">26</button>
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

export default HandlerHistoryView;

