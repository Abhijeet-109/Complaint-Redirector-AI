import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const STATUS_TONES = {
  delivered: 'green',
  confirmed: 'green',
  processing: 'amber',
  shipped: 'blue',
  'in transit': 'blue',
  placed: 'neutral',
  cancelled: 'red',
  canceled: 'red',
};

function getStatusTone(value) {
  const normalized = value.trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
  return STATUS_TONES[normalized];
}

function formatStatusLabel(value) {
  const normalized = value.trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
  if (normalized === 'canceled' || normalized === 'cancelled') return 'Cancelled';
  return normalized.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getPlainText(children) {
  if (typeof children === 'string' || typeof children === 'number') return String(children);
  if (Array.isArray(children)) return children.map(getPlainText).join('');
  if (React.isValidElement(children)) return getPlainText(children.props.children);
  return '';
}

function StatusBadge({ children, tone }) {
  return <span className={`fk-chat-status-badge fk-chat-status-${tone}`}>{children}</span>;
}

function renderStatusValue(children) {
  const label = getPlainText(children);
  const tone = getStatusTone(label);
  return tone ? <StatusBadge tone={tone}>{formatStatusLabel(label)}</StatusBadge> : children;
}

const markdownComponents = {
  p({ children, ...props }) {
    if (typeof children === 'string') {
      const match = children.match(/^(\s*(?:(?:order|shipment|return)\s+)?status\s*:\s*)([a-z _-]+)(\s*)$/i);
      const tone = match && getStatusTone(match[2]);
      if (tone) {
        return <p {...props}>{match[1]}<StatusBadge tone={tone}>{formatStatusLabel(match[2])}</StatusBadge>{match[3]}</p>;
      }
    }
    return <p {...props}>{children}</p>;
  },
  strong({ children, ...props }) {
    const label = getPlainText(children);
    const tone = getStatusTone(label);
    return tone
      ? <StatusBadge tone={tone}>{formatStatusLabel(label)}</StatusBadge>
      : <strong {...props}>{children}</strong>;
  },
  td({ children, ...props }) {
    return <td {...props}>{renderStatusValue(children)}</td>;
  },
  table({ children, ...props }) {
    return (
      <div className="fk-chat-table-scroll" role="region" aria-label="Scrollable response table" tabIndex={0}>
        <table {...props}>{children}</table>
      </div>
    );
  },
  input({ checked, ...props }) {
    return <input {...props} checked={checked} disabled type="checkbox" />;
  },
};

export function ChatMessageMarkdown({ children }) {
  return <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>{children}</ReactMarkdown>;
}

export default ChatMessageMarkdown;
