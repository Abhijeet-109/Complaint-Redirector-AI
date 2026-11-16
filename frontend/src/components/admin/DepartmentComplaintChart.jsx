import React, { useMemo } from 'react';

const CANONICAL_DEPARTMENTS = [
  'Returns & Replacement',
  'Account & Security',
  'Technical Support',
  'Payments & Refunds',
  'Order & Delivery',
  'Product & Quality',
];

export function DepartmentComplaintChart({ complaints = [], departments = [] }) {
  // Compute distribution of complaints across canonical & assigned departments
  const stats = useMemo(() => {
    const total = complaints.length;

    // Seed map with the 6 canonical departments at 0
    const countMap = {};
    CANONICAL_DEPARTMENTS.forEach((dept) => {
      countMap[dept] = 0;
    });

    // Also include any active departments from DB/API
    departments.forEach((d) => {
      if (d?.name && !(d.name in countMap)) {
        countMap[d.name] = 0;
      }
    });

    // Count complaints by current assigned department
    complaints.forEach((c) => {
      const deptName = c.current_department || 'Unassigned';
      countMap[deptName] = (countMap[deptName] || 0) + 1;
    });

    const entries = Object.entries(countMap).map(([name, count]) => ({
      name,
      count,
      percent: total > 0 ? Math.round((count / total) * 100) : 0,
    }));

    // Sort descending by count, then alphabetically
    return entries.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [complaints, departments]);

  const maxCount = useMemo(() => {
    return Math.max(...stats.map((s) => s.count), 1);
  }, [stats]);

  return (
    <div className="ad-card-panel">
      <div className="ad-card-panel-header">
        <div>
          <div className="ad-card-panel-title">Complaints by Department</div>
          <div className="ad-card-panel-sub">
            Distribution across {complaints.length} registered {complaints.length === 1 ? 'complaint' : 'complaints'}
          </div>
        </div>
      </div>

      <div className="ad-dept-bars-list">
        {stats.slice(0, 6).map((item) => {
          const barWidth = Math.max(Math.round((item.count / maxCount) * 100), 0);
          return (
            <div key={item.name} className="ad-dept-bar-item">
              <div className="ad-dept-bar-meta">
                <span className="ad-dept-bar-name">{item.name}</span>
                <span className="ad-dept-bar-stats" style={{ fontWeight: '700', fontSize: '13px' }}>
                  {item.count}
                </span>
              </div>
              <div className="ad-dept-bar-track">
                <div
                  className="ad-dept-bar-fill"
                  style={{ width: `${item.count === 0 ? 0 : Math.max(barWidth, 2)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default DepartmentComplaintChart;
