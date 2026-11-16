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
import { ComplaintsOversightView } from './ComplaintsOversightView';
import { SuperAdminOverviewView } from './SuperAdminOverviewView';
import { ManagementTable } from './ManagementTable';
import { PipelineManagementView } from './pipeline/PipelineManagementView';
import { ProductManagement } from './ProductManagement';
import { CategoryManagement } from './CategoryManagement';
import { ShipmentOptions } from './ShipmentOptions';
import { StoreDashboard } from './StoreDashboard';
import { OrderManagement } from './OrderManagement';
import { InventoryManagement } from './InventoryManagement';
import { PaymentHistory } from './PaymentHistory';
import { RefundManagement } from './RefundManagement';

export function SharedAdminDashboard({ isSuperAdmin = false, onNavigate }) {
  // Navigation State
  const [currentView, setCurrentView] = useState(() => {
    const oauthPendingAt = Number(sessionStorage.getItem('flatkart_drive_oauth_pending_at'));
    const returningFromDriveOAuth = isSuperAdmin
      && oauthPendingAt > 0
      && Date.now() - oauthPendingAt < 10 * 60 * 1000;
    return returningFromDriveOAuth ? 'pipeline' : 'overview';
  });
  const [focusedPaymentId, setFocusedPaymentId] = useState(null);
  const [focusedOrderId, setFocusedOrderId] = useState(null);
  const [focusedComplaintId, setFocusedComplaintId] = useState(null);

  const handleNavigateView = (view, targetId = null) => {
    if (view === 'payments' && targetId) {
      setFocusedPaymentId(targetId);
    }
    if (view === 'orders' && targetId) {
      setFocusedOrderId(targetId);
    }
    if (view === 'complaints' && targetId) {
      setFocusedComplaintId(targetId);
    }
    setCurrentView(view);
  };

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
          {currentView === 'products' && <ProductManagement />}
          {currentView === 'categories' && <CategoryManagement />}
          {currentView === 'shipment-options' && <ShipmentOptions />}
          {currentView === 'store-dashboard' && <StoreDashboard onNavigate={handleNavigateView} />}
          {currentView === 'orders' && <OrderManagement focusedOrderId={focusedOrderId} onClearFocusedOrder={() => setFocusedOrderId(null)} />}
          {currentView === 'inventory' && <InventoryManagement />}
          {currentView === 'payments' && <PaymentHistory focusedPaymentId={focusedPaymentId} onClearFocusedPayment={() => setFocusedPaymentId(null)} />}
          {currentView === 'returns' && <RefundManagement />}
          {/* ========================================================
              VIEW 1: OVERVIEW (Super Admin Redesign)
              ======================================================== */}
          {currentView === 'overview' && (
            <SuperAdminOverviewView
              complaints={complaints}
              departments={departments}
              users={users}
              redirectionData={redirectionData}
              onNavigate={handleNavigateView}
              onRefresh={loadDashboardData}
              isSuperAdmin={isSuperAdmin}
            />
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
            <ComplaintsOversightView
              complaints={complaints}
              departments={departments}
              redirectionData={redirectionData}
              focusedComplaintId={focusedComplaintId}
              onClearFocusedComplaint={() => setFocusedComplaintId(null)}
            />
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
