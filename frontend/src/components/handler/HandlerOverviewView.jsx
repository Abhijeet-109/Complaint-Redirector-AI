import React, { useState } from 'react';
import {
  Eye,
  EyeOff,
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
  onPeriodChange,
}) {
  const [activityTimeframe, setActivityTimeframe] = useState('Month');
  const [showTotalRequests, setShowTotalRequests] = useState(true);

  // Real backend counts — default to genuine 0, no fake numbers!
  const totalRequests = stats?.total_requests ?? 0;
  const pendingReview = stats?.pending_review ?? 0;
  const inProcess = stats?.in_process ?? 0;
  const resolved = stats?.resolved ?? 0;
  const complaintsCount = stats?.complaints ?? 0;

  const returnsCount = stats?.returns_count ?? 0;
  const replacementsCount = stats?.replacements_count ?? 0;
  const returnsPct = totalRequests > 0 ? Math.round((returnsCount / totalRequests) * 100) : 0;
  const replacementsPct = totalRequests > 0 ? Math.max(0, 100 - returnsPct) : 0;

  // Real activity bars from backend only — no fabricated fallback
  const activityData = stats?.activity || [];

  const handleTimeframeClick = (tf) => {
    setActivityTimeframe(tf);
    if (onPeriodChange) {
      onPeriodChange(tf.toLowerCase());
    }
  };

  // 6 Approved Quick Actions (No Settings!)
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
            <button
              type="button"
              className="hd-eye-toggle-btn"
              onClick={() => setShowTotalRequests(!showTotalRequests)}
              title={showTotalRequests ? "Hide numerical value" : "Show numerical value"}
            >
              {showTotalRequests ? (
                <Eye size={18} strokeWidth={1.8} className="hd-dominant-icon" />
              ) : (
                <EyeOff size={18} strokeWidth={1.8} className="hd-dominant-icon" />
              )}
            </button>
          </div>

          <div className="hd-dominant-value">
            {showTotalRequests ? totalRequests : '••••'}
          </div>

          <div className="hd-dominant-trend">
            {totalRequests > 0 ? (
              <>
                <span className="hd-trend-arrow">↑</span> Active claims in system
              </>
            ) : (
              <span className="hd-trend-neutral">No active claims</span>
            )}
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
                  onClick={() => handleTimeframeClick(t)}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div className="hd-activity-chart-container">
            {activityData.length === 0 ? (
              <div className="hd-chart-empty-state">No activity data available for the selected period.</div>
            ) : (
              <div className="hd-activity-bars">
                {activityData.map((m) => (
                  <div key={m.label} className="hd-activity-bar-col">
                    <div className="hd-activity-bar-track">
                      <div
                        className={`hd-activity-bar-fill ${m.is_current ? 'current' : ''}`}
                        style={{ height: `${m.height_pct ?? 0}%` }}
                        title={`${m.label}: ${m.value} requests`}
                      />
                    </div>
                    <span className="hd-activity-bar-label">{m.label}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Request by Type Card */}
        <div className="hd-card hd-type-card">
          <h3 className="hd-card-title">Request by Type</h3>
          <div className="hd-type-card-body">
            <div className="hd-donut-container">
              <svg width="130" height="130" viewBox="0 0 130 130" className="hd-donut-svg">
                {/* Background Ring */}
                <circle
                  cx="65"
                  cy="65"
                  r="48"
                  fill="transparent"
                  stroke="#E8E2D5"
                  strokeWidth="18"
                />
                {totalRequests > 0 && (
                  <>
                    {/* Returns Segment */}
                    <circle
                      cx="65"
                      cy="65"
                      r="48"
                      fill="transparent"
                      stroke="#13513C"
                      strokeWidth="18"
                      strokeDasharray={`${(returnsPct / 100) * 301.6} 301.6`}
                      strokeDashoffset="0"
                      transform="rotate(-90 65 65)"
                    />
                    {/* Replacements Segment */}
                    <circle
                      cx="65"
                      cy="65"
                      r="48"
                      fill="transparent"
                      stroke="#D3C7AB"
                      strokeWidth="18"
                      strokeDasharray={`${(replacementsPct / 100) * 301.6} 301.6`}
                      strokeDashoffset={`-${(returnsPct / 100) * 301.6}`}
                      transform="rotate(-90 65 65)"
                    />
                  </>
                )}
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
            {recentRequests.length === 0 ? (
              <div className="hd-empty-state">
                No recent requests found in your department.
              </div>
            ) : (
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
                  {recentRequests.map((r) => (
                    <tr
                      key={r.id}
                      className="hd-row-clickable"
                      onClick={() => onNavigate && onNavigate('handler-dashboard', `/handler/requests/${r.claimId || r.id}`)}
                    >
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
            )}
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
            {recentComplaints.length === 0 ? (
              <div className="hd-empty-state">
                No recent complaints assigned to your department.
              </div>
            ) : (
              recentComplaints.map((c) => (
                <div
                  key={c.id}
                  className="hd-complaint-item hd-row-clickable"
                  onClick={() => onNavigate && onNavigate('handler-dashboard', `/handler/complaints/${c.rawId || c.id}`)}
                >
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
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default HandlerOverviewView;
