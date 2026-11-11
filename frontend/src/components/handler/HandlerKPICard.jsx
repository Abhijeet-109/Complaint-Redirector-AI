import React from 'react';

export function HandlerKPICard({
  title,
  value,
  icon: Icon,
  subtitle,
  trend,
  viewAllLink,
  onViewAll,
  className = '',
}) {
  return (
    <div className={`hd-kpi-card ${className}`}>
      <div className="hd-kpi-header">
        <span className="hd-kpi-title">{title}</span>
        {Icon && <Icon className="hd-kpi-icon" size={18} strokeWidth={1.8} />}
      </div>
      <div className="hd-kpi-value">{value ?? 0}</div>
      {(subtitle || trend || viewAllLink) && (
        <div className="hd-kpi-footer">
          {trend && (
            <span className="hd-kpi-trend">
              <span className="hd-kpi-trend-arrow">↑</span> {trend}
            </span>
          )}
          {subtitle && <span className="hd-kpi-subtitle">{subtitle}</span>}
          {viewAllLink && (
            <button
              type="button"
              className="hd-kpi-view-all"
              onClick={onViewAll}
            >
              {viewAllLink}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default HandlerKPICard;

