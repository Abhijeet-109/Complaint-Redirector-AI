import React from 'react';
import {
  LayoutDashboard,
  Users,
  Building2,
  UserCheck,
  ShieldAlert,
  FileText,
  GitCompare,
  Bot,
  LogOut,
  ShoppingCart,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export function AdminSidebar({
  currentView = 'overview',
  onSelectView,
  isSuperAdmin = false,
  onNavigate,
}) {
  const { logout } = useAuth();

  const handleSignOut = () => {
    logout();
    if (onNavigate) onNavigate('login');
  };

  return (
    <aside className="ad-sidebar">
      {/* Brand Header: Cart Icon + FLATKART */}
      <div
        className="ad-sidebar-brand"
        onClick={() => onNavigate && onNavigate('home')}
        title="Return to Flatkart Store"
        role="button"
        tabIndex={0}
        style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '9px' }}
      >
        <ShoppingCart size={22} strokeWidth={2.4} color="#FFFFFF" />
        <div className="ad-sidebar-brand-info">
          <span className="ad-sidebar-brand-name">Flatkart</span>
          <span className="ad-sidebar-brand-badge">
            {isSuperAdmin ? 'Super Admin' : 'Admin'}
          </span>
        </div>
      </div>

      {/* Navigation Links */}
      <nav className="ad-sidebar-nav">
        {/* Workspace Section */}
        <div className="ad-sidebar-group">
          <div className="ad-sidebar-group-title">Workspace</div>

          <button
            className={`ad-sidebar-item ${currentView === 'overview' ? 'active' : ''}`}
            onClick={() => onSelectView('overview')}
          >
            <LayoutDashboard size={17} />
            <span>Overview</span>
          </button>

          <button
            className={`ad-sidebar-item ${currentView === 'users' ? 'active' : ''}`}
            onClick={() => onSelectView('users')}
          >
            <Users size={17} />
            <span>Manage Users</span>
          </button>

          <button
            className={`ad-sidebar-item ${currentView === 'departments' ? 'active' : ''}`}
            onClick={() => onSelectView('departments')}
          >
            <Building2 size={17} />
            <span>Manage Departments</span>
          </button>

          <button
            className={`ad-sidebar-item ${currentView === 'handlers' ? 'active' : ''}`}
            onClick={() => onSelectView('handlers')}
          >
            <UserCheck size={17} />
            <span>Manage Dept. Handlers</span>
          </button>

          {isSuperAdmin && (
            <button
              className={`ad-sidebar-item ${currentView === 'admins' ? 'active' : ''}`}
              onClick={() => onSelectView('admins')}
            >
              <ShieldAlert size={17} />
              <span>Manage Admins</span>
            </button>
          )}
        </div>

        {/* Operations Section */}
        <div className="ad-sidebar-group">
          <div className="ad-sidebar-group-title">Operations</div>

          <button
            className={`ad-sidebar-item ${currentView === 'complaints' ? 'active' : ''}`}
            onClick={() => onSelectView('complaints')}
          >
            <FileText size={17} />
            <span>Complaints</span>
          </button>

          <button
            className={`ad-sidebar-item ${currentView === 'analytics' ? 'active' : ''}`}
            onClick={() => onSelectView('analytics')}
          >
            <GitCompare size={17} />
            <span>Redirection Analytics</span>
          </button>

          {isSuperAdmin && (
            <button
              className={`ad-sidebar-item ${currentView === 'pipeline' ? 'active' : ''}`}
              onClick={() => onSelectView('pipeline')}
            >
              <Bot size={17} />
              <span>Chatbot & Pipeline</span>
              <span className="ad-super-badge">Super Admin</span>
            </button>
          )}
        </div>
      </nav>

      {/* Bottom Sign Out */}
      <div className="ad-sidebar-footer">
        <button className="ad-sidebar-signout" onClick={handleSignOut}>
          <LogOut size={17} />
          <span>Sign out</span>
        </button>
      </div>
    </aside>
  );
}

export default AdminSidebar;
