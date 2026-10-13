import React from 'react';
import { ArrowRight } from 'lucide-react';

export function DepartmentRedirections({
  redirectionData = { summary: {}, by_department_route: [] },
  isFullView = false,
}) {
  const routes = redirectionData.by_department_route || [];
  const summary = redirectionData.summary || {};

  return (
    <div className="ad-card-panel">
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
        <div className="ad-redirection-table-wrap">
          <table className="ad-redirection-table">
            <colgroup>
              <col className="ad-redirection-route-column" />
              <col className="ad-redirection-count-column" />
              <col className="ad-redirection-reason-column" />
            </colgroup>
            <thead>
              <tr>
                <th>From Department → To Department</th>
                <th style={{ textAlign: 'center' }}>Transfers</th>
                <th>Reason breakdown</th>
              </tr>
            </thead>
            <tbody>
              {routes.slice(0, isFullView ? 50 : 5).map((route, idx) => (
                <tr key={`${route.from_department_id}-${route.to_department_id}-${idx}`}>
                  <td>
                    <div className="ad-redirection-route">
                      <span>{route.from_department}</span>
                      <ArrowRight size={13} color="#909B9D" />
                      <strong>{route.to_department}</strong>
                    </div>
                  </td>
                  <td style={{ textAlign: 'center', fontWeight: '700' }}>
                    {route.total_transfer_events}
                  </td>
                  <td>
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
        </div>
      )}
    </div>
  );
}

export default DepartmentRedirections;
