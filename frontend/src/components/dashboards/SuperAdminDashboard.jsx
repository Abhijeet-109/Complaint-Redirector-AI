import React from 'react';
import { SharedAdminDashboard } from '../admin/SharedAdminDashboard';

export function SuperAdminDashboard({ onNavigate }) {
  return <SharedAdminDashboard isSuperAdmin={true} onNavigate={onNavigate} />;
}

export default SuperAdminDashboard;
