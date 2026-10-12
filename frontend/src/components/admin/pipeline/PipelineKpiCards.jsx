import React from 'react';

const UNAVAILABLE_METRICS = [
  { id: 'indexing_failures', label: 'Indexing Failures' },
  { id: 'chatbot_queries', label: 'Chatbot Queries' },
];

export function PipelineKpiCards({ documents = [], isLoading = false, error = '' }) {
  const indexedDocuments = documents.filter((document) => document.status === 'indexed');
  const metrics = [
    {
      id: 'total_docs',
      label: 'Total Documents',
      value: documents.length,
      subtext: 'Uploaded documents',
    },
    {
      id: 'saved_docs',
      label: 'Saved Documents',
      value: documents.filter((document) => document.status === 'saved').length,
      subtext: 'Awaiting indexing',
    },
    {
      id: 'indexed_docs',
      label: 'Indexed Documents',
      value: indexedDocuments.length,
      subtext: 'Indexed in ChromaDB',
    },
    {
      id: 'pending_indexing',
      label: 'Pending Indexing',
      value: documents.filter((document) => document.status !== 'indexed').length,
      subtext: 'Not currently indexed',
    },
    {
      id: 'indexed_chunks',
      label: 'Indexed Chunks',
      value: indexedDocuments.reduce((total, document) => total + (Number(document.chunks) || 0), 0),
      subtext: 'From indexed document status',
    },
    ...UNAVAILABLE_METRICS.map((metric) => ({ ...metric, value: 'Unavailable', subtext: 'No backend metric available' })),
  ];

  return (
    <div className="fk-pipe-kpi-grid" aria-label="Pipeline overview metrics">
      {metrics.map((kpi) => {
        const isDocumentMetric = !UNAVAILABLE_METRICS.some((metric) => metric.id === kpi.id);
        const value = isDocumentMetric && isLoading ? '…' : error && isDocumentMetric ? 'Unavailable' : kpi.value;
        const subtext = error && isDocumentMetric ? 'Document list could not be loaded' : kpi.subtext;
        return (
          <div key={kpi.id} className="fk-pipe-kpi-card">
            <div className="fk-pipe-kpi-label">{kpi.label}</div>
            <div className="fk-pipe-kpi-val">{value}</div>
            <div className="fk-pipe-kpi-sub">{isDocumentMetric && isLoading ? 'Loading document data' : subtext}</div>
          </div>
        );
      })}
    </div>
  );
}

export default PipelineKpiCards;
