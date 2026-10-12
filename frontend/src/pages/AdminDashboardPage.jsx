import React from 'react';
import { AdminDashboard } from '../components/dashboards/AdminDashboard';

export function AdminDashboardPage({ onNavigate }) {
  return <AdminDashboard onNavigate={onNavigate} />;
}

export default AdminDashboardPage;
