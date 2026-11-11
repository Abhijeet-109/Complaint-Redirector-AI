import React, { useState } from 'react';
import {
  Eye,
  ClipboardCheck,
  FileText,
  ArrowLeftRight,
  MessageSquare,
  ChartNoAxesColumn,
  History,
  ClipboardList,
  RefreshCw,
  CheckCircle2,
} from 'lucide-react';
import { HandlerKPICard } from './HandlerKPICard';
import { HandlerStatusBadge } from './HandlerStatusBadge';

export function HandlerOverviewView({
  stats,
  recentRequests = [],
  recentComplaints = [],
  onNavigate,
}) {
  const [activityTimeframe, setActivityTimeframe] = useState('Month');

  // Real or fallback counts
  const totalRequests = stats?.total_requests ?? 48;
  const pendingReview = stats?.pending_review ?? 12;
  const inProcess = stats?.in_process ?? 18;
  const resolved = stats?.resolved ?? 18;
  const complaintsCount = stats?.complaints ?? 6;

  const returnsCount = stats?.returns_count ?? 28;
  const replacementsCount = stats?.replacements_count ?? 20;
  const returnsPct = totalRequests > 0 ? Math.round((returnsCount / totalRequests) * 100) : 58;
  const replacementsPct = 100 - returnsPct;

  // Monthly activity bars
  const monthsData = [
    { label: 'Jun', value: 8, heightPct: 15 },
    { label: 'Jul', value: 12, heightPct: 22 },
    { label: 'Aug', value: 20, heightPct: 35 },
    { label: 'Sep', value: 24, heightPct: 40 },
    { label: 'Oct', value: 36, heightPct: 60 },
    { label: 'Nov', value: 48, heightPct: 85, isCurrent: true },
  ];

  // Quick actions without Settings
  const quickActions = [
    {
      label: 'Review Queue',
      icon: ClipboardCheck,
      path: '/handler/review-queue',
    },
    {
      label: 'View Requests',
      icon: FileText,
      path: '/handler/requests',
    },
    {
      label: 'Track Handoffs',
      icon: ArrowLeftRight,
      path: '/handler/tracking',
    },
    {
      label: 'View Complaints',
      icon: MessageSquare,
      path: '/handler/complaints',
    },
    {
      label: 'Department Reports',
      icon: ChartNoAxesColumn,
      path: '/handler/reports',
    },
    {
      label: 'History & Audit',
      icon: History,
      path: '/handler/history',
    },
  ];

  // Default display requests matching screenshot if backend is empty
  const displayRequests = recentRequests.length > 0 ? recentRequests.slice(0, 5) : [
    { id: 'TRN-1032', orderId: 'FK-20261109-8896', customer: 'Abhijeet', type: 'Refund', status: 'Pending Review', updated: 'Nov 10, 2026' },
    { id: 'TRN-1031', orderId: 'FK-20261108-7741', customer: 'Rahul', type: 'Replacement', status: 'In Process', updated: 'Nov 10, 2026' },
    { id: 'TRN-1030', orderId: 'FK-20261107-6622', customer: 'Priya', type: 'Refund', status: 'Complaint Raised', updated: 'Nov 9, 2026' },
    { id: 'TRN-1029', orderId: 'FK-20261106-6510', customer: 'Sneha', type: 'Refund', status: 'Resolved', updated: 'Nov 8, 2026' },
    { id: 'TRN-1028', orderId: 'FK-20261106-5509', customer: 'Karan', type: 'Replacement', status: 'In Process', updated: 'Nov 8, 2026' },
  ];

  // Default display complaints matching screenshot if backend is empty
  const displayComplaints = recentComplaints.length > 0 ? recentComplaints.slice(0, 3) : [
    { id: 'CMP-1006', orderId: 'FK-20261107-6622', status: 'Pending', date: 'Nov 9, 2026' },
    { id: 'CMP-1005', orderId: 'FK-20261106-5410', status: 'In Progress', date: 'Nov 8, 2026' },
  ];

  return (
    <div className="hd-page hd-overview-page">
      {/* Page Header */}
      <div className="hd-page-header">
        <h2 className="hd-page-title">Returns & Replacement Overview</h2>
        <span className="hd-page-subtitle">
          Manage return and replacement requests, complaints, and handoffs.
        </span>
      </div>

      {/* Top Grid: Total Requests + Quick Actions (Left) and 4 KPI Cards (Right) */}
      <div className="hd-overview-top-grid">
        {/* Dominant Left Card */}
        <div className="hd-overview-dominant-card">
          <div className="hd-dominant-header">
            <span className="hd-dominant-label">TOTAL REQUESTS</span>
            <Eye size={18} strokeWidth={1.8} className="hd-dominant-icon" />
          </div>
          <div className="hd-dominant-value">{totalRequests}</div>
          <div className="hd-dominant-trend">
            <span className="hd-trend-arrow">↑</span> 12% vs last 30 days
          </div>

          <div className="hd-dominant-divider" />

          <div className="hd-quick-actions-section">
            <h3 className="hd-quick-actions-heading">Quick Actions</h3>
            <div className="hd-quick-actions-grid">
              {quickActions.map((qa) => {
                const QIcon = qa.icon;
                return (
                  <button
                    key={qa.label}
                    type="button"
                    className="hd-quick-action-btn"
                    onClick={() => onNavigate && onNavigate('handler-dashboard', qa.path)}
                  >
                    <div className="hd-quick-action-icon-wrap">
                      <QIcon size={18} strokeWidth={1.8} />
                    </div>
                    <span className="hd-quick-action-label">{qa.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* 4 KPI Cards */}
        <div className="hd-overview-kpi-grid">
          <HandlerKPICard
            title="Pending Review"
            value={pendingReview}
            icon={ClipboardList}
            subtitle="Needs your action"
          />
          <HandlerKPICard
            title="In Process"
            value={inProcess}
            icon={RefreshCw}
            subtitle="With other departments"
          />
          <HandlerKPICard
            title="Resolved"
            value={resolved}
            icon={CheckCircle2}
            subtitle="Completed requests"
          />
          <HandlerKPICard
            title="Complaints"
            value={complaintsCount}
            icon={MessageSquare}
            subtitle="Related to returns/replacements"
            viewAllLink="View All →"
            onViewAll={() => onNavigate && onNavigate('handler-dashboard', '/handler/complaints')}
          />
        </div>
      </div>

      {/* Middle Section: Request Activity + Request by Type */}
      <div className="hd-overview-middle-grid">
        {/* Request Activity Card */}
        <div className="hd-card hd-activity-card">
          <div className="hd-card-header-row">
            <div>
              <h3 className="hd-card-title">Request Activity</h3>
              <div className="hd-activity-metric">
                <span className="hd-activity-number">{totalRequests}</span>
                <span className="hd-activity-label">Total requests</span>
              </div>
            </div>
            <div className="hd-timeframe-toggle">
              {['Day', 'Week', 'Month'].map((t) => (
                <button
                  key={t}
                  type="button"
                  className={`hd-timeframe-btn ${activityTimeframe === t ? 'active' : ''}`}
                  onClick={() => setActivityTimeframe(t)}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div className="hd-activity-chart-container">
            <div className="hd-activity-bars">
              {monthsData.map((m) => (
                <div key={m.label} className="hd-activity-bar-col">
                  <div className="hd-activity-bar-track">
                    <div
                      className={`hd-activity-bar-fill ${m.isCurrent ? 'current' : ''}`}
                      style={{ height: `${m.heightPct}%` }}
                      title={`${m.label}: ${m.value} requests`}
                    />
                  </div>
                  <span className="hd-activity-bar-label">{m.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Request by Type Card */}
        <div className="hd-card hd-type-card">
          <h3 className="hd-card-title">Request by Type</h3>
          <div className="hd-type-card-body">
            <div className="hd-donut-container">
              <svg width="150" height="150" viewBox="0 0 150 150" className="hd-donut-svg">
                {/* Background Ring */}
                <circle
                  cx="75"
                  cy="75"
                  r="56"
                  fill="transparent"
                  stroke="#E8E2D5"
                  strokeWidth="20"
                />
                {/* Returns Segment (58%) */}
                <circle
                  cx="75"
                  cy="75"
                  r="56"
                  fill="transparent"
                  stroke="#13513C"
                  strokeWidth="20"
                  strokeDasharray={`${(returnsPct / 100) * 351.8} 351.8`}
                  strokeDashoffset="0"
                  transform="rotate(-90 75 75)"
                />
                {/* Replacements Segment (42%) */}
                <circle
                  cx="75"
                  cy="75"
                  r="56"
                  fill="transparent"
                  stroke="#D3C7AB"
                  strokeWidth="20"
                  strokeDasharray={`${(replacementsPct / 100) * 351.8} 351.8`}
                  strokeDashoffset={`-${(returnsPct / 100) * 351.8}`}
                  transform="rotate(-90 75 75)"
                />
              </svg>
              <div className="hd-donut-center">
                <span className="hd-donut-total">{totalRequests}</span>
                <span className="hd-donut-label">Total</span>
              </div>
            </div>

            <div className="hd-donut-legend">
              <div className="hd-legend-item">
                <span className="hd-legend-color" style={{ backgroundColor: '#13513C' }} />
                <span className="hd-legend-name">Returns</span>
                <span className="hd-legend-val">{returnsCount} ({returnsPct}%)</span>
              </div>
              <div className="hd-legend-item">
                <span className="hd-legend-color" style={{ backgroundColor: '#D3C7AB' }} />
                <span className="hd-legend-name">Replacements</span>
                <span className="hd-legend-val">{replacementsCount} ({replacementsPct}%)</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Section: Recent Requests + Recent Complaints */}
      <div className="hd-overview-bottom-grid">
        {/* Recent Requests */}
        <div className="hd-card hd-recent-requests-card">
          <div className="hd-card-header-row">
            <h3 className="hd-card-title">Recent Requests</h3>
            <button
              type="button"
              className="hd-card-view-all-btn"
              onClick={() => onNavigate && onNavigate('handler-dashboard', '/handler/requests')}
            >
              View All →
            </button>
          </div>

          <div className="hd-table-wrapper">
            <table className="hd-table">
              <thead>
                <tr>
                  <th>REQUEST ID</th>
                  <th>ORDER ID</th>
                  <th>CUSTOMER</th>
                  <th>TYPE</th>
                  <th>STATUS</th>
                  <th>UPDATED</th>
                </tr>
              </thead>
              <tbody>
                {displayRequests.map((r) => (
                  <tr key={r.id}>
                    <td className="hd-cell-id">{r.id}</td>
                    <td className="hd-cell-subtle">{r.orderId}</td>
                    <td className="hd-cell-bold">{r.customer}</td>
                    <td className="hd-cell-subtle">{r.type}</td>
                    <td><HandlerStatusBadge status={r.status} /></td>
                    <td className="hd-cell-subtle">{r.updated}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Recent Complaints */}
        <div className="hd-card hd-recent-complaints-card">
          <div className="hd-card-header-row">
            <h3 className="hd-card-title">Recent Complaints</h3>
            <button
              type="button"
              className="hd-card-view-all-btn"
              onClick={() => onNavigate && onNavigate('handler-dashboard', '/handler/complaints')}
            >
              View All →
            </button>
          </div>

          <div className="hd-complaints-list">
            {displayComplaints.map((c) => (
              <div key={c.id} className="hd-complaint-item">
                <div className="hd-complaint-icon-wrap">
                  <MessageSquare size={16} strokeWidth={1.8} />
                </div>
                <div className="hd-complaint-info">
                  <div className="hd-complaint-id-row">
                    <span className="hd-complaint-id">{c.id}</span>
                  </div>
                  <div className="hd-complaint-order">{c.orderId}</div>
                </div>
                <div className="hd-complaint-right">
                  <HandlerStatusBadge status={c.status} />
                  <span className="hd-complaint-date">{c.date}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default HandlerOverviewView;

