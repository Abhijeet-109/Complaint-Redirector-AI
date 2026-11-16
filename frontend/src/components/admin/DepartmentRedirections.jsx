import React from 'react';
import { ArrowRight } from 'lucide-react';

export function DepartmentRedirections({
  redirectionData = { summary: {}, by_department_route: [] },
  isFullView = false,
  maxRows = null,
  onNavigate = null,
}) {
  const routes = redirectionData.by_department_route || [];
  const summary = redirectionData.summary || {};
  const limit = maxRows !== null ? maxRows : (isFullView ? 50 : 4);

  return (
    <div className="ad-card-panel" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div className="ad-card-panel-header">
        <div>
          <div className="ad-card-panel-title">Department Redirections</div>
          <div className="ad-card-panel-sub">
            {summary.total_transfer_events || 0} total transfer events · {summary.total_complaints_forwarded || 0} unique complaints
          </div>
        </div>
      </div>

      {isFullView && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '18px' }}>
          <div style={{ background: '#FAF8F4', padding: '12px', borderRadius: '8px', border: '1px solid #ECE7DC' }}>
            <div style={{ fontSize: '11px', color: '#748082', fontWeight: '700', textTransform: 'uppercase' }}>Total Transfers</div>
            <div style={{ fontSize: '20px', fontWeight: '800', color: 'var(--fk-text-primary)', marginTop: '4px' }}>
              {summary.total_transfer_events || 0}
            </div>
          </div>
          <div style={{ background: '#FAF8F4', padding: '12px', borderRadius: '8px', border: '1px solid #ECE7DC' }}>
            <div style={{ fontSize: '11px', color: '#748082', fontWeight: '700', textTransform: 'uppercase' }}>Unique Complaints</div>
            <div style={{ fontSize: '20px', fontWeight: '800', color: 'var(--fk-text-primary)', marginTop: '4px' }}>
              {summary.total_complaints_forwarded || 0}
            </div>
          </div>
          <div style={{ background: '#FAF8F4', padding: '12px', borderRadius: '8px', border: '1px solid #ECE7DC' }}>
            <div style={{ fontSize: '11px', color: '#C05B4B', fontWeight: '700', textTransform: 'uppercase' }}>Model Faults</div>
            <div style={{ fontSize: '20px', fontWeight: '800', color: '#C05B4B', marginTop: '4px' }}>
              {summary.model_fault_transfers || 0}
            </div>
          </div>
          <div style={{ background: '#FAF8F4', padding: '12px', borderRadius: '8px', border: '1px solid #ECE7DC' }}>
            <div style={{ fontSize: '11px', color: '#4558A6', fontWeight: '700', textTransform: 'uppercase' }}>Further Processing</div>
            <div style={{ fontSize: '20px', fontWeight: '800', color: '#4558A6', marginTop: '4px' }}>
              {summary.further_processing_transfers || 0}
            </div>
          </div>
        </div>
      )}

      {routes.length === 0 ? (
        <div style={{ padding: '24px 0', textAlign: 'center', color: '#909B9D', fontSize: '13px' }}>
          No department transfers logged yet.
        </div>
      ) : (
        <div className={`ad-redirection-table-wrap ${isFullView ? 'full-view' : 'mini-view'}`} style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <table className={`ad-redirection-table ${isFullView ? '' : 'ad-redirection-mini-table'}`}>
            <colgroup>
              <col style={{ width: isFullView ? '57%' : '58%' }} />
              <col style={{ width: isFullView ? '12%' : '14%' }} />
              <col style={{ width: isFullView ? '31%' : '28%' }} />
            </colgroup>
            <thead>
              <tr>
                <th>Department Route</th>
                <th style={{ textAlign: 'center' }}>Transfers</th>
                <th style={{ paddingLeft: isFullView ? undefined : '18px' }}>Reason Breakdown</th>
              </tr>
            </thead>
            <tbody>
              {routes.slice(0, limit).map((route, idx) => (
                <tr key={`${route.from_department_id}-${route.to_department_id}-${idx}`}>
                  <td>
                    <div className="ad-redirection-route">
                      <span>{route.from_department}</span>
                      <ArrowRight size={13} color="#909B9D" style={{ flexShrink: 0 }} />
                      <strong>{route.to_department}</strong>
                    </div>
                  </td>
                  <td style={{ textAlign: 'center', fontWeight: '700' }}>
                    {route.total_transfer_events}
                  </td>
                  <td style={{ paddingLeft: isFullView ? undefined : '18px' }}>
                    <div className="ad-reason-breakdown">
                      <span className="ad-reason-fault">
                        Model fault: {route.model_fault_transfers || 0}
                      </span>
                      <span className="ad-reason-proc">
                        Further processing: {route.further_processing_transfers || 0}
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!isFullView && routes.length > limit && (
            <div style={{ padding: '8px 4px 0', marginTop: 'auto', fontSize: '11.5px', color: '#748082', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Showing top {limit} of {routes.length} routes</span>
              {onNavigate && (
                <button
                  type="button"
                  style={{ background: 'none', border: 'none', color: '#183A34', fontWeight: '700', cursor: 'pointer', padding: 0 }}
                  onClick={() => onNavigate('analytics')}
                >
                  View all in Analytics →
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default DepartmentRedirections;
