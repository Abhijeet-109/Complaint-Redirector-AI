import React from 'react';

export function MetricCard({ label, value, sub = 'Live Data', icon: Icon, color }) {
  return (
    <div className="ad-metric-card">
      <div className="ad-metric-info">
        <span className="ad-metric-label">{label}</span>
        <span className="ad-metric-val" style={color ? { color } : undefined}>
          {typeof value === 'number' ? value.toLocaleString() : value ?? '—'}
        </span>
        <span className="ad-metric-sub">{sub}</span>
      </div>
      {Icon && (
        <div className="ad-metric-icon" style={color ? { color } : undefined}>
          <Icon size={20} strokeWidth={2.2} />
        </div>
      )}
    </div>
  );
}

export default MetricCard;
