import React, { useState, useEffect, useMemo } from 'react';
import { ShoppingCart } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { handlerService } from '../../services/handlerService';
import { formatConfidence } from '../../utils/formatConfidence';
import './HandlerDashboard.css';

export function HandlerDashboard({ onNavigate }) {
  const { user, logout } = useAuth();

  // State
  const [complaints, setComplaints] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [selectedComplaint, setSelectedComplaint] = useState(null);
  const [activeTab, setActiveTab] = useState('complaints'); // 'complaints' | 'history'
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null); // { type: 'success' | 'error', message: '' }

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  // Redirection form state
  const [targetDeptId, setTargetDeptId] = useState('');
  const [redirectReason, setRedirectReason] = useState('further_processing');
  const [submittingRedirect, setSubmittingRedirect] = useState(false);
  const [submittingStatus, setSubmittingStatus] = useState(false);

  // Redirection history state
  const [historyList, setHistoryList] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Auto-dismiss toast
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 4500);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // Load complaints and departments
  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [complaintsData, deptsData] = await Promise.all([
        handlerService.getAssignedComplaints(),
        handlerService.getDepartments().catch(() => []),
      ]);

      const list = Array.isArray(complaintsData) ? complaintsData : [];
      setComplaints(list);
      setDepartments(Array.isArray(deptsData) ? deptsData : []);

      // Retain or select first complaint
      if (list.length > 0) {
        setSelectedComplaint((prev) => {
          if (!prev) return list[0];
          const found = list.find((c) => c.id === prev.id);
          return found || list[0];
        });
      } else {
        setSelectedComplaint(null);
      }
    } catch (err) {
      console.error('Failed to load handler data:', err);
      setError(err.message || 'Failed to load department complaints. Please ensure you are logged in as a department handler.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Fetch history when selected complaint changes and active tab is history
  useEffect(() => {
    if (selectedComplaint && activeTab === 'history') {
      fetchHistory(selectedComplaint.id);
    }
  }, [selectedComplaint, activeTab]);

  const fetchHistory = async (complaintId) => {
    setLoadingHistory(true);
    try {
      const data = await handlerService.getRedirectionHistory(complaintId);
      setHistoryList(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to load history:', err);
      setHistoryList([]);
    } finally {
      setLoadingHistory(false);
    }
  };

  // KPI Calculations
  const kpiStats = useMemo(() => {
    const total = complaints.length;
    const pending = complaints.filter((c) => (c.status || '').toLowerCase() === 'pending').length;
    const followedUp = complaints.filter((c) => (c.status || '').toLowerCase() === 'followed_up').length;
    const resolved = complaints.filter((c) => (c.status || '').toLowerCase() === 'resolved').length;
    return { total, pending, followedUp, resolved };
  }, [complaints]);

  // Filtered complaints list
  const filteredComplaints = useMemo(() => {
    return complaints.filter((item) => {
      // Status filter
      if (statusFilter !== 'all') {
        const itemStatus = (item.status || '').toLowerCase();
        if (itemStatus !== statusFilter) return false;
      }
      // Search term filter
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const text = (item.complaint_text || '').toLowerCase();
        const email = (item.user_email || '').toLowerCase();
        const name = (item.user_name || '').toLowerCase();
        const idStr = String(item.id);
        return text.includes(q) || email.includes(q) || name.includes(q) || idStr.includes(q);
      }
      return true;
    });
  }, [complaints, statusFilter, searchTerm]);

  // Handle status update
  const handleStatusChange = async (newStatus) => {
    if (!selectedComplaint || submittingStatus) return;
    setSubmittingStatus(true);
    try {
      const updated = await handlerService.updateComplaintStatus(selectedComplaint.id, newStatus);
      setToast({ type: 'success', message: `Complaint #${selectedComplaint.id} marked as ${newStatus}.` });

      // Update state
      setComplaints((prev) =>
        prev.map((c) => (c.id === selectedComplaint.id ? { ...c, status: newStatus } : c))
      );
      setSelectedComplaint((prev) => (prev ? { ...prev, status: newStatus } : null));
    } catch (err) {
      setToast({ type: 'error', message: err.message || 'Failed to update status.' });
    } finally {
      setSubmittingStatus(false);
    }
  };

  // Handle redirection
  const handleRedirectSubmit = async (e) => {
    e.preventDefault();
    if (!selectedComplaint || !targetDeptId || submittingRedirect) return;

    setSubmittingRedirect(true);
    try {
      await handlerService.redirectComplaint(
        selectedComplaint.id,
        parseInt(targetDeptId, 10),
        redirectReason
      );

      const targetDept = departments.find((d) => d.id === parseInt(targetDeptId, 10));
      setToast({
        type: 'success',
        message: `Complaint #${selectedComplaint.id} redirected to ${targetDept ? targetDept.name : 'new department'}.`,
      });

      // Reset form
      setTargetDeptId('');

      // Refresh list as redirected complaint leaves this department
      await loadData();
    } catch (err) {
      setToast({ type: 'error', message: err.message || 'Failed to redirect complaint.' });
    } finally {
      setSubmittingRedirect(false);
    }
  };

  // Format date helper
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

  // Status badge helper
  const renderStatusBadge = (status) => {
    const s = (status || 'pending').toLowerCase();
    const label = s === 'followed_up' ? 'Followed Up' : s;
    return <span className={`hd-status-badge ${s}`}>{label}</span>;
  };

  return (
    <div className="hd-layout">
      {/* Toast Alert */}
      {toast && (
        <div className={`hd-toast ${toast.type}`}>
          <span>{toast.message}</span>
          <button className="hd-toast-close" onClick={() => setToast(null)}>✕</button>
        </div>
      )}

      {/* 1. Left Sidebar (#183A34) */}
      <aside className="hd-sidebar">
        <div
          className="hd-sidebar-brand"
          onClick={() => onNavigate && onNavigate('home')}
          role="button"
          tabIndex={0}
          style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '9px' }}
          title="Back to Flatkart Store"
        >
          <ShoppingCart size={22} strokeWidth={2.4} color="#FFFFFF" />
          <span className="hd-sidebar-brand-text">Flatkart</span>
        </div>
        <nav className="hd-sidebar-nav">
          <button
            className={`hd-sidebar-item ${activeTab === 'complaints' ? 'active' : ''}`}
            onClick={() => setActiveTab('complaints')}
          >
            <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
            Assigned Complaints
          </button>

          <button
            className={`hd-sidebar-item ${activeTab === 'history' ? 'active' : ''}`}
            onClick={() => {
              setActiveTab('history');
              if (selectedComplaint) fetchHistory(selectedComplaint.id);
            }}
          >
            <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Redirection History
          </button>

          <button
            className="hd-sidebar-item logout-item"
            onClick={() => {
              logout();
              if (onNavigate) onNavigate('login');
            }}
          >
            <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Sign Out
          </button>
        </nav>
      </aside>

      {/* Main Content Area */}
      <div className="hd-main-wrapper">
        {/* 2. Top Bar (#122D29) */}
        <header className="hd-topbar">
          <div className="hd-topbar-title">Handler Dashboard</div>
          <div className="hd-topbar-user">
            <div className="hd-topbar-user-info">
              <span className="hd-topbar-user-name">{user?.name || 'Department Handler'}</span>
              <span className="hd-topbar-user-dept">
                {selectedComplaint?.current_department
                  ? `${selectedComplaint.current_department} Dept`
                  : user?.role === 'department_handler'
                  ? 'Department Team'
                  : user?.email}
              </span>
            </div>
            <div className="hd-topbar-avatar">
              {(user?.name || 'H').charAt(0).toUpperCase()}
            </div>
          </div>
        </header>

        {/* 3. Body Content */}
        <main className="hd-content">
          <div className="hd-section-tag">Overview & Resolution</div>
          <h1 className="hd-page-title">
            {activeTab === 'complaints' ? 'Assigned Complaints' : 'Redirection Audit Trail'}
          </h1>
          <p className="hd-page-subtitle">
            Manage customer complaints assigned to your department, review AI categorizations, and route cases.
          </p>

          {/* 4. KPI Cards Row */}
          <div className="hd-kpi-row">
            <div className="hd-kpi-card">
              <div className="hd-kpi-label">Total Assigned</div>
              <div className="hd-kpi-value">{kpiStats.total}</div>
              <div className="hd-kpi-sub">In your department</div>
            </div>
            <div className="hd-kpi-card">
              <div className="hd-kpi-label">Pending Action</div>
              <div className="hd-kpi-value" style={{ color: '#C86830' }}>{kpiStats.pending}</div>
              <div className="hd-kpi-sub">Awaiting review</div>
            </div>
            <div className="hd-kpi-card">
              <div className="hd-kpi-label">Followed Up</div>
              <div className="hd-kpi-value" style={{ color: '#4558A6' }}>{kpiStats.followedUp}</div>
              <div className="hd-kpi-sub">In progress</div>
            </div>
            <div className="hd-kpi-card">
              <div className="hd-kpi-label">Resolved</div>
              <div className="hd-kpi-value" style={{ color: '#3A6943' }}>{kpiStats.resolved}</div>
              <div className="hd-kpi-sub">Successfully closed</div>
            </div>
          </div>

          {/* Loading / Error States */}
          {loading ? (
            <div className="hd-table-loading">
              <svg className="animate-spin" width="22" height="22" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
              </svg>
              <span>Loading department records...</span>
            </div>
          ) : error ? (
            <div className="hd-error-state">
              <div className="hd-error-icon">!</div>
              <div className="hd-error-title">Unable to Load Complaints</div>
              <p className="hd-error-desc">{error}</p>
              <button className="hd-retry-btn" onClick={loadData}>
                Try Again
              </button>
            </div>
          ) : activeTab === 'history' ? (
            /* History Tab View */
            <div className="hd-table-panel">
              <div className="hd-table-header">
                <div>
                  <h2 className="hd-table-title">
                    {selectedComplaint
                      ? `Redirection History for #${selectedComplaint.id}`
                      : 'Redirection History'}
                  </h2>
                  <span className="hd-table-count">
                    {selectedComplaint
                      ? `Viewing transfers for Complaint #${selectedComplaint.id}`
                      : 'Select a complaint from the list to view its transfer logs'}
                  </span>
                </div>
                <button
                  className="hd-status-btn"
                  onClick={() => setActiveTab('complaints')}
                >
                  Back to Complaints
                </button>
              </div>

              {loadingHistory ? (
                <div className="hd-table-loading">Loading redirection history...</div>
              ) : historyList.length === 0 ? (
                <div className="hd-table-empty">
                  <div className="hd-table-empty-icon">✓</div>
                  <div className="hd-table-empty-title">No Transfers Logged</div>
                  <div className="hd-table-empty-desc">
                    {selectedComplaint
                      ? 'This complaint has not been redirected between departments yet.'
                      : 'Select a complaint to inspect its redirection audit trail.'}
                  </div>
                </div>
              ) : (
                <table className="hd-history-table">
                  <thead>
                    <tr>
                      <th>Transfer ID</th>
                      <th>From Department</th>
                      <th>To Department</th>
                      <th>Redirected By</th>
                      <th>Reason</th>
                      <th>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historyList.map((hist) => (
                      <tr key={hist.id}>
                        <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>#{hist.id}</td>
                        <td>{hist.from_department}</td>
                        <td><strong>{hist.to_department}</strong></td>
                        <td>{hist.redirected_by_name}</td>
                        <td>
                          <span className="hd-status-badge pending">
                            {hist.reason === 'model_fault' ? 'AI Model Fault' : 'Further Processing'}
                          </span>
                        </td>
                        <td>{formatDate(hist.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          ) : (
            /* 5. Workspace Grid (Complaints Table + Details Panel) */
            <div className="hd-workspace">
              {/* Left Side: Table */}
              <div className="hd-table-panel">
                <div className="hd-table-header">
                  <div>
                    <h2 className="hd-table-title">Assigned Complaints</h2>
                    <span className="hd-table-count">
                      Showing {filteredComplaints.length} of {complaints.length} tickets
                    </span>
                  </div>
                </div>

                {/* Filters */}
                <div className="hd-table-filters">
                  <div className="hd-table-search">
                    <svg
                      className="hd-table-search-icon"
                      width="16"
                      height="16"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                      />
                    </svg>
                    <input
                      type="text"
                      placeholder="Search by ticket ID, email, or issue..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </div>

                  <select
                    className="hd-table-status-filter"
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                  >
                    <option value="all">All Statuses</option>
                    <option value="pending">Pending</option>
                    <option value="followed_up">Followed Up</option>
                    <option value="resolved">Resolved</option>
                  </select>
                </div>

                {/* Table Content */}
                {filteredComplaints.length === 0 ? (
                  <div className="hd-table-empty">
                    <div className="hd-table-empty-icon">✓</div>
                    <div className="hd-table-empty-title">No complaints found</div>
                    <div className="hd-table-empty-desc">
                      {searchTerm || statusFilter !== 'all'
                        ? 'Try adjusting your search query or filter.'
                        : 'No complaints are currently assigned to your department.'}
                    </div>
                  </div>
                ) : (
                  <table className="hd-complaints-table">
                    <thead>
                      <tr>
                        <th>Ticket ID</th>
                        <th>Complaint Summary</th>
                        <th>Customer</th>
                        <th>Status</th>
                        <th>Created</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredComplaints.map((item) => {
                        const isSelected = selectedComplaint?.id === item.id;
                        return (
                          <tr
                            key={item.id}
                            className={isSelected ? 'selected' : ''}
                            onClick={() => setSelectedComplaint(item)}
                          >
                            <td className={`hd-td-id ${isSelected ? 'active-row' : ''}`}>
                              #{item.id}
                            </td>
                            <td className="hd-td-complaint" title={item.complaint_text}>
                              {item.complaint_text}
                            </td>
                            <td className="hd-td-email">
                              <div>{item.user_name || 'Customer'}</div>
                              <div style={{ fontSize: '11.5px', color: '#909B9D' }}>
                                {item.user_email || `User #${item.user_id}`}
                              </div>
                            </td>
                            <td>{renderStatusBadge(item.status)}</td>
                            <td className="hd-td-date">{formatDate(item.create_at)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}

                <div className="hd-table-footer">
                  Select any ticket above to view details, update status, or route to another department.
                </div>
              </div>

              {/* Right Side: Details Panel */}
              <div className="hd-details-panel">
                {selectedComplaint ? (
                  <>
                    <div className="hd-details-header">
                      <div>
                        <div className="hd-details-title">Ticket #{selectedComplaint.id}</div>
                        <div className="hd-details-sub">Complaint Details & Workflow</div>
                      </div>
                      {renderStatusBadge(selectedComplaint.status)}
                    </div>

                    <div className="hd-details-body">
                      {/* Customer Card */}
                      <div className="hd-customer-card">
                        <div className="hd-customer-avatar">
                          {(selectedComplaint.user_name || 'C').charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="hd-customer-name">
                            {selectedComplaint.user_name || 'Registered Customer'}
                          </div>
                          <div className="hd-customer-email">
                            {selectedComplaint.user_email || `User #${selectedComplaint.user_id}`}
                          </div>
                        </div>
                      </div>

                      {/* Meta Attributes */}
                      <div className="hd-meta-grid">
                        <div className="hd-meta-item">
                          <span className="hd-meta-label">Current Dept</span>
                          <span className="hd-meta-value">
                            {selectedComplaint.current_department}
                          </span>
                        </div>
                        <div className="hd-meta-item">
                          <span className="hd-meta-label">Predicted Dept</span>
                          <span className="hd-meta-value">
                            {selectedComplaint.predicted_department}
                          </span>
                        </div>
                        <div className="hd-meta-item">
                          <span className="hd-meta-label">AI Confidence</span>
                          <span className="hd-meta-value">
                            {formatConfidence(selectedComplaint.confidence) || 'N/A'}
                          </span>
                        </div>
                        <div className="hd-meta-item">
                          <span className="hd-meta-label">Submitted On</span>
                          <span className="hd-meta-value">
                            {formatDate(selectedComplaint.create_at)}
                          </span>
                        </div>
                      </div>

                      {/* Complaint Text */}
                      <div className="hd-complaint-summary">
                        <div className="hd-complaint-summary-label">Complaint Description</div>
                        <div className="hd-complaint-summary-text">
                          {selectedComplaint.complaint_text}
                        </div>
                      </div>

                      {/* Status Update Buttons */}
                      <div>
                        <div className="hd-redirect-label" style={{ marginBottom: 6 }}>
                          Update Status
                        </div>
                        <div className="hd-status-actions">
                          <button
                            type="button"
                            className={`hd-status-btn ${
                              selectedComplaint.status === 'pending' ? 'current' : ''
                            }`}
                            disabled={submittingStatus || selectedComplaint.status === 'pending'}
                            onClick={() => handleStatusChange('pending')}
                          >
                            Pending
                          </button>
                          <button
                            type="button"
                            className={`hd-status-btn ${
                              selectedComplaint.status === 'followed_up' ? 'current' : ''
                            }`}
                            disabled={submittingStatus || selectedComplaint.status === 'followed_up'}
                            onClick={() => handleStatusChange('followed_up')}
                          >
                            Follow Up
                          </button>
                          <button
                            type="button"
                            className={`hd-status-btn ${
                              selectedComplaint.status === 'resolved' ? 'current' : ''
                            }`}
                            disabled={submittingStatus || selectedComplaint.status === 'resolved'}
                            onClick={() => handleStatusChange('resolved')}
                          >
                            Resolved
                          </button>
                        </div>
                      </div>

                      {/* Department Redirection Section */}
                      <form className="hd-redirect-section" onSubmit={handleRedirectSubmit}>
                        <div className="hd-redirect-title">Redirect Complaint</div>

                        <div className="hd-redirect-field">
                          <label className="hd-redirect-label">Target Department</label>
                          <select
                            className="hd-redirect-select"
                            value={targetDeptId}
                            onChange={(e) => setTargetDeptId(e.target.value)}
                            required
                          >
                            <option value="">Select destination department...</option>
                            {departments
                              .filter((d) => d.id !== selectedComplaint.department_id)
                              .map((dept) => (
                                <option key={dept.id} value={dept.id}>
                                  {dept.name}
                                </option>
                              ))}
                          </select>
                        </div>

                        <div className="hd-redirect-field">
                          <label className="hd-redirect-label">Redirection Reason</label>
                          <select
                            className="hd-redirect-select"
                            value={redirectReason}
                            onChange={(e) => setRedirectReason(e.target.value)}
                          >
                            <option value="model_fault">AI Classification Fault</option>
                            <option value="further_processing">Requires Further Processing</option>
                          </select>
                        </div>

                        <button
                          type="submit"
                          className="hd-redirect-btn"
                          disabled={submittingRedirect || !targetDeptId}
                        >
                          {submittingRedirect ? 'Redirecting...' : 'Redirect to Department'}
                        </button>
                      </form>

                      {/* Audit Trail Link */}
                      <button
                        type="button"
                        className="hd-status-btn"
                        style={{ marginTop: 4, width: '100%' }}
                        onClick={() => {
                          setActiveTab('history');
                          fetchHistory(selectedComplaint.id);
                        }}
                      >
                        View Redirection History
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="hd-details-placeholder">
                    <div className="hd-details-placeholder-icon">📋</div>
                    <div style={{ fontWeight: 700, marginBottom: 4 }}>No Ticket Selected</div>
                    <div style={{ fontSize: '13px' }}>
                      Click on any complaint from the table to view its full details and workflow options.
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

export default HandlerDashboard;
