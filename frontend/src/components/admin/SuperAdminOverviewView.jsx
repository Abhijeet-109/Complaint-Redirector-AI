import React, { useState, useMemo } from 'react';
import {
  FileText,
  Clock,
  CheckCircle2,
  TrendingUp,
  Users,
  Building2,
  UserCheck,
  ShieldAlert,
  Bot,
  GitCompare,
  Search,
  RefreshCw,
  ArrowRight,
  Eye,
  EyeOff,
} from 'lucide-react';
import { MetricCard } from './MetricCard';
import { DepartmentComplaintChart } from './DepartmentComplaintChart';
import { DepartmentRedirections } from './DepartmentRedirections';
import { DepartmentTransferInsights } from './DepartmentTransferInsights';
import { ComplaintStatusBadge } from '../complaints/ComplaintStatusBadge';
import { formatConfidence } from '../../utils/formatConfidence';
import { HandlerPagination } from '../handler/HandlerPagination';

export function SuperAdminOverviewView({
  complaints = [],
  departments = [],
  users = [],
  redirectionData = { summary: {}, by_department_route: [] },
  onNavigate,
  onRefresh,
  isSuperAdmin = true,
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [deptFilter, setDeptFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);
  const [refreshing, setRefreshing] = useState(false);
  const [showCount, setShowCount] = useState(true);

  // Derived user categories
  const regularUsers = useMemo(() => users.filter((u) => u.role === 'user'), [users]);
  const departmentHandlers = useMemo(
    () => users.filter((u) => u.role === 'department_handler'),
    [users]
  );
  const adminUsers = useMemo(
    () => users.filter((u) => u.role === 'admin' || u.role === 'super_admin'),
    [users]
  );

  // Complaint Status Aggregates
  const resolvedCount = useMemo(() => {
    return complaints.filter((c) => {
      const s = (c.status || '').toLowerCase();
      return s === 'resolved' || s === 'completed';
    }).length;
  }, [complaints]);

  const pendingCount = useMemo(() => {
    return complaints.filter((c) => {
      const s = (c.status || '').toLowerCase();
      return s === 'pending' || s === 'open';
    }).length;
  }, [complaints]);

  const followedUpCount = useMemo(() => {
    return complaints.filter((c) => {
      const s = (c.status || '').toLowerCase();
      return s === 'followed_up' || s === 'in_progress';
    }).length;
  }, [complaints]);

  // Handle Refresh
  const handleRefreshClick = async () => {
    if (!onRefresh) return;
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setTimeout(() => setRefreshing(false), 500);
    }
  };

  // Recent complaints sorted chronologically descending
  const sortedComplaints = useMemo(() => {
    return [...complaints].sort((a, b) => {
      const dateA = new Date(a.create_at || 0).getTime();
      const dateB = new Date(b.create_at || 0).getTime();
      if (dateA !== dateB) return dateB - dateA;
      return (b.id || 0) - (a.id || 0);
    });
  }, [complaints]);

  // Filtered recent complaints
  const filteredRecentComplaints = useMemo(() => {
    return sortedComplaints.filter((item) => {
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

      // Search term filter
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
  }, [sortedComplaints, statusFilter, deptFilter, searchTerm]);

  // Pagination for Recent Complaints table
  const totalPages = Math.max(1, Math.ceil(filteredRecentComplaints.length / pageSize));
  const safeCurrentPage = Math.min(Math.max(1, currentPage), totalPages);

  const paginatedComplaints = useMemo(() => {
    const start = (safeCurrentPage - 1) * pageSize;
    return filteredRecentComplaints.slice(start, start + pageSize);
  }, [filteredRecentComplaints, safeCurrentPage, pageSize]);

  const handleResetFilters = () => {
    setSearchTerm('');
    setStatusFilter('all');
    setDeptFilter('all');
    setCurrentPage(1);
  };

  // Up to 6 Quick Actions (all navigate to existing destinations)
  const quickActions = [
    { label: 'View Complaints', icon: FileText, view: 'complaints' },
    { label: 'Redirection Analytics', icon: GitCompare, view: 'analytics' },
    { label: 'Manage Users', icon: Users, view: 'users' },
    { label: 'Manage Departments', icon: Building2, view: 'departments' },
    { label: 'Manage Dept. Handlers', icon: UserCheck, view: 'handlers' },
    { label: 'Chatbot & Pipeline', icon: Bot, view: 'pipeline' },
  ];

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
    <div className="ad-overview-container">
      {/* 0. Header Row */}
      <div className="ad-header-row">
        <div>
          <h1 className="ad-page-heading">Overview</h1>
          <p className="ad-page-subtext">
            Operational snapshot across the complaint redirection system.
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div className="ad-live-pill">Live System Data</div>
          <button
            type="button"
            className="ad-refresh-circle-btn"
            onClick={handleRefreshClick}
            disabled={refreshing}
            title="Refresh dashboard data"
            aria-label="Refresh dashboard data"
          >
            <RefreshCw
              size={15}
              className={refreshing ? 'ad-spin-icon' : ''}
            />
          </button>
        </div>
      </div>

      {/* ================================================================
          LAYER 1: Left (Big KPI + 3 Statuses) | Right (Admin KPIs + Redirections)
          ================================================================ */}
      <div className="ad-overview-layer-1">
        {/* Left Column: Primary Complaints KPI + Statuses + Quick Actions */}
        <div className="ad-layer1-left-col">
          <div className="ad-primary-kpi-card">
            <div>
              <div className="ad-primary-kpi-header">
                <span className="ad-primary-kpi-label">TOTAL COMPLAINTS</span>
                <button
                  type="button"
                  className="ad-eye-toggle-btn"
                  onClick={() => setShowCount(!showCount)}
                  title={showCount ? 'Hide count' : 'Show count'}
                  aria-label={showCount ? 'Hide count' : 'Show count'}
                >
                  {showCount ? <Eye size={15} /> : <EyeOff size={15} />}
                </button>
              </div>

              <div className="ad-primary-kpi-value">
                {showCount ? complaints.length.toLocaleString() : '••••'}
              </div>
              <div className="ad-primary-kpi-sub">
                All registered complaint records across departments
              </div>

              {/* Two Smaller KPI Cards inside the main card */}
              <div className="ad-primary-mini-kpis">
                <div className="ad-mini-kpi-box resolved">
                  <div className="ad-mini-kpi-top">
                    <span className="ad-mini-kpi-label">RESOLVED</span>
                    <CheckCircle2 size={15} className="ad-mini-kpi-icon" />
                  </div>
                  <div className="ad-mini-kpi-val">{resolvedCount}</div>
                  <div className="ad-mini-kpi-sub">Closed successfully</div>
                </div>

                <div className="ad-mini-kpi-box pending">
                  <div className="ad-mini-kpi-top">
                    <span className="ad-mini-kpi-label">PENDING</span>
                    <Clock size={15} className="ad-mini-kpi-icon" />
                  </div>
                  <div className="ad-mini-kpi-val">{pendingCount}</div>
                  <div className="ad-mini-kpi-sub">Awaiting action</div>
                </div>
              </div>
            </div>

            {/* Quick Actions (Maximum 6) */}
            <div className="ad-quick-actions-section">
              <div className="ad-quick-actions-title">Quick Actions</div>
              <div className="ad-quick-actions-grid">
                {quickActions.map(({ label, icon: Icon, view }) => (
                  <button
                    key={view}
                    type="button"
                    className="ad-quick-action-btn"
                    onClick={() => onNavigate && onNavigate(view)}
                  >
                    <div className="ad-quick-action-icon">
                      <Icon size={18} strokeWidth={1.8} />
                    </div>
                    <span className="ad-quick-action-label">{label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: 3 Administration KPIs at top + Department Redirections Below */}
        <div className="ad-layer1-right-col">
          {/* 1.3 Three Administration KPIs in required order: Total Users, Total Dept Handlers, Total Admins */}
          <div className="ad-overview-admin-kpis">
            <MetricCard
              label="Total Users"
              value={regularUsers.length}
              sub="Live Accounts"
              icon={Users}
            />
            <MetricCard
              label="Total Dept Handlers"
              value={departmentHandlers.length}
              sub="Staff Active"
              icon={UserCheck}
            />
            <MetricCard
              label="Total Admins"
              value={adminUsers.length}
              sub="Super Admin View"
              icon={ShieldAlert}
            />
          </div>

          {/* 1.4 Department Redirections Table (occupies remaining height, max 4 preview rows) */}
          <div className="ad-layer1-redirections-wrap">
            <DepartmentRedirections
              redirectionData={redirectionData}
              maxRows={4}
              onNavigate={onNavigate}
            />
          </div>
        </div>
      </div>

      {/* ================================================================
          LAYER 2: Two Equal-Sized Analytical / Operational Cards
          Complaints by Department (Left) | Department Transfer Insights (Right)
          ================================================================ */}
      <div className="ad-overview-layer-2">
        <DepartmentComplaintChart
          complaints={complaints}
          departments={departments}
        />
        <DepartmentTransferInsights
          redirectionData={redirectionData}
        />
      </div>

      {/* ================================================================
          LAYER 3: Recent Complaints Table (Full-Width, Fixed Proportions)
          ================================================================ */}
      <div className="ad-table-panel ad-recent-complaints-panel">
        <div className="ad-table-panel-header-row">
          <div>
            <h2 className="ad-table-panel-title">Recent Complaints</h2>
            <p className="ad-table-panel-sub">
              Real-time synchronized complaint records and department assignments
            </p>
          </div>
          <button
            type="button"
            className="ad-view-all-link"
            onClick={() => onNavigate && onNavigate('complaints')}
          >
            <span>View All Complaints</span>
            <ArrowRight size={14} />
          </button>
        </div>

        {/* Search & Filter Toolbar */}
        <div className="ad-table-toolbar">
          <div className="ad-search-box">
            <Search className="ad-search-icon" size={16} />
            <input
              type="text"
              placeholder="Search complaints, customer, or department..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
            />
          </div>

          <select
            className="ad-select-filter"
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setCurrentPage(1);
            }}
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
            onChange={(e) => {
              setDeptFilter(e.target.value);
              setCurrentPage(1);
            }}
            aria-label="Filter by department"
          >
            <option value="all">All departments</option>
            {departments.map((dept) => (
              <option key={dept.id} value={dept.name}>
                {dept.name}
              </option>
            ))}
          </select>

          <button className="ad-btn-reset" onClick={handleResetFilters}>
            Reset
          </button>
        </div>

        {/* Complaints Table with explicit column proportions: 8%, 22%, 15%, 16%, 11%, 19%, 9% */}
        {filteredRecentComplaints.length === 0 ? (
          <div style={{ padding: '40px 20px', textAlign: 'center', color: '#637073', fontSize: '13.5px' }}>
            No recent complaints match the selected criteria.
          </div>
        ) : (
          <div className="ad-recent-table-scroll-wrap">
            <table className="ad-data-table ad-recent-complaints-table">
              <colgroup>
                <col style={{ width: '8%' }} />
                <col style={{ width: '22%' }} />
                <col style={{ width: '15%' }} />
                <col style={{ width: '16%' }} />
                <col style={{ width: '11%' }} />
                <col style={{ width: '19%' }} />
                <col style={{ width: '9%' }} />
              </colgroup>
              <thead>
                <tr>
                  <th>Complaint ID</th>
                  <th>Complaint Summary</th>
                  <th>Customer</th>
                  <th>Current Department</th>
                  <th>Submitted</th>
                  <th>Status &amp; Confidence</th>
                  <th style={{ textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {paginatedComplaints.map((item) => (
                  <tr
                    key={item.id}
                    className="ad-clickable-row"
                    onClick={() => onNavigate && onNavigate('complaints', item.id)}
                    title="Click to open complaint details"
                  >
                    <td style={{ fontFamily: 'monospace', fontWeight: '700' }}>#{item.id}</td>
                    <td
                      className="ad-cell-summary-truncate"
                      title={item.complaint_text}
                    >
                      {item.complaint_text}
                    </td>
                    <td>
                      <div style={{ fontWeight: '600', color: 'var(--fk-text-primary)' }}>
                        {item.user_name || 'Customer'}
                      </div>
                      <div style={{ fontSize: '11px', color: '#748082' }}>
                        {item.user_email || '—'}
                      </div>
                    </td>
                    <td>
                      <strong>{item.current_department || '—'}</strong>
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>{formatDate(item.create_at)}</td>
                    <td>
                      {/* Vertical stacked layout for status & confidence */}
                      <div className="ad-status-confidence-stack">
                        <ComplaintStatusBadge status={item.status} />
                        {formatConfidence(item.confidence) && (
                          <span className="ad-confidence-pill">
                            {formatConfidence(item.confidence)}
                          </span>
                        )}
                      </div>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        type="button"
                        className="ad-table-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (onNavigate) onNavigate('complaints', item.id);
                        }}
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Compact Table Pagination */}
        {filteredRecentComplaints.length > 0 && (
          <HandlerPagination
            currentPage={safeCurrentPage}
            pageSize={pageSize}
            totalItems={filteredRecentComplaints.length}
            onPageChange={setCurrentPage}
            onPageSizeChange={(newSize) => {
              setPageSize(newSize);
              setCurrentPage(1);
            }}
            pageSizeOptions={[5, 10, 25]}
          />
        )}
      </div>
    </div>
  );
}

export default SuperAdminOverviewView;
