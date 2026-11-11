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
  queueCount = 12,
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
    },
    {
      label: 'Review Queue',
      path: '/handler/review-queue',
      icon: ClipboardCheck,
      badge: queueCount,
    },
    {
      label: 'Requests',
      path: '/handler/requests',
      icon: FileText,
    },
    {
      label: 'Complaints',
      path: '/handler/complaints',
      icon: MessageCircle,
    },
    {
      label: 'Tracking & Handoffs',
      path: '/handler/tracking',
      icon: ArrowLeftRight,
    },
    {
      label: 'History & Audit',
      path: '/handler/history',
      icon: History,
    },
    {
      label: 'Reports',
      path: '/handler/reports',
      icon: ChartNoAxesColumn,
    },
  ];

  const handleItemClick = (path) => {
    if (onNavigate) {
      onNavigate('handler-dashboard', path);
    }
  };

  return (
    <aside className={`hd-sidebar ${collapsed ? 'hd-sidebar-collapsed' : ''}`}>
      {/* Brand & Toggle Header Row */}
      <div className="hd-sidebar-header">
        <div
          className="hd-sidebar-brand"
          onClick={() => onNavigate && onNavigate('home')}
          title="Return to Flatkart Store"
          role="button"
          tabIndex={0}
        >
          <ShoppingCart size={22} strokeWidth={2.4} color="#FFFFFF" style={{ flexShrink: 0 }} />
          {!collapsed && (
            <div className="hd-sidebar-brand-info">
              <span className="hd-sidebar-brand-name">FLATKART</span>
              <span className="hd-sidebar-brand-badge">DEPT HANDLER</span>
            </div>
          )}
        </div>

        <button
          type="button"
          className="hd-sidebar-toggle"
          onClick={() => setCollapsed(!collapsed)}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronRight size={14} color="#FFFFFF" /> : <ChevronLeft size={14} color="#FFFFFF" />}
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
          const isActive = currentPath === item.path || (item.path === '/handler/dashboard' && (currentPath === '/handler' || currentPath === '/handler-dashboard'));

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
              {!collapsed && item.badge !== undefined && item.badge !== null && item.badge > 0 && (
                <span className="hd-sidebar-badge">{item.badge}</span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Sidebar Footer with Logout */}
      <div className="hd-sidebar-footer">
        <button
          type="button"
          className="hd-sidebar-logout"
          onClick={handleSignOut}
          title={collapsed ? 'Logout' : undefined}
        >
          <LogOut size={17} style={{ flexShrink: 0 }} />
          {!collapsed && <span>Logout</span>}
        </button>
      </div>
    </aside>
  );
}

export default HandlerSidebar;

