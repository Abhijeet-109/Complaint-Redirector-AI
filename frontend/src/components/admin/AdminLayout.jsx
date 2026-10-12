import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { AdminSidebar } from './AdminSidebar';
import './AdminDashboard.css';

export function AdminLayout({
  children,
  currentView = 'overview',
  onSelectView,
  isSuperAdmin = false,
  onNavigate,
  portalTitle,
}) {
  const { user } = useAuth();

  const title = portalTitle || (isSuperAdmin ? 'Flatkart Super Admin Portal' : 'Flatkart Admin Portal');

  // Compute initials
  const initials = isSuperAdmin
    ? 'SA'
    : user?.name
    ? user.name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .slice(0, 2)
        .toUpperCase()
    : 'A';

  return (
    <div className="ad-layout">
      {/* 1. Fixed Left Sidebar */}
      <AdminSidebar
        currentView={currentView}
        onSelectView={onSelectView}
        isSuperAdmin={isSuperAdmin}
        onNavigate={onNavigate}
      />

      {/* 2. Main Content Wrapper */}
      <div className="ad-main-wrapper">
        {/* Top Navbar (#122D29) */}
        <header className="ad-topbar">
          <div className="ad-topbar-portal-title">{title}</div>

          <div className="ad-topbar-right">
            <div className="ad-topbar-profile">
              <div className="ad-topbar-profile-info">
                <span className="ad-topbar-profile-name">{user?.name || (isSuperAdmin ? 'Super Admin' : 'Admin User')}</span>
                <span className="ad-topbar-profile-role">
                  {isSuperAdmin ? 'Super Admin' : user?.role || 'Admin'}
                </span>
              </div>
              <div className="ad-topbar-avatar">{initials}</div>
            </div>
          </div>
        </header>

        {/* Dynamic Page Content */}
        <main className="ad-content">{children}</main>
      </div>
    </div>
  );
}

export default AdminLayout;
