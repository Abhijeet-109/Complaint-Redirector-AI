import React from 'react';
import { Bell } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export function HandlerTopbar({ departmentName = 'Returns & Replacement' }) {
  const { user } = useAuth();

  const userInitial = user?.name
    ? user.name.charAt(0).toUpperCase()
    : 'R';

  return (
    <header className="hd-topbar">
      <div className="hd-topbar-left">
        <h1 className="hd-topbar-title">Handler Dashboard</h1>
      </div>

      <div className="hd-topbar-right">
        <div className="hd-topbar-dept-info">
          <span className="hd-topbar-dept-name">{departmentName}</span>
          <span className="hd-topbar-dept-role">Returns & Replacement Dept</span>
        </div>

        <button
          type="button"
          className="hd-topbar-bell-btn"
          title="Notifications"
          aria-label="Notifications"
        >
          <Bell size={20} strokeWidth={1.8} />
          <span className="hd-topbar-bell-dot" />
        </button>

        <div className="hd-topbar-avatar" title={user?.name || 'Department Handler'}>
          {userInitial}
        </div>
      </div>
    </header>
  );
}

export default HandlerTopbar;

