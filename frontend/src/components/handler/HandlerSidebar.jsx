import React from 'react';
import {
  LayoutDashboard,
  ClipboardCheck,
  FileText,
  MessageCircle,
  ArrowLeftRight,
  History,
  ChartNoAxesColumn,
  LogOut,
  ShoppingCart,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export function HandlerSidebar({
  currentPath = '/handler/dashboard',
  onNavigate,
  collapsed = false,
  setCollapsed,
  queueCount = 0,
}) {
  const { logout } = useAuth();

  const handleSignOut = () => {
    logout();
    if (onNavigate) {
      onNavigate('login');
    }
  };

  const navItems = [
    {
      label: 'Dashboard',
      path: '/handler/dashboard',
      icon: LayoutDashboard,
      activeMatch: (p) => p === '/handler/dashboard' || p === '/handler' || p === '/handler-dashboard',
    },
    {
      label: 'Review Queue',
      path: '/handler/review-queue',
      icon: ClipboardCheck,
      badge: queueCount > 0 ? queueCount : null,
      activeMatch: (p) => p.startsWith('/handler/review-queue'),
    },
    {
      label: 'Requests',
      path: '/handler/requests',
      icon: FileText,
      activeMatch: (p) => p.startsWith('/handler/requests'),
    },
    {
      label: 'Complaints',
      path: '/handler/complaints',
      icon: MessageCircle,
      activeMatch: (p) => p.startsWith('/handler/complaints'),
    },
    {
      label: 'Tracking & Handoffs',
      path: '/handler/tracking',
      icon: ArrowLeftRight,
      activeMatch: (p) => p.startsWith('/handler/tracking'),
    },
    {
      label: 'History & Audit',
      path: '/handler/history',
      icon: History,
      activeMatch: (p) => p.startsWith('/handler/history'),
    },
    {
      label: 'Reports',
      path: '/handler/reports',
      icon: ChartNoAxesColumn,
      activeMatch: (p) => p.startsWith('/handler/reports'),
    },
  ];

  const handleItemClick = (path) => {
    if (onNavigate) {
      onNavigate('handler-dashboard', path);
    }
  };

  return (
    <aside className={`hd-sidebar ${collapsed ? 'hd-sidebar-collapsed' : ''}`}>
      {/* Brand & Toggle Header Row — Exactly matching Admin Dashboard layout */}
      <div className={`ad-sidebar-header-row ${collapsed ? 'collapsed' : ''}`}>
        <div
          className="ad-sidebar-brand"
          onClick={() => onNavigate && onNavigate('home')}
          title="Return to Flatkart Store"
          role="button"
          tabIndex={0}
        >
          <ShoppingCart size={22} strokeWidth={2.4} color="#FFFFFF" style={{ flexShrink: 0 }} />
          {!collapsed && (
            <div className="ad-sidebar-brand-info">
              <span className="ad-sidebar-brand-name">FLATKART</span>
              <span className="ad-sidebar-brand-badge">DEPT HANDLER</span>
            </div>
          )}
        </div>

        {/* Toggle Button — placed below logo when collapsed */}
        <button
          type="button"
          className={`ad-sidebar-toggle ${collapsed ? 'collapsed' : 'expanded'}`}
          onClick={() => setCollapsed(!collapsed)}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>
      </div>

      {/* Section Title */}
      {!collapsed && (
        <div className="hd-sidebar-section-title">
          RETURNS & REPLACEMENT
        </div>
      )}

      {/* Navigation Links */}
      <nav className="hd-sidebar-nav">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = item.activeMatch(currentPath);

          return (
            <button
              key={item.path}
              type="button"
              className={`hd-sidebar-item ${isActive ? 'active' : ''} ${collapsed ? 'collapsed' : ''}`}
              onClick={() => handleItemClick(item.path)}
              title={collapsed ? item.label : undefined}
            >
              <Icon size={18} strokeWidth={1.8} style={{ flexShrink: 0 }} />
              {!collapsed && <span className="hd-sidebar-label">{item.label}</span>}
              {!collapsed && item.badge !== null && item.badge !== undefined && item.badge > 0 && (
                <span className="hd-sidebar-badge">{item.badge}</span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Reusing Admin Dashboard Signout / Logout Structure & Styling */}
      <div className="ad-sidebar-footer">
        <button
          type="button"
          className="ad-sidebar-signout"
          onClick={handleSignOut}
          title="Logout"
        >
          <LogOut size={17} style={{ flexShrink: 0 }} />
          {!collapsed && <span>Logout</span>}
        </button>
      </div>
    </aside>
  );
}

export default HandlerSidebar;
