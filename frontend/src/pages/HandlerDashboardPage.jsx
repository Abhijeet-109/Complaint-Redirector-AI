import React from 'react';
import { HandlerDashboard } from '../components/dashboards/HandlerDashboard';

export function HandlerDashboardPage({ onNavigate, routePath }) {
  return <HandlerDashboard onNavigate={onNavigate} routePath={routePath} />;
}

export default HandlerDashboardPage;
