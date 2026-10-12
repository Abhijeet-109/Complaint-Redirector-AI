import React from 'react';
import { BarChart3 } from 'lucide-react';

const PERF_METRICS = [
  { id: 'requests', label: 'Requests', value: '—' },
  { id: 'responses', label: 'Responses with Sources', value: '—' },
  { id: 'fallbacks', label: 'Fallbacks', value: '—' },
  { id: 'errors', label: 'Errors', value: '—' },
  { id: 'latency', label: 'Average Latency', value: '—' },
];

export function ChatbotPerformancePanel({ onPreviewDeleteModal }) {
  return (
    <div className="fk-pipe-panel">
      {/* Header */}
      <div className="fk-pipe-panel-header">
        <div>
          <h2 className="fk-pipe-panel-title">Chatbot Performance</h2>
          <span className="fk-pipe-panel-sub">View preview · live data when connected</span>
        </div>
        <span className="fk-pipe-badge-pending" style={{ fontSize: '11px', padding: '4px 10px' }}>
          Telemetry API pending
        </span>
      </div>

      {/* 5 Performance KPI Cards */}
      <div className="fk-pipe-perf-grid" aria-label="Performance summary metrics">
        {PERF_METRICS.map((item) => (
          <div key={item.id} className="fk-pipe-kpi-card">
            <div className="fk-pipe-kpi-label">{item.label}</div>
            <div className="fk-pipe-kpi-val">{item.value}</div>
            <div className="fk-pipe-kpi-sub">Backend integration pending</div>
          </div>
        ))}
      </div>

      {/* Chart Visualization Area */}
      <div className="fk-pipe-chart-box" aria-label="Performance telemetry chart placeholder">
        <BarChart3 size={28} color="#A29C90" />
        <div className="fk-pipe-chart-state-title">Awaiting telemetry</div>
        <div className="fk-pipe-chart-state-sub">
          Chatbot performance charts will appear after backend telemetry is connected.
        </div>
      </div>

      {/* Recent Queries Table Header */}
      <div style={{ marginTop: '12px', marginBottom: '10px' }}>
        <h3 style={{ fontSize: '14.5px', fontWeight: '800', color: 'var(--fk-text-primary, #1C352F)' }}>
          Recent Queries
        </h3>
      </div>

      {/* Recent Queries Table */}
      <div className="fk-pipe-table-wrapper">
        <table className="fk-pipe-table">
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>User Question</th>
              <th>Outcome (Answered / Fallback / Error)</th>
              <th>Sources</th>
              <th>Latency</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td colSpan={6} className="fk-pipe-empty-table-msg">
                Query history will appear after backend telemetry is connected.
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Bottom Right Preview Button (matching baseline screenshot) */}
      <div className="fk-pipe-bottom-preview-row">
        <button
          type="button"
          className="fk-pipe-btn-secondary"
          onClick={onPreviewDeleteModal}
          title="Preview delete confirmation modal as shown in baseline mock"
        >
          Preview delete modal
        </button>
      </div>
    </div>
  );
}

export default ChatbotPerformancePanel;
