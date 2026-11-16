import React from 'react';

export function HandlerStatusBadge({ status, label }) {
  const norm = String(status || '').toLowerCase().replace(/[\s-]/g, '_');

  let config = {
    bg: '#FEF3C7',
    color: '#92400E',
    dot: '#D97706',
    text: label || 'Pending Review',
  };

  if (norm === 'pending_review' || norm === 'pending' || norm === 'requested' || norm === 'under_review') {
    config = {
      bg: '#FEF3C7',
      color: '#92400E',
      dot: '#D97706',
      text: label || (norm === 'pending' ? 'Pending' : 'Pending Review'),
    };
  } else if (norm === 'in_process' || norm === 'in_progress' || norm === 'in process' || norm === 'in progress' || norm === 'followed_up') {
    config = {
      bg: '#E0E7FF',
      color: '#3730A3',
      dot: '#4F46E5',
      text: label || (norm.includes('process') ? 'In Process' : 'In Progress'),
    };
  } else if (norm === 'approved') {
    config = {
      bg: '#D1FAE5', color: '#065F46', dot: '#059669',
      text: label || 'Approved',
    };
  } else if (norm === 'not_required' || norm === 'not_initiated') {
    config = {
      bg: '#F3F4F6', color: '#4B5563', dot: '#9CA3AF',
      text: label || (norm === 'not_required' ? 'Not Required' : 'Not Initiated'),
    };
  } else if (norm === 'resolved' || norm === 'completed') {
    config = {
      bg: '#D1FAE5',
      color: '#065F46',
      dot: '#059669',
      text: label || (norm === 'completed' ? 'Completed' : 'Resolved'),
    };
  } else if (norm === 'information_requested' || norm === 'info_requested') {
    config = {
      bg: '#EDE9FE',
      color: '#5B21B6',
      dot: '#7C3AED',
      text: label || 'Information Requested',
    };
  } else if (norm === 'under_inspection' || norm === 'inspection') {
    config = {
      bg: '#FFEDD5',
      color: '#9A3412',
      dot: '#EA580C',
      text: label || 'Under Inspection',
    };
  } else if (norm === 'complaint_raised') {
    config = {
      bg: '#EDE9FE',
      color: '#6D28D9',
      dot: '#8B5CF6',
      text: label || 'Complaint Raised',
    };
  } else if (norm === 'failed' || norm === 'rejected' || norm === 'cancelled') {
    config = {
      bg: '#FEE2E2',
      color: '#991B1B',
      dot: '#DC2626',
      text: label || (norm.charAt(0).toUpperCase() + norm.slice(1)),
    };
  }

  return (
    <span
      className="hd-status-badge"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '3px 10px',
        borderRadius: '9999px',
        fontSize: '12px',
        fontWeight: '600',
        backgroundColor: config.bg,
        color: config.color,
        lineHeight: 1.3,
        whiteSpace: 'nowrap',
      }}
    >
      <span
        style={{
          width: '6px',
          height: '6px',
          borderRadius: '50%',
          backgroundColor: config.dot,
          flexShrink: 0,
        }}
      />
      {config.text}
    </span>
  );
}

export default HandlerStatusBadge;

