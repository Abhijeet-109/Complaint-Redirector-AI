import React from 'react';

const KPI_METRICS = [
  {
    id: 'total_docs',
    label: 'Total Documents',
    value: '—',
    subtext: 'Connect backend',
  },
  {
    id: 'pending_approval',
    label: 'Pending Approval',
    value: '—',
    subtext: 'Connect backend',
  },
  {
    id: 'indexed_docs',
    label: 'Indexed Documents',
    value: '—',
    subtext: 'Connect backend',
  },
  {
    id: 'indexed_chunks',
    label: 'Indexed Chunks',
    value: '—',
    subtext: 'Connect backend',
  },
  {
    id: 'indexing_failures',
    label: 'Indexing Failures',
    value: '—',
    subtext: 'Connect backend',
  },
  {
    id: 'chatbot_queries',
    label: 'Chatbot Queries',
    value: '—',
    subtext: 'Connect backend',
  },
  {
    id: 'fallback_responses',
    label: 'Fallback Responses',
    value: '—',
    subtext: 'Live data when connected',
  },
];

export function PipelineKpiCards() {
  return (
    <div className="fk-pipe-kpi-grid" aria-label="Pipeline overview metrics">
      {KPI_METRICS.map((kpi) => (
        <div key={kpi.id} className="fk-pipe-kpi-card">
          <div className="fk-pipe-kpi-label">{kpi.label}</div>
          <div className="fk-pipe-kpi-val">{kpi.value}</div>
          <div className="fk-pipe-kpi-sub">{kpi.subtext}</div>
        </div>
      ))}
    </div>
  );
}

export default PipelineKpiCards;
