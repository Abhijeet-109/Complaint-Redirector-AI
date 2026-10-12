import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { adminService } from '../../../services/adminService';

const METRICS = [
  ['total_requests', 'Requests'],
  ['responses_with_sources', 'Responses with Sources'],
  ['fallback_responses', 'Fallbacks'],
  ['failed_requests', 'Errors'],
  ['average_latency_ms', 'Average Latency'],
];

function displayMetric(key, value) {
  if (value == null) return '—';
  return key === 'average_latency_ms' ? `${value} ms` : value;
}

function displayDate(timestamp) {
  if (!timestamp) return '—';
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
}

export function ChatbotPerformancePanel() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setData(await adminService.getChatbotPerformance());
      setError('');
    } catch (requestError) {
      setError(requestError.message || 'Chatbot telemetry is unavailable.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return (
    <div className="fk-pipe-panel">
      <div className="fk-pipe-panel-header">
        <div><h2 className="fk-pipe-panel-title">Chatbot Performance</h2><span className="fk-pipe-panel-sub">Persisted telemetry · last 30 days</span></div>
        <button type="button" className="fk-pipe-btn-secondary" onClick={refresh} disabled={loading}><RefreshCw size={14} /> Refresh</button>
      </div>
      {error ? <p className="fk-pipe-config-error" role="alert">{error}</p> : <>
        <div className="fk-pipe-perf-grid" aria-label="Performance summary metrics">
          {METRICS.map(([key, label]) => <div key={key} className="fk-pipe-kpi-card">
            <div className="fk-pipe-kpi-label">{label}</div>
            <div className="fk-pipe-kpi-val">{loading ? '…' : displayMetric(key, data?.[key])}</div>
            <div className="fk-pipe-kpi-sub">{key === 'average_latency_ms' ? 'Mean request latency' : 'Recorded requests'}</div>
          </div>)}
        </div>
        <div style={{ marginTop: '12px', marginBottom: '10px' }}><h3 style={{ fontSize: '14.5px', fontWeight: '800', color: 'var(--fk-text-primary, #1C352F)' }}>Recent Queries</h3></div>
        <div className="fk-pipe-table-wrapper"><table className="fk-pipe-table">
          <thead><tr><th>Timestamp</th><th>User Question</th><th>Outcome</th><th>Sources</th><th>Latency</th></tr></thead>
          <tbody>{loading ? <tr><td colSpan={5} className="fk-pipe-empty-table-msg">Loading telemetry…</td></tr>
            : (data?.recent_queries || []).length === 0 ? <tr><td colSpan={5} className="fk-pipe-empty-table-msg">No chatbot request history is available for the last 30 days.</td></tr>
              : data.recent_queries.map((query, index) => <tr key={`${query.timestamp}-${index}`}>
                <td>{displayDate(query.timestamp)}</td><td>{query.question_preview}</td><td>{query.outcome}</td>
                <td title={(query.sources || []).join(', ')}>{query.source_count}</td><td>{displayMetric('average_latency_ms', query.latency_ms)}</td>
              </tr>)}</tbody>
        </table></div>
        {!loading && data && <p className="fk-pipe-panel-sub">Responses with sources indicate retrieved references, not verified answer accuracy.</p>}
      </>}
    </div>
  );
}

export default ChatbotPerformancePanel;
