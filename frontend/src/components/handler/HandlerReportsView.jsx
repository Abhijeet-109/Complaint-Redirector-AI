import React, { useState, useEffect } from 'react';
import {
  Layers,
  Package,
  ArrowLeftRight,
  MessageCircle,
  Download,
} from 'lucide-react';
import { HandlerKPICard } from './HandlerKPICard';
import { handlerService } from '../../services/handlerService';

export function HandlerReportsView({
  reportsData: initialData,
  loading: initialLoading = false,
}) {
  const [selectedTimeframe, setSelectedTimeframe] = useState('30days');
  const [selectedType, setSelectedType] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [reportsData, setReportsData] = useState(initialData || null);
  const [loading, setLoading] = useState(initialLoading);

  const daysMap = {
    '7days': 7,
    '30days': 30,
    '90days': 90,
  };

  useEffect(() => {
    let isMounted = true;
    const fetchFilteredStats = async () => {
      setLoading(true);
      try {
        const days = daysMap[selectedTimeframe] || 30;
        const res = await handlerService.getReportsStats({
          days,
          request_type: selectedType,
          status: selectedStatus,
        });
        if (isMounted && res) {
          setReportsData(res);
        }
      } catch (err) {
        console.error('Failed to fetch reports stats:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchFilteredStats();
    return () => {
      isMounted = false;
    };
  }, [selectedTimeframe, selectedType, selectedStatus]);

  const totalRequests = reportsData?.total_requests ?? 0;
  const returnsCount = reportsData?.returns_count ?? 0;
  const replacementsCount = reportsData?.replacements_count ?? 0;
  const complaintsCount = reportsData?.complaints ?? 0;

  const resolvedCount = reportsData?.resolved ?? 0;
  const pendingCount = reportsData?.pending ?? 0;
  const inProgressCount = reportsData?.in_progress ?? 0;

  const resolvedPct = totalRequests > 0 ? Math.round((resolvedCount / totalRequests) * 100) : 0;
  const pendingPct = totalRequests > 0 ? Math.round((pendingCount / totalRequests) * 100) : 0;
  const inProgressPct = totalRequests > 0 ? Math.round((inProgressCount / totalRequests) * 100) : 0;

  const returnsPct = totalRequests > 0 ? Math.round((returnsCount / totalRequests) * 100) : 0;
  const replacementsPct = totalRequests > 0 ? Math.round((replacementsCount / totalRequests) * 100) : 0;

  // Trend points
  const rawTrend = reportsData?.trend || [];
  const trendPoints = rawTrend.length > 0
    ? rawTrend
    : [
        { label: 'Day 1', val: 0 },
        { label: 'Day 3', val: 0 },
        { label: 'Day 6', val: 0 },
        { label: 'Day 9', val: 0 },
        { label: 'Day 12', val: 0 },
        { label: 'Day 15', val: 0 },
        { label: 'Day 18', val: 0 },
        { label: 'Day 21', val: 0 },
        { label: 'Day 24', val: 0 },
        { label: 'Day 27', val: 0 },
        { label: 'Day 30', val: 0 },
      ];

  const maxVal = Math.max(5, ...trendPoints.map((p) => p.val));
  const svgWidth = 520;
  const svgHeight = 160;

  const coords = trendPoints.map((pt, i) => {
    const x = 35 + (i / Math.max(1, trendPoints.length - 1)) * (svgWidth - 65);
    const y = svgHeight - 30 - (pt.val / maxVal) * (svgHeight - 55);
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

  const areaD = coords.length > 0
    ? `${pathD} L ${coords[coords.length - 1].x} ${svgHeight - 30} L ${coords[0].x} ${svgHeight - 30} Z`
    : '';

  // Donut chart math
  const donutRadius = 42;
  const donutCircumference = 2 * Math.PI * donutRadius;
  const resolvedOffset = 0;
  const resolvedDash = (resolvedPct / 100) * donutCircumference;
  const pendingDash = (pendingPct / 100) * donutCircumference;
  const inProgressDash = (inProgressPct / 100) * donutCircumference;

  const handleExport = () => {
    const days = daysMap[selectedTimeframe] || 30;
    const rows = [
      ['Metric', 'Value'],
      ['Total Requests', totalRequests],
      ['Returns', returnsCount],
      ['Replacements', replacementsCount],
      ['Complaints', complaintsCount],
      ['Resolved', resolvedCount],
      ['Pending', pendingCount],
      ['In Progress', inProgressCount],
      ['Timeframe Days', days],
      ['Selected Type', selectedType],
      ['Selected Status', selectedStatus],
    ];

    if (rawTrend.length > 0) {
      rows.push([]);
      rows.push(['Date Interval', 'Requests']);
      rawTrend.forEach((t) => rows.push([t.label, t.val]));
    }

    const csvContent = 'data:text/csv;charset=utf-8,' + rows.map((e) => e.join(',')).join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Flatkart_RR_Report_${new Date().toISOString().slice(0, 10)}.csv`);
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
          title="Export report dataset as CSV"
        >
          <Download size={16} />
          <span>Export Report</span>
        </button>
      </div>

      {/* Charts Row */}
      <div className="hd-reports-charts-grid">
        {/* Request Trend Card */}
        <div className="hd-card hd-reports-chart-card">
          <div className="hd-card-header">
            <div>
              <h3 className="hd-card-title">Request Trend</h3>
              <p className="hd-card-desc">Total return and replacement requests over time.</p>
            </div>
          </div>
          <div className="hd-trend-chart-container">
            <svg
              viewBox={`0 0 ${svgWidth} ${svgHeight}`}
              className="hd-trend-svg"
              preserveAspectRatio="none"
            >
              <defs>
                <linearGradient id="trendGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#0F3024" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="#0F3024" stopOpacity="0.0" />
                </linearGradient>
              </defs>

              {/* Grid Lines */}
              <line x1="30" y1="20" x2={svgWidth - 20} y2="20" stroke="#E5E1D8" strokeDasharray="3 3" />
              <line x1="30" y1={(svgHeight - 10) / 2} x2={svgWidth - 20} y2={(svgHeight - 10) / 2} stroke="#E5E1D8" strokeDasharray="3 3" />
              <line x1="30" y1={svgHeight - 30} x2={svgWidth - 20} y2={svgHeight - 30} stroke="#E5E1D8" />

              {/* Y Axis labels */}
              <text x="24" y="24" textAnchor="end" className="hd-chart-axis-text">{maxVal}</text>
              <text x="24" y={(svgHeight - 10) / 2 + 4} textAnchor="end" className="hd-chart-axis-text">{Math.round(maxVal / 2)}</text>
              <text x="24" y={svgHeight - 27} textAnchor="end" className="hd-chart-axis-text">0</text>

              {/* Area & Line */}
              {areaD && (
                <path d={areaD} fill="url(#trendGradient)" />
              )}
              {pathD && (
                <path
                  d={pathD}
                  fill="none"
                  stroke="#0F3024"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />
              )}

              {/* Data points */}
              {coords.map((pt, i) => (
                <circle
                  key={i}
                  cx={pt.x}
                  cy={pt.y}
                  r={totalRequests > 0 ? 3.5 : 2}
                  fill="#0F3024"
                  stroke="#FFFFFF"
                  strokeWidth="1.5"
                />
              ))}

              {/* X Axis Labels */}
              {coords.map((pt, i) => (
                <text
                  key={i}
                  x={pt.x}
                  y={svgHeight - 10}
                  textAnchor="middle"
                  className="hd-chart-axis-text"
                >
                  {pt.label}
                </text>
              ))}
            </svg>
          </div>
        </div>

        {/* Requests by Status Card */}
        <div className="hd-card hd-reports-chart-card">
          <div className="hd-card-header">
            <div>
              <h3 className="hd-card-title">Requests by Status</h3>
              <p className="hd-card-desc">Current distribution of all requests.</p>
            </div>
          </div>
          <div className="hd-status-donut-container">
            <div className="hd-donut-wrapper">
              <svg viewBox="0 0 100 100" className="hd-donut-svg">
                <circle
                  cx="50"
                  cy="50"
                  r={donutRadius}
                  fill="none"
                  stroke="#EFECE6"
                  strokeWidth="14"
                />
                {totalRequests > 0 ? (
                  <>
                    {/* Resolved */}
                    <circle
                      cx="50"
                      cy="50"
                      r={donutRadius}
                      fill="none"
                      stroke="#0F3024"
                      strokeWidth="14"
                      strokeDasharray={`${resolvedDash} ${donutCircumference}`}
                      strokeDashoffset={-resolvedOffset}
                      strokeLinecap="round"
                    />
                    {/* Pending */}
                    <circle
                      cx="50"
                      cy="50"
                      r={donutRadius}
                      fill="none"
                      stroke="#7D988B"
                      strokeWidth="14"
                      strokeDasharray={`${pendingDash} ${donutCircumference}`}
                      strokeDashoffset={-(resolvedDash)}
                      strokeLinecap="round"
                    />
                    {/* In Progress */}
                    <circle
                      cx="50"
                      cy="50"
                      r={donutRadius}
                      fill="none"
                      stroke="#C8D4CD"
                      strokeWidth="14"
                      strokeDasharray={`${inProgressDash} ${donutCircumference}`}
                      strokeDashoffset={-(resolvedDash + pendingDash)}
                      strokeLinecap="round"
                    />
                  </>
                ) : null}
              </svg>
              <div className="hd-donut-center">
                <span className="hd-donut-value">{totalRequests}</span>
                <span className="hd-donut-label">Total</span>
              </div>
            </div>

            <div className="hd-status-legend">
              <div className="hd-legend-item">
                <span className="hd-legend-dot" style={{ backgroundColor: '#0F3024' }} />
                <span className="hd-legend-label">Resolved</span>
                <span className="hd-legend-count">{resolvedCount} ({resolvedPct}%)</span>
              </div>
              <div className="hd-legend-item">
                <span className="hd-legend-dot" style={{ backgroundColor: '#7D988B' }} />
                <span className="hd-legend-label">Pending</span>
                <span className="hd-legend-count">{pendingCount} ({pendingPct}%)</span>
              </div>
              <div className="hd-legend-item">
                <span className="hd-legend-dot" style={{ backgroundColor: '#C8D4CD' }} />
                <span className="hd-legend-label">In Progress</span>
                <span className="hd-legend-count">{inProgressCount} ({inProgressPct}%)</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Grid: Request by Type + Recent Reports */}
      <div className="hd-reports-bottom-grid">
        {/* Request by Type */}
        <div className="hd-card hd-type-compact-card">
          <div className="hd-card-header">
            <div>
              <h3 className="hd-card-title">Request by Type</h3>
              <p className="hd-card-desc">Returns vs replacements distribution.</p>
            </div>
          </div>
          <div className="hd-type-compact-body">
            <div className="hd-type-bar-row">
              <span className="hd-type-bar-label">Returns</span>
              <div className="hd-type-track">
                <div
                  className="hd-type-fill"
                  style={{ width: `${returnsPct}%`, backgroundColor: '#0F3024' }}
                />
              </div>
              <span className="hd-type-bar-val">{returnsCount} ({returnsPct}%)</span>
            </div>

            <div className="hd-type-bar-row">
              <span className="hd-type-bar-label">Replacements</span>
              <div className="hd-type-track">
                <div
                  className="hd-type-fill"
                  style={{ width: `${replacementsPct}%`, backgroundColor: '#1A4D3A' }}
                />
              </div>
              <span className="hd-type-bar-val">{replacementsCount} ({replacementsPct}%)</span>
            </div>
          </div>
        </div>

        {/* Recent Reports */}
        <div className="hd-card hd-type-compact-card">
          <div className="hd-card-header">
            <div>
              <h3 className="hd-card-title">Recent Reports</h3>
              <p className="hd-card-desc">Recently generated and downloaded reports.</p>
            </div>
          </div>
          <table className="hd-table hd-reports-table">
            <thead>
              <tr>
                <th>REPORT NAME</th>
                <th>TYPE</th>
                <th>GENERATED ON</th>
                <th>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {totalRequests > 0 ? (
                <>
                  <tr>
                    <td className="hd-report-name-cell">
                      <span className="hd-report-name">Requests Summary (Last 30 Days)</span>
                    </td>
                    <td><span className="hd-report-type-badge">Summary</span></td>
                    <td className="hd-cell-timestamp">
                      {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </td>
                    <td>
                      <button type="button" className="hd-table-action-btn" title="Download" onClick={handleExport}>
                        <Download size={15} />
                      </button>
                    </td>
                  </tr>
                </>
              ) : (
                <tr>
                  <td colSpan={4} className="hd-table-empty">No reports generated yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default HandlerReportsView;
