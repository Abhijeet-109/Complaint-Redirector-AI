import React, { useState } from 'react';
import { HandlerSidebar } from './HandlerSidebar';
import { HandlerTopbar } from './HandlerTopbar';
import './HandlerDashboard.css';

export function HandlerLayout({
  children,
  currentPath = '/handler/dashboard',
  onNavigate,
  queueCount = 0,
  departmentName = 'Returns & Replacement',
}) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className={`hd-layout ${collapsed ? 'hd-collapsed' : ''}`}>
      <HandlerSidebar
        currentPath={currentPath}
        onNavigate={onNavigate}
        collapsed={collapsed}
        setCollapsed={setCollapsed}
        queueCount={queueCount}
        departmentName={departmentName}
      />
      <div className="hd-main-wrapper">
        <HandlerTopbar departmentName={departmentName} />
        <main className="hd-content">
          {children}
        </main>
      </div>
    </div>
  );
}

export default HandlerLayout;

