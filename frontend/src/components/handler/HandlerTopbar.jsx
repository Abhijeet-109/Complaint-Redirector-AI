import React from 'react';
import { Bell } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export function HandlerTopbar({ departmentName = 'Returns & Replacement' }) {
  const { user } = useAuth();
  const isOrderDelivery = departmentName === 'Order & Delivery' || user?.department_name === 'Order & Delivery';

  const userInitial = isOrderDelivery ? 'OD' : (user?.name ? user.name.charAt(0).toUpperCase() : 'H');
  const roleTitle = isOrderDelivery ? 'Order & Delivery Handler' : `${departmentName} Handler`;

  return (
    <header className="hd-topbar">
      <div className="hd-topbar-left">
        <h1 className="hd-topbar-title">Flatkart Department Portal</h1>
      </div>

      <div className="hd-topbar-right">
        <div className="hd-topbar-dept-info">
          <span className="hd-topbar-dept-name">{roleTitle}</span>
          <span className="hd-topbar-dept-role">{user?.name || departmentName}</span>
        </div>

        <button
          type="button"
          className="hd-topbar-bell-btn"
          title="Notifications"
          aria-label="Notifications"
        >
          <Bell size={18} strokeWidth={1.8} />
          <span className="hd-topbar-bell-dot" />
        </button>

        <div className="hd-topbar-avatar" title={user?.name || roleTitle}>
          {userInitial}
        </div>
      </div>
    </header>
  );
}

export default HandlerTopbar;
