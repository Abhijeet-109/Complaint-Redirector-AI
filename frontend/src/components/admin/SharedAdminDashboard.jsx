import React, { useState, useEffect, useMemo } from 'react';
import {
  Users,
  Building2,
  UserCheck,
  ShieldAlert,
  FileText,
  Clock,
  CheckCircle2,
  TrendingUp,
  GitCompare,
} from 'lucide-react';
import { adminService } from '../../services/adminService';
import { AdminLayout } from './AdminLayout';
import { MetricCard } from './MetricCard';
import { DepartmentComplaintChart } from './DepartmentComplaintChart';
import { DepartmentRedirections } from './DepartmentRedirections';
import { ComplaintsTable } from './ComplaintsTable';
import { ComplaintDetailsPanel } from './ComplaintDetailsPanel';
import { ManagementTable } from './ManagementTable';
import { PipelineManagementView } from './pipeline/PipelineManagementView';

export function SharedAdminDashboard({ isSuperAdmin = false, onNavigate }) {
  // Navigation State
  const [currentView, setCurrentView] = useState(() => {
    const oauthPendingAt = Number(sessionStorage.getItem('flatkart_drive_oauth_pending_at'));
    const returningFromDriveOAuth = isSuperAdmin
      && oauthPendingAt > 0
      && Date.now() - oauthPendingAt < 10 * 60 * 1000;
    return returningFromDriveOAuth ? 'pipeline' : 'overview';
  });

  // Core Data
  const [users, setUsers] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [complaints, setComplaints] = useState([]);
  const [redirectionData, setRedirectionData] = useState({ summary: {}, by_department_route: [] });
  const [selectedComplaint, setSelectedComplaint] = useState(null);

  // Status & Modal States
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);
  const [isPipelineModalOpen, setIsPipelineModalOpen] = useState(false);

  // Auto-dismiss toast
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // Load all dashboard data
  const loadDashboardData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [usersRes, deptsRes, complaintsRes, redirRes] = await Promise.all([
        adminService.getUsers().catch(() => []),
        adminService.getDepartments().catch(() => []),
        adminService.getComplaints().catch(() => []),
        adminService.getRedirectionKpis().catch(() => ({ summary: {}, by_department_route: [] })),
      ]);

      const loadedComplaints = Array.isArray(complaintsRes) ? complaintsRes : [];
      setUsers(Array.isArray(usersRes) ? usersRes : []);
      setDepartments(Array.isArray(deptsRes) ? deptsRes : []);
      setComplaints(loadedComplaints);
      setRedirectionData(redirRes || { summary: {}, by_department_route: [] });

      if (loadedComplaints.length > 0 && !selectedComplaint) {
        setSelectedComplaint(loadedComplaints[0]);
      }
    } catch (err) {
      console.error('Failed to load admin dashboard data:', err);
      setError(err.message || 'Failed to load administrative data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboardData();
  }, []);

  // Filtered account lists
  const regularUsers = useMemo(() => users.filter((u) => u.role === 'user'), [users]);
  const departmentHandlers = useMemo(
    () => users.filter((u) => u.role === 'department_handler'),
    [users]
  );
  const adminUsers = useMemo(
    () => users.filter((u) => u.role === 'admin' || u.role === 'super_admin'),
    [users]
  );

  // KPI Calculations
  const kpis = useMemo(() => {
    const totalComplaints = complaints.length;
    const pending = complaints.filter((c) => (c.status || '').toLowerCase() === 'pending').length;
    const resolved = complaints.filter((c) => (c.status || '').toLowerCase() === 'resolved').length;
    const followedUp = complaints.filter((c) => (c.status || '').toLowerCase() === 'followed_up').length;
    const redirected = redirectionData?.summary?.total_complaints_forwarded || 0;

    return {
      totalUsers: regularUsers.length,
      totalDepartments: departments.length,
      totalHandlers: departmentHandlers.length,
      totalAdmins: adminUsers.length,
      totalComplaints,
      pending,
      resolved,
      followedUp,
      redirected,
    };
  }, [regularUsers, departments, departmentHandlers, adminUsers, complaints, redirectionData]);

  // CRUD Handlers for Users
  const handleCreateUser = async (data) => {
    await adminService.createUser(data);
    setToast({ type: 'success', message: 'User account created successfully.' });
    const fresh = await adminService.getUsers();
    setUsers(fresh);
  };

  const handleUpdateUser = async (id, data) => {
    await adminService.updateUser(id, data);
    setToast({ type: 'success', message: 'User account updated successfully.' });
    const fresh = await adminService.getUsers();
    setUsers(fresh);
  };

  const handleDeleteUser = async (id) => {
    await adminService.deleteUser(id);
    setToast({ type: 'success', message: 'User account deleted successfully.' });
    const fresh = await adminService.getUsers();
    setUsers(fresh);
  };

  // CRUD Handlers for Departments
  const handleCreateDepartment = async (data) => {
    await adminService.createDepartment(data);
    setToast({ type: 'success', message: 'Department created successfully.' });
    const fresh = await adminService.getDepartments();
    setDepartments(fresh);
  };

  const handleUpdateDepartment = async (id, data) => {
    await adminService.updateDepartment(id, data);
    setToast({ type: 'success', message: 'Department updated successfully.' });
    const fresh = await adminService.getDepartments();
    setDepartments(fresh);
  };

  const handleDeleteDepartment = async (id) => {
    await adminService.deleteDepartment(id);
    setToast({ type: 'success', message: 'Department deleted successfully.' });
    const fresh = await adminService.getDepartments();
    setDepartments(fresh);
  };

  return (
    <AdminLayout
      currentView={currentView}
      onSelectView={setCurrentView}
      isSuperAdmin={isSuperAdmin}
      onNavigate={onNavigate}
      portalTitle={currentView === 'pipeline' ? 'Super Admin / Knowledge Operations' : undefined}
    >
      {/* Toast Alert */}
      {toast && (
        <div className={`hd-toast ${toast.type}`}>
          <span>{toast.message}</span>
          <button className="hd-toast-close" onClick={() => setToast(null)}>✕</button>
        </div>
      )}

      {/* Loading & Error States */}
      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '350px', gap: '10px' }}>
          <span>Loading operational data...</span>
        </div>
      ) : error ? (
        <div className="hd-error-state">
          <div className="hd-error-icon">!</div>
          <div className="hd-error-title">Unable to Load Admin Dashboard</div>
          <p className="hd-error-desc">{error}</p>
          <button className="hd-retry-btn" onClick={loadDashboardData}>Try Again</button>
        </div>
      ) : (
        <>
          {/* ========================================================
              VIEW 1: OVERVIEW
              ======================================================== */}
          {currentView === 'overview' && (
            <>
              {/* Header */}
              <div className="ad-header-row">
                <div>
                  <h1 className="ad-page-heading">
                    {isSuperAdmin ? 'Overview' : 'Admin Overview'}
                  </h1>
                  <p className="ad-page-subtext">
                    Operational snapshot across the complaint redirection system.
                  </p>
                </div>
                <div className="ad-live-pill">
                  Live System Data
                </div>
              </div>

              {/* Section Tag */}
              <div className="ad-section-title">System at a Glance</div>

              {/* KPI Cards Row (9 cards for Super Admin, 8 cards for Admin) */}
              {isSuperAdmin ? (
                <div className="ad-kpi-grid-9">
                  <MetricCard label="Total Users" value={kpis.totalUsers} sub="Live Accounts" icon={Users} />
                  <MetricCard label="Departments" value={kpis.totalDepartments} sub="Active Units" icon={Building2} />
                  <MetricCard label="Department Handlers" value={kpis.totalHandlers} sub="Staff Active" icon={UserCheck} />
                  <MetricCard label="Admins" value={kpis.totalAdmins} sub="Super Admin View" icon={ShieldAlert} />
                  <MetricCard label="Total Complaints" value={kpis.totalComplaints} sub="All Records" icon={FileText} />
                  <MetricCard label="Pending" value={kpis.pending} sub="Awaiting Action" icon={Clock} color="#C86830" />
                  <MetricCard label="Resolved" value={kpis.resolved} sub="Closed Successfully" icon={CheckCircle2} color="#3A6943" />
                  <MetricCard label="Followed Up" value={kpis.followedUp} sub="In Progress" icon={TrendingUp} color="#4558A6" />
                  <MetricCard label="Complaints Redirected" value={kpis.redirected} sub="Unique Forwarded" icon={GitCompare} />
                </div>
              ) : (
                <div className="ad-kpi-grid-8">
                  <MetricCard label="Total Users" value={kpis.totalUsers} sub="Live Accounts" icon={Users} />
                  <MetricCard label="Departments" value={kpis.totalDepartments} sub="Active Units" icon={Building2} />
                  <MetricCard label="Department Handlers" value={kpis.totalHandlers} sub="Staff Active" icon={UserCheck} />
                  <MetricCard label="Total Complaints" value={kpis.totalComplaints} sub="All Records" icon={FileText} />
                  <MetricCard label="Pending" value={kpis.pending} sub="Awaiting Action" icon={Clock} color="#C86830" />
                  <MetricCard label="Resolved" value={kpis.resolved} sub="Closed Successfully" icon={CheckCircle2} color="#3A6943" />
                  <MetricCard label="Followed Up" value={kpis.followedUp} sub="In Progress" icon={TrendingUp} color="#4558A6" />
                  <MetricCard label="Complaints Redirected" value={kpis.redirected} sub="Unique Forwarded" icon={GitCompare} />
                </div>
              )}

              {/* Analytical Cards Row (Complaints by Dept + Redirection Breakdown) */}
              <div className="ad-analytics-row">
                <DepartmentComplaintChart complaints={complaints} departments={departments} />
                <DepartmentRedirections redirectionData={redirectionData} />
              </div>

              {/* Complaints Table + Details Panel */}
              <div className="ad-complaints-section">
                <ComplaintsTable
                  complaints={complaints}
                  departments={departments}
                  selectedComplaint={selectedComplaint}
                  onSelectComplaint={setSelectedComplaint}
                  title="Recent Complaints"
                />
                <ComplaintDetailsPanel complaint={selectedComplaint} />
              </div>

              {/* Super Admin Chatbot & Pipeline Ribbon */}
              {isSuperAdmin && (
                <div className="ad-pipeline-ribbon">
                  <div className="ad-pipeline-info">
                    <span className="ad-pipeline-title">Chatbot & Pipeline Management</span>
                    <span className="ad-pipeline-desc">
                      SUPER ADMIN ONLY · Knowledge base documents, indexing and chatbot performance configuration.
                    </span>
                  </div>
                  <button className="ad-pipeline-btn" onClick={() => setIsPipelineModalOpen(true)}>
                    Open pipeline console →
                  </button>
                </div>
              )}
            </>
          )}

          {/* ========================================================
              VIEW 2: MANAGE USERS
              ======================================================== */}
          {currentView === 'users' && (
            <>
              <div className="ad-header-row">
                <div>
                  <h1 className="ad-page-heading">Manage Users</h1>
                  <p className="ad-page-subtext">View, filter, create, and manage registered customer accounts.</p>
                </div>
              </div>
              <ManagementTable
                title="Users"
                type="user"
                items={regularUsers}
                onCreate={handleCreateUser}
                onUpdate={handleUpdateUser}
                onDelete={handleDeleteUser}
              />
            </>
          )}

          {/* ========================================================
              VIEW 3: MANAGE DEPARTMENTS
              ======================================================== */}
          {currentView === 'departments' && (
            <>
              <div className="ad-header-row">
                <div>
                  <h1 className="ad-page-heading">Manage Departments</h1>
                  <p className="ad-page-subtext">Define and oversee organizational departments and routing targets.</p>
                </div>
              </div>
              <ManagementTable
                title="Departments"
                type="department"
                items={departments}
                onCreate={handleCreateDepartment}
                onUpdate={handleUpdateDepartment}
                onDelete={handleDeleteDepartment}
              />
            </>
          )}

          {/* ========================================================
              VIEW 4: MANAGE DEPARTMENT HANDLERS
              ======================================================== */}
          {currentView === 'handlers' && (
            <>
              <div className="ad-header-row">
                <div>
                  <h1 className="ad-page-heading">Manage Department Handlers</h1>
                  <p className="ad-page-subtext">Assign and manage department staff responsible for complaint resolution.</p>
                </div>
              </div>
              <ManagementTable
                title="Department Handlers"
                type="handler"
                items={departmentHandlers}
                departments={departments}
                onCreate={handleCreateUser}
                onUpdate={handleUpdateUser}
                onDelete={handleDeleteUser}
              />
            </>
          )}

          {/* ========================================================
              VIEW 5: MANAGE ADMINS (SUPER ADMIN ONLY)
              ======================================================== */}
          {currentView === 'admins' && isSuperAdmin && (
            <>
              <div className="ad-header-row">
                <div>
                  <h1 className="ad-page-heading">Manage Admins</h1>
                  <p className="ad-page-subtext">Super Admin control for administrator staff accounts and roles.</p>
                </div>
              </div>
              <ManagementTable
                title="Admins"
                type="admin"
                items={adminUsers}
                onCreate={handleCreateUser}
                onUpdate={handleUpdateUser}
                onDelete={handleDeleteUser}
              />
            </>
          )}

          {/* ========================================================
              VIEW 6: COMPLAINTS OVERSIGHT
              ======================================================== */}
          {currentView === 'complaints' && (
            <>
              <div className="ad-header-row">
                <div>
                  <h1 className="ad-page-heading">Complaints Oversight</h1>
                  <p className="ad-page-subtext">All customer complaints across all departments with status details.</p>
                </div>
              </div>
              <div className="ad-complaints-section">
                <ComplaintsTable
                  complaints={complaints}
                  departments={departments}
                  selectedComplaint={selectedComplaint}
                  onSelectComplaint={setSelectedComplaint}
                  title="All Complaints"
                />
                <ComplaintDetailsPanel complaint={selectedComplaint} />
              </div>
            </>
          )}

          {/* ========================================================
              VIEW 7: REDIRECTION ANALYTICS
              ======================================================== */}
          {currentView === 'analytics' && (
            <>
              <div className="ad-header-row">
                <div>
                  <h1 className="ad-page-heading">Redirection Analytics</h1>
                  <p className="ad-page-subtext">Audit trail and department-to-department complaint routing metrics.</p>
                </div>
              </div>
              <DepartmentRedirections redirectionData={redirectionData} isFullView={true} />
            </>
          )}

          {/* ========================================================
              VIEW 8: CHATBOT & PIPELINE (SUPER ADMIN ONLY)
              ======================================================== */}
          {currentView === 'pipeline' && isSuperAdmin && (
            <PipelineManagementView />
          )}
        </>
      )}
    </AdminLayout>
  );
}

export default SharedAdminDashboard;
