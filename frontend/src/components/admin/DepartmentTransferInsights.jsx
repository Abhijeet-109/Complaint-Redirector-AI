import React, { useMemo } from 'react';
import { ArrowRight, ArrowRightLeft, Sparkles, Building2, ShieldAlert } from 'lucide-react';

export function DepartmentTransferInsights({ redirectionData = { summary: {}, by_department_route: [] } }) {
  const summary = redirectionData?.summary || {};
  const routes = redirectionData?.by_department_route || [];
  const totalEvents = summary.total_transfer_events || 0;
  const totalComplaints = summary.total_complaints_forwarded || 0;
  const modelFaults = summary.model_fault_transfers || 0;
  const furtherProcessing = summary.further_processing_transfers || 0;

  // 1. Most frequent transfer route
  const mostFrequentRoute = useMemo(() => {
    if (!routes || routes.length === 0) return null;
    return [...routes].sort((a, b) => (b.total_transfer_events || 0) - (a.total_transfer_events || 0))[0];
  }, [routes]);

  // 2. Department activity (involvement count across incoming and outgoing)
  const topDepartments = useMemo(() => {
    if (!routes || routes.length === 0) return [];
    const counts = {};
    routes.forEach((r) => {
      const weight = r.total_transfer_events || 1;
      if (r.from_department) counts[r.from_department] = (counts[r.from_department] || 0) + weight;
      if (r.to_department) counts[r.to_department] = (counts[r.to_department] || 0) + weight;
    });
    return Object.entries(counts)
      .map(([name, transfers]) => ({ name, transfers }))
      .sort((a, b) => b.transfers - a.transfers)
      .slice(0, 2);
  }, [routes]);

  // 3. Dominant reason analysis
  const dominantReason = useMemo(() => {
    if (modelFaults === 0 && furtherProcessing === 0) return null;
    if (modelFaults > furtherProcessing) return { label: 'Model Fault', count: modelFaults };
    if (furtherProcessing > modelFaults) return { label: 'Further Processing', count: furtherProcessing };
    return { label: 'Equal Split', count: modelFaults };
  }, [modelFaults, furtherProcessing]);

  // 4. Factual operational observation
  const observation = useMemo(() => {
    if (totalEvents === 0) return 'No department redirection events logged in the system.';
    if (routes.length === 1 && mostFrequentRoute) {
      return `All ${totalEvents} transfer events are concentrated along the ${mostFrequentRoute.from_department} → ${mostFrequentRoute.to_department} route.`;
    }
    if (topDepartments.length > 0) {
      return `${topDepartments[0].name} has the highest transfer involvement across active units (${topDepartments[0].transfers} transfer events).`;
    }
    return `${totalComplaints} unique ${totalComplaints === 1 ? 'complaint' : 'complaints'} rerouted across ${totalEvents} total transfer events.`;
  }, [totalEvents, routes, mostFrequentRoute, topDepartments, totalComplaints]);

  return (
    <div className="ad-card-panel ad-transfer-insights-card">
      <div className="ad-card-panel-header" style={{ marginBottom: '14px' }}>
        <div>
          <div className="ad-card-panel-title">Department Transfer Insights</div>
          <div className="ad-card-panel-sub">
            Operational summary of actual department transfer activity
          </div>
        </div>
      </div>

      {totalEvents === 0 ? (
        <div style={{ padding: '36px 0', textAlign: 'center', color: '#909B9D', fontSize: '13px' }}>
          No department transfer activity logged yet.
        </div>
      ) : (
        <div className="ad-insights-content-grid">
          {/* Section 1: Most Frequent Transfer */}
          <div className="ad-insight-section">
            <div className="ad-insight-header-tag">MOST FREQUENT TRANSFER</div>
            {mostFrequentRoute ? (
              <div className="ad-insight-route-box">
                <div className="ad-insight-route-pair">
                  <span className="ad-insight-dept-name">{mostFrequentRoute.from_department}</span>
                  <ArrowRight size={13} className="ad-insight-arrow" />
                  <span className="ad-insight-dept-name highlight">{mostFrequentRoute.to_department}</span>
                </div>
                <div className="ad-insight-route-count">
                  <strong>{mostFrequentRoute.total_transfer_events}</strong> transfer{mostFrequentRoute.total_transfer_events > 1 ? 's' : ''}
                </div>
              </div>
            ) : (
              <div className="ad-insight-empty">—</div>
            )}
          </div>

          {/* Section 2: Main Redirection Reason */}
          <div className="ad-insight-section">
            <div className="ad-insight-header-tag">MAIN REDIRECTION REASON</div>
            <div className="ad-insight-reasons-row">
              <span className={`ad-insight-reason-badge ${dominantReason?.label === 'Model Fault' ? 'dominant' : ''}`}>
                Model fault: <strong>{modelFaults}</strong>
              </span>
              <span className={`ad-insight-reason-badge ${dominantReason?.label === 'Further Processing' ? 'dominant' : ''}`}>
                Further processing: <strong>{furtherProcessing}</strong>
              </span>
            </div>
          </div>

          {/* Section 3: Most Involved Departments */}
          <div className="ad-insight-section">
            <div className="ad-insight-header-tag">MOST INVOLVED DEPARTMENTS</div>
            <div className="ad-insight-dept-list">
              {topDepartments.map((dept, idx) => (
                <div key={dept.name} className="ad-insight-dept-row">
                  <span className="ad-insight-dept-name">{dept.name}</span>
                  <span className="ad-insight-dept-count">
                    {dept.transfers} transfer{dept.transfers > 1 ? 's' : ''}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Section 4: Operational Insight */}
          <div className="ad-insight-observation-box">
            <div className="ad-insight-observation-header">
              <Sparkles size={13} className="ad-insight-sparkle-icon" />
              <span>OPERATIONAL INSIGHT</span>
            </div>
            <div className="ad-insight-observation-text">
              {observation}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default DepartmentTransferInsights;
