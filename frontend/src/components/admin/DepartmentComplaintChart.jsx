import React, { useMemo } from 'react';

export function DepartmentComplaintChart({ complaints = [], departments = [] }) {
  // Compute distribution of complaints by current assigned department
  const stats = useMemo(() => {
    const total = complaints.length;
    if (total === 0) return [];

    // Map department id/name to counts
    const countMap = {};
    complaints.forEach((c) => {
      const deptName = c.current_department || 'Unassigned';
      countMap[deptName] = (countMap[deptName] || 0) + 1;
    });

    // Also include departments from departments list with 0 if not present
    departments.forEach((d) => {
      if (!(d.name in countMap)) {
        countMap[d.name] = 0;
      }
    });

    const entries = Object.entries(countMap).map(([name, count]) => ({
      name,
      count,
      percent: Math.round((count / total) * 100),
    }));

    // Sort descending by count
    return entries.sort((a, b) => b.count - a.count);
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
            Distribution across {complaints.length} registered complaints
          </div>
        </div>
      </div>

      {stats.length === 0 ? (
        <div style={{ padding: '24px 0', textAlign: 'center', color: '#909B9D', fontSize: '13px' }}>
          No complaint records recorded yet.
        </div>
      ) : (
        <div className="ad-dept-bars-list">
          {stats.slice(0, 6).map((item) => {
            const barWidth = Math.max(Math.round((item.count / maxCount) * 100), 2);
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
                    style={{ width: `${item.count === 0 ? 0 : barWidth}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default DepartmentComplaintChart;
