import React, { useState } from 'react';
import {
  LayoutDashboard, Users, Building2, UserCheck, ShieldAlert,
  FileText, GitCompare, Bot, LogOut, ShoppingCart, ShoppingBag,
  Tags, Truck, Package, CreditCard, RotateCcw, BarChart3,
  ChevronLeft, ChevronRight,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export function AdminSidebar({ currentView = 'store-dashboard', onSelectView, isSuperAdmin = false, onNavigate }) {
  const { logout } = useAuth();
  const [collapsed, setCollapsed] = useState(false);

  const handleSignOut = () => {
    logout();
    if (onNavigate) onNavigate('login');
  };

  const NavItem = ({ view, icon: Icon, label, superAdminOnly = false }) => {
    if (superAdminOnly && !isSuperAdmin) return null;
    const isActive = currentView === view;
    return (
      <button
        className={`ad-sidebar-item ${isActive ? 'active' : ''} ${collapsed ? 'collapsed' : ''}`}
        onClick={() => onSelectView(view)}
        title={collapsed ? label : undefined}
      >
        <Icon size={17} strokeWidth={2} />
        {!collapsed && <span className="ad-sidebar-label">{label}</span>}
        {!collapsed && superAdminOnly && <span className="ad-super-badge">Super</span>}
      </button>
    );
  };

  return (
    <aside className={`ad-sidebar ${collapsed ? 'ad-sidebar-collapsed' : ''}`}>
      {/* Brand */}
      <div
        className="ad-sidebar-brand"
        onClick={() => onNavigate && onNavigate('home')}
        title="Return to Flatkart Store"
        role="button"
        tabIndex={0}
        style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '9px', overflow: 'hidden' }}
      >
        <ShoppingCart size={22} strokeWidth={2.4} color="#FFFFFF" style={{ flexShrink: 0 }} />
        {!collapsed && (
          <div className="ad-sidebar-brand-info">
            <span className="ad-sidebar-brand-name">Flatkart</span>
            <span className="ad-sidebar-brand-badge">{isSuperAdmin ? 'Super Admin' : 'Admin'}</span>
          </div>
        )}
      </div>

      {/* Toggle Button */}
      <button
        className="ad-sidebar-toggle"
        onClick={() => setCollapsed(c => !c)}
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {collapsed ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
      </button>

      <nav className="ad-sidebar-nav">
        {/* WORKSPACE - FIRST */}
        <div className="ad-sidebar-group">
          {!collapsed && <div className="ad-sidebar-group-title">Workspace</div>}
          <NavItem view="overview" icon={LayoutDashboard} label="Overview" />
          <NavItem view="users" icon={Users} label="Manage Users" />
          <NavItem view="departments" icon={Building2} label="Manage Departments" />
          <NavItem view="handlers" icon={UserCheck} label="Manage Dept. Handlers" />
          <NavItem view="admins" icon={ShieldAlert} label="Manage Admins" superAdminOnly />
          <NavItem view="pipeline" icon={Bot} label="Chatbot & Pipeline" superAdminOnly />
        </div>

        {/* STORE MANAGEMENT - SECOND */}
        <div className="ad-sidebar-group">
          {!collapsed && <div className="ad-sidebar-group-title">Store Management</div>}
          <NavItem view="store-dashboard" icon={BarChart3} label="Store Dashboard" />
          <NavItem view="orders" icon={ShoppingBag} label="Orders & Shipments" />
          <NavItem view="inventory" icon={Package} label="Inventory" />
          <NavItem view="payments" icon={CreditCard} label="Payment History" />
          <NavItem view="returns" icon={RotateCcw} label="Returns & Refunds" />
          <NavItem view="products" icon={ShoppingCart} label="Manage Products" />
          <NavItem view="categories" icon={Tags} label="Manage Categories" />
          <NavItem view="shipment-options" icon={Truck} label="Shipment Options" />
        </div>

        {/* OPERATIONS - THIRD */}
        <div className="ad-sidebar-group">
          {!collapsed && <div className="ad-sidebar-group-title">Operations</div>}
          <NavItem view="complaints" icon={FileText} label="Complaints" />
          <NavItem view="analytics" icon={GitCompare} label="Redirection Analytics" />
        </div>
      </nav>

      <div className="ad-sidebar-footer">
        <button className="ad-sidebar-signout" onClick={handleSignOut} title="Sign out">
          <LogOut size={17} style={{ flexShrink: 0 }} />
          {!collapsed && <span>Sign out</span>}
        </button>
      </div>
    </aside>
  );
}

export default AdminSidebar;
