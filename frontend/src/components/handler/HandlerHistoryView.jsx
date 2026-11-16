import React, { useState, useMemo } from 'react';
import {
  Layers,
  ClipboardList,
  ArrowLeftRight,
  FileText,
  Search,
  RotateCcw,
  MessageCircle,
  CheckCircle2,
  Package,
} from 'lucide-react';
import { HandlerKPICard } from './HandlerKPICard';
import { HandlerStatusBadge } from './HandlerStatusBadge';
import { HandlerPagination } from './HandlerPagination';

export function HandlerHistoryView({
  auditLogs = [],
  kpiCounts,
  loading = false,
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedAction, setSelectedAction] = useState('all');
  const [selectedModule, setSelectedModule] = useState('all');
  const [selectedTimeframe, setSelectedTimeframe] = useState('30days');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);

  // Genuine KPI calculations
  const totalActivities = kpiCounts?.total_activities ?? auditLogs.length;
  const requestUpdates = kpiCounts?.request_updates ?? auditLogs.filter(
    (l) => (l.action || '').toLowerCase().includes('request')
  ).length;
  const handoffsCount = kpiCounts?.handoffs ?? auditLogs.filter(
    (l) => (l.action || '').toLowerCase().includes('handoff')
  ).length;
  const auditLogsCount = kpiCounts?.audit_logs ?? auditLogs.filter(
    (l) =>
      (l.action || '').toLowerCase().includes('status') ||
      (l.action || '').toLowerCase().includes('audit')
  ).length;

  const handleResetFilters = () => {
    setSearchTerm('');
    setSelectedAction('all');
    setSelectedModule('all');
    setSelectedTimeframe('30days');
    setCurrentPage(1);
  };

  const filtered = useMemo(() => {
    return auditLogs.filter((item) => {
      const actStr = (item.action || '').toLowerCase();
      const refStr = (item.reference_id || item.entity_id || '').toLowerCase();
      const modStr = (item.module || '').toLowerCase();

      if (selectedAction !== 'all') {
        if (!actStr.includes(selectedAction.toLowerCase())) return false;
      }

      if (selectedModule !== 'all') {
        if (selectedModule === 'returns' && !refStr.includes('trn') && !actStr.includes('request')) return false;
        if (selectedModule === 'complaints' && !refStr.includes('cmp') && !actStr.includes('complaint')) return false;
        if (selectedModule === 'handoffs' && !actStr.includes('handoff')) return false;
      }

      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const idStr = String(item.id || '');
        const detailsStr = String(item.details || '');
        const actorStr = String(item.performed_by || item.actor_email || '');
        return (
          idStr.toLowerCase().includes(q) ||
          refStr.includes(q) ||
          actStr.includes(q) ||
          detailsStr.toLowerCase().includes(q) ||
          actorStr.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [auditLogs, selectedAction, selectedModule, searchTerm]);

  const displayed = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const renderActionIcon = (actionText) => {
    const act = (actionText || '').toLowerCase();
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
            onChange={(e) => { setSelectedModule(e.target.value); setCurrentPage(1); }}
          >
            <option value="all">All Modules</option>
            <option value="returns">Returns</option>
            <option value="complaints">Complaints</option>
            <option value="handoffs">Handoffs</option>
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

      {/* History Table */}
      <div className="hd-card hd-table-card">
        <div className="hd-table-wrapper">
          <table className="hd-table">
            <thead>
              <tr>
                <th style={{ width: '180px' }}>TIMESTAMP</th>
                <th style={{ width: '180px' }}>ACTION</th>
                <th style={{ width: '130px' }}>REFERENCE ID</th>
                <th>DETAILS</th>
                <th style={{ width: '160px' }}>PERFORMED BY</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="5" className="hd-table-empty">
                    Loading audit history...
                  </td>
                </tr>
              ) : displayed.length === 0 ? (
                <tr>
                  <td colSpan="5" className="hd-table-empty">
                    No history records found matching the current criteria.
                  </td>
                </tr>
              ) : (
                displayed.map((log, idx) => {
                  const logId = log.id || idx;
                  const timestampStr = log.timestamp
                    ? new Date(log.timestamp).toLocaleString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                      })
                    : '—';
                  const actionStr = log.action || 'Request Updated';
                  const refId = log.reference_id || (log.entity_id ? `TRN-${log.entity_id}` : '—');
                  const performedBy = log.performed_by || log.actor_name || 'System';

                  return (
                    <tr key={logId}>
                      <td className="hd-cell-timestamp">{timestampStr}</td>
                      <td>
                        <div className="hd-history-action-cell">
                          <span className="hd-history-action-icon">
                            {renderActionIcon(actionStr)}
                          </span>
                          <span className="hd-history-action-name">{actionStr}</span>
                        </div>
                      </td>
                      <td className="hd-cell-id">{refId}</td>
                      <td>
                        <div className="hd-history-details-cell">
                          {log.new_status ? (
                            <>
                              <span className="hd-cell-subtle">Status changed to </span>
                              <HandlerStatusBadge status={log.new_status} />
                            </>
                          ) : (
                            <span className="hd-cell-subtle">{log.details || 'Action completed'}</span>
                          )}
                        </div>
                      </td>
                      <td className="hd-cell-subtle">{performedBy}</td>
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

export default HandlerHistoryView;
