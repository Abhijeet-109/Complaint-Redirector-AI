import React from 'react';

/**
 * Maps API complaint statuses to formatted labels and pill styles
 * according to Flatkart design specifications.
 */
export function ComplaintStatusBadge({ status }) {
  const normalized = (status || '').toLowerCase().trim();

  let label = 'Open';
  let badgeStyle = {
    backgroundColor: '#FEEFE6',
    color: '#D46238',
    border: '1px solid rgba(212, 98, 56, 0.2)',
  };

  if (normalized === 'in_progress' || normalized === 'in progress' || normalized === 'reviewing') {
    label = 'In Progress';
    badgeStyle = {
      backgroundColor: '#FEF7DC',
      color: '#A87C33',
      border: '1px solid rgba(168, 124, 51, 0.2)',
    };
  } else if (normalized === 'resolved' || normalized === 'completed') {
    label = 'Resolved';
    badgeStyle = {
      backgroundColor: '#E6EDE6',
      color: '#4B6B52',
      border: '1px solid rgba(75, 107, 82, 0.25)',
    };
  } else if (normalized === 'closed') {
    label = 'Closed';
    badgeStyle = {
      backgroundColor: '#EDEDE8',
      color: '#666662',
      border: '1px solid rgba(102, 102, 98, 0.2)',
    };
  } else if (normalized === 'pending' || normalized === 'open') {
    label = 'Open';
    badgeStyle = {
      backgroundColor: '#FEEFE6',
      color: '#D46238',
      border: '1px solid rgba(212, 98, 56, 0.2)',
    };
  } else {
    // Default fallback preserving the raw status name
    label = status ? status.charAt(0).toUpperCase() + status.slice(1) : 'Open';
  }

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '3px 12px',
        borderRadius: '14px',
        fontSize: '12px',
        fontWeight: '600',
        lineHeight: '1.2',
        letterSpacing: '0.02em',
        textTransform: 'capitalize',
        ...badgeStyle,
      }}
    >
      {label}
    </span>
  );
}

export default ComplaintStatusBadge;
