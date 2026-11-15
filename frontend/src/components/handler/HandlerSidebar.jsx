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
  PackageCheck,
  Truck,
  RotateCcw,
  Boxes,
  AlertTriangle,
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
  departmentName = 'Returns & Replacement',
}) {
  const { logout } = useAuth();
  const isOrderDelivery = departmentName === 'Order & Delivery';

  const handleSignOut = () => {
    logout();
    if (onNavigate) {
      onNavigate('login');
    }
  };

  const returnsNavItems = [
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

  const orderDeliveryWorkspaceItems = [
    {
      label: 'Overview',
      path: '/handler/dashboard',
      icon: LayoutDashboard,
      activeMatch: (p) => p === '/handler/dashboard' || p === '/handler' || p === '/handler-dashboard',
    },
    {
      label: 'Order Management',
      path: '/handler/orders',
      icon: PackageCheck,
      badge: queueCount > 0 ? queueCount : null,
      activeMatch: (p) => p.startsWith('/handler/orders'),
    },
    {
      label: 'Shipment Management',
      path: '/handler/shipments',
      icon: Truck,
      activeMatch: (p) => p.startsWith('/handler/shipments'),
    },
    {
      label: 'Returns & Replacement',
      path: '/handler/returns-handoffs',
      icon: RotateCcw,
      activeMatch: (p) => p.startsWith('/handler/returns-handoffs') || p.startsWith('/handler/tracking'),
    },
  ];

  const orderDeliveryOperationsItems = [
    {
      label: 'Inventory',
      path: '/handler/inventory',
      icon: Boxes,
      activeMatch: (p) => p.startsWith('/handler/inventory'),
    },
    {
      label: 'Delivery Exceptions',
      path: '/handler/exceptions',
      icon: AlertTriangle,
      activeMatch: (p) => p.startsWith('/handler/exceptions'),
    },
    {
      label: 'History & Reports',
      path: '/handler/history-reports',
      icon: History,
      activeMatch: (p) => p.startsWith('/handler/history-reports'),
    },
  ];

  const handleItemClick = (path) => {
    if (onNavigate) {
      onNavigate('handler-dashboard', path);
    }
  };

  const renderNavButton = (item) => {
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
  };

  return (
    <aside className={`hd-sidebar ${collapsed ? 'hd-sidebar-collapsed' : ''}`}>
      {/* Brand & Toggle Header Row — Matching Admin Dashboard / Screenshot */}
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
              <span className="ad-sidebar-brand-badge">
                {isOrderDelivery ? 'ORDER & DELIVERY' : 'DEPT HANDLER'}
              </span>
            </div>
          )}
        </div>

        {/* Toggle Button */}
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

      {/* Navigation Sections */}
      <nav className="hd-sidebar-nav">
        {isOrderDelivery ? (
          <>
            {!collapsed && (
              <div className="hd-sidebar-section-title">
                WORKSPACE
              </div>
            )}
            {orderDeliveryWorkspaceItems.map(renderNavButton)}

            {!collapsed && (
              <div className="hd-sidebar-section-title" style={{ marginTop: 14 }}>
                OPERATIONS
              </div>
            )}
            {orderDeliveryOperationsItems.map(renderNavButton)}
          </>
        ) : (
          <>
            {!collapsed && (
              <div className="hd-sidebar-section-title">
                {departmentName.toUpperCase()}
              </div>
            )}
            {returnsNavItems.map(renderNavButton)}
          </>
        )}
      </nav>

      {/* Sidebar Signout Footer */}
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
