import React from 'react';
import { SharedAdminDashboard } from '../admin/SharedAdminDashboard';

export function AdminDashboard({ onNavigate }) {
  return <SharedAdminDashboard isSuperAdmin={false} onNavigate={onNavigate} />;
}

export default AdminDashboard;
