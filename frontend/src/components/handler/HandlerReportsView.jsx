import React, { useState } from 'react';
import {
  Layers,
  Package,
  ArrowLeftRight,
  MessageCircle,
  FileDown,
  FileText,
  Download,
} from 'lucide-react';
import { HandlerKPICard } from './HandlerKPICard';

export function HandlerReportsView({
  reportsData,
  loading = false,
}) {
  const [selectedTimeframe, setSelectedTimeframe] = useState('30days');
  const [selectedType, setSelectedType] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');

  const totalRequests = reportsData?.total_requests ?? 48;
  const returnsCount = reportsData?.returns_count ?? 26;
  const replacementsCount = reportsData?.replacements_count ?? 22;
  const complaintsCount = reportsData?.complaints ?? 6;

  const resolvedCount = reportsData?.resolved ?? 24;
  const pendingCount = reportsData?.pending ?? 12;
  const inProgressCount = reportsData?.in_progress ?? 12;

  // Trend data points matching screenshot (approx values across 11 points)
  // X: Oct 12, Oct 15, Oct 18, Oct 21, Oct 24, Oct 27, Oct 30, Nov 2, Nov 5, Nov 8, Nov 10
  // Y: 2, 5, 4, 7, 5, 8, 11, 9, 10, 12, 17
  const trendPoints = [
    { label: 'Oct 12', val: 3 },
    { label: 'Oct 15', val: 5 },
    { label: 'Oct 18', val: 4 },
    { label: 'Oct 21', val: 7 },
    { label: 'Oct 24', val: 5 },
    { label: 'Oct 27', val: 8 },
    { label: 'Oct 30', val: 11 },
    { label: 'Nov 2', val: 9 },
    { label: 'Nov 5', val: 10 },
    { label: 'Nov 8', val: 12 },
    { label: 'Nov 10', val: 17 },
  ];

  // Map to SVG coordinates (width: 500, height: 180, margin: top 10, bottom 30, left 30, right 20)
  const svgWidth = 500;
  const svgHeight = 150;
  const maxY = 20;

  const coords = trendPoints.map((pt, i) => {
    const x = 30 + (i / (trendPoints.length - 1)) * (svgWidth - 50);
    const y = svgHeight - 25 - (pt.val / maxY) * (svgHeight - 40);
    return { x, y, label: pt.label, val: pt.val };
  });

  const pathD = coords.reduce((acc, curr, i, arr) => {
    if (i === 0) return `M ${curr.x} ${curr.y}`;
    const prev = arr[i - 1];
    const cp1x = prev.x + (curr.x - prev.x) / 2;
    const cp1y = prev.y;
    const cp2x = prev.x + (curr.x - prev.x) / 2;
    const cp2y = curr.y;
    return `${acc} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${curr.x} ${curr.y}`;
  }, '');

  const areaD = `${pathD} L ${coords[coords.length - 1].x} ${svgHeight - 25} L ${coords[0].x} ${svgHeight - 25} Z`;

  const recentReports = [
    { id: 1, name: 'Requests Summary (Last 30 Days)', type: 'Summary', date: 'Nov 10, 2026, 11:20 AM' },
    { id: 2, name: 'Complaints Report', type: 'Complaints', date: 'Nov 9, 2026, 4:35 PM' },
    { id: 3, name: 'Handoffs & Tracking Report', type: 'Handoffs', date: 'Nov 8, 2026, 2:10 PM' },
  ];

  const handleExport = () => {
    const csvContent = "data:text/csv;charset=utf-8,"
      + "Metric,Value\n"
      + `Total Requests,${totalRequests}\n`
      + `Returns,${returnsCount}\n`
      + `Replacements,${replacementsCount}\n`
      + `Complaints,${complaintsCount}\n`
      + `Resolved,${resolvedCount}\n`
      + `Pending,${pendingCount}\n`
      + `In Progress,${inProgressCount}\n`;
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Flatkart_RR_Report_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="hd-page hd-reports-page">
      {/* Page Header */}
      <div className="hd-page-header">
        <h2 className="hd-page-title">Reports</h2>
        <span className="hd-page-subtitle">
          Insights and performance reports for returns, replacements, and complaints.
        </span>
      </div>

      {/* 4 KPI Cards */}
      <div className="hd-kpi-row-4">
        <HandlerKPICard
          title="Total Requests"
          value={totalRequests}
          icon={Layers}
        />
        <HandlerKPICard
          title="Returns"
          value={returnsCount}
          icon={Package}
        />
        <HandlerKPICard
          title="Replacements"
          value={replacementsCount}
          icon={ArrowLeftRight}
        />
        <HandlerKPICard
          title="Complaints"
          value={complaintsCount}
          icon={MessageCircle}
        />
      </div>

      {/* Filters and Export Button Bar */}
      <div className="hd-reports-filter-bar">
        <div className="hd-reports-selects">
          <select
            className="hd-select"
            value={selectedTimeframe}
            onChange={(e) => setSelectedTimeframe(e.target.value)}
          >
            <option value="30days">Last 30 Days</option>
            <option value="7days">Last 7 Days</option>
            <option value="90days">Last 90 Days</option>
          </select>

          <select
            className="hd-select"
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
          >
            <option value="all">All Request Types</option>
            <option value="refund">Returns</option>
            <option value="replacement">Replacements</option>
          </select>

          <select
            className="hd-select"
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
          >
            <option value="all">All Statuses</option>
            <option value="resolved">Resolved</option>
            <option value="pending">Pending</option>
            <option value="in_progress">In Progress</option>
          </select>
        </div>

        <button
          type="button"
          className="hd-export-btn"
          onClick={handleExport}
        >
          <FileDown size={16} strokeWidth={2} />
          <span>Export Report</span>
        </button>
      </div>

      {/* Middle Grid: Request Trend + Requests by Status */}
      <div className="hd-reports-middle-grid">
        {/* Request Trend Card */}
        <div className="hd-card hd-trend-card">
          <div className="hd-card-header-block">
            <h3 className="hd-card-title">Request Trend</h3>
            <span className="hd-card-desc">Total return and replacement requests over time.</span>
          </div>

          <div className="hd-trend-chart-box">
            <svg
              viewBox={`0 0 ${svgWidth} ${svgHeight}`}
              className="hd-trend-svg"
              preserveAspectRatio="none"
            >
              <defs>
                <linearGradient id="trendGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#13513C" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="#13513C" stopOpacity="0.0" />
                </linearGradient>
              </defs>

              {/* Grid Horizontal Guidelines */}
              {[0, 4, 8, 12, 16, 20].map((v) => {
                const y = svgHeight - 25 - (v / maxY) * (svgHeight - 40);
                return (
                  <g key={v}>
                    <line
                      x1="30"
                      y1={y}
                      x2={svgWidth - 20}
                      y2={y}
                      stroke="#EFEBE4"
                      strokeWidth="1"
                    />
                    <text
                      x="18"
                      y={y + 3}
                      fill="#8C9B94"
                      fontSize="9"
                      fontFamily="Inter, sans-serif"
                      textAnchor="middle"
                    >
                      {v}
                    </text>
                  </g>
                );
              })}

              {/* Area Gradient Fill */}
              <path d={areaD} fill="url(#trendGradient)" />

              {/* Line Curve */}
              <path
                d={pathD}
                fill="none"
                stroke="#13513C"
                strokeWidth="2.4"
                strokeLinecap="round"
              />

              {/* Data Point Dots */}
              {coords.map((c, i) => (
                <circle
                  key={i}
                  cx={c.x}
                  cy={c.y}
                  r="3.5"
                  fill="#13513C"
                  stroke="#FFFFFF"
                  strokeWidth="1.5"
                />
              ))}

              {/* X-axis Labels */}
              {coords.map((c, i) => (
                <text
                  key={i}
                  x={c.x}
                  y={svgHeight - 8}
                  fill="#758A81"
                  fontSize="8.5"
                  fontFamily="Inter, sans-serif"
                  textAnchor="middle"
                >
                  {c.label}
                </text>
              ))}
            </svg>
          </div>
        </div>

        {/* Requests by Status Donut Card */}
        <div className="hd-card hd-status-donut-card">
          <div className="hd-card-header-block">
            <h3 className="hd-card-title">Requests by Status</h3>
            <span className="hd-card-desc">Current distribution of all requests.</span>
          </div>

          <div className="hd-status-donut-body">
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
                {/* Resolved (50%) -> Green */}
                <circle
                  cx="75"
                  cy="75"
                  r="56"
                  fill="transparent"
                  stroke="#13513C"
                  strokeWidth="20"
                  strokeDasharray={`${0.5 * 351.8} 351.8`}
                  strokeDashoffset="0"
                  transform="rotate(-90 75 75)"
                />
                {/* Pending (25%) -> Sage Green */}
                <circle
                  cx="75"
                  cy="75"
                  r="56"
                  fill="transparent"
                  stroke="#9CB3A3"
                  strokeWidth="20"
                  strokeDasharray={`${0.25 * 351.8} 351.8`}
                  strokeDashoffset={`-${0.5 * 351.8}`}
                  transform="rotate(-90 75 75)"
                />
                {/* In Progress (25%) -> Light warm grey */}
                <circle
                  cx="75"
                  cy="75"
                  r="56"
                  fill="transparent"
                  stroke="#D5D8D3"
                  strokeWidth="20"
                  strokeDasharray={`${0.25 * 351.8} 351.8`}
                  strokeDashoffset={`-${0.75 * 351.8}`}
                  transform="rotate(-90 75 75)"
                />
              </svg>
              <div className="hd-donut-center">
                <span className="hd-donut-total">{totalRequests}</span>
                <span className="hd-donut-label">Total</span>
              </div>
            </div>

            <div className="hd-donut-legend hd-status-legend">
              <div className="hd-legend-item">
                <span className="hd-legend-color" style={{ backgroundColor: '#13513C' }} />
                <span className="hd-legend-name">Resolved</span>
                <span className="hd-legend-val">{resolvedCount} (50%)</span>
              </div>
              <div className="hd-legend-item">
                <span className="hd-legend-color" style={{ backgroundColor: '#9CB3A3' }} />
                <span className="hd-legend-name">Pending</span>
                <span className="hd-legend-val">{pendingCount} (25%)</span>
              </div>
              <div className="hd-legend-item">
                <span className="hd-legend-color" style={{ backgroundColor: '#D5D8D3' }} />
                <span className="hd-legend-name">In Progress</span>
                <span className="hd-legend-val">{inProgressCount} (25%)</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Grid: Request by Type + Recent Reports */}
      <div className="hd-reports-bottom-grid">
        {/* Request by Type Bars Card */}
        <div className="hd-card hd-type-progress-card">
          <div className="hd-card-header-block">
            <h3 className="hd-card-title">Request by Type</h3>
            <span className="hd-card-desc">Returns vs replacements distribution.</span>
          </div>

          <div className="hd-type-progress-body">
            <div className="hd-progress-row">
              <span className="hd-progress-label">Returns</span>
              <div className="hd-progress-track">
                <div
                  className="hd-progress-bar"
                  style={{ width: '54%', backgroundColor: '#13513C' }}
                />
              </div>
              <span className="hd-progress-val">26 (54%)</span>
            </div>

            <div className="hd-progress-row">
              <span className="hd-progress-label">Replacements</span>
              <div className="hd-progress-track">
                <div
                  className="hd-progress-bar"
                  style={{ width: '46%', backgroundColor: '#13513C' }}
                />
              </div>
              <span className="hd-progress-val">22 (46%)</span>
            </div>
          </div>
        </div>

        {/* Recent Reports Table Card */}
        <div className="hd-card hd-recent-reports-card">
          <div className="hd-card-header-block">
            <h3 className="hd-card-title">Recent Reports</h3>
            <span className="hd-card-desc">Recently generated and downloaded reports.</span>
          </div>

          <div className="hd-table-wrapper">
            <table className="hd-table hd-reports-table">
              <thead>
                <tr>
                  <th>REPORT NAME</th>
                  <th>TYPE</th>
                  <th>GENERATED ON</th>
                  <th style={{ textAlign: 'right' }}>ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {recentReports.map((rep) => (
                  <tr key={rep.id}>
                    <td>
                      <div className="hd-report-name-cell">
                        <FileText size={16} strokeWidth={1.8} className="hd-report-file-icon" />
                        <span className="hd-report-name">{rep.name}</span>
                      </div>
                    </td>
                    <td>
                      <span className="hd-report-type-badge">{rep.type}</span>
                    </td>
                    <td className="hd-cell-subtle">{rep.date}</td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        type="button"
                        className="hd-table-action-btn"
                        title="Download report"
                        onClick={handleExport}
                      >
                        <Download size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

export default HandlerReportsView;

