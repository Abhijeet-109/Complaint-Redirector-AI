import React from 'react';

export function PipelineKpiCards({ documents = [], isLoading = false, error = '', chatbotTotal, chatbotLoading = false, chatbotError = '' }) {
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
    {
      id: 'indexing_failures',
      label: 'Indexing Failures',
      value: documents.filter((document) => Boolean(document.error)).length,
      subtext: 'Documents with a recorded latest indexing failure',
    },
    {
      id: 'chatbot_queries',
      label: 'Chatbot Queries',
      value: chatbotTotal,
      subtext: 'Recorded requests in the last 30 days',
    },
  ];

  return (
    <div className="fk-pipe-kpi-grid" aria-label="Pipeline overview metrics">
      {metrics.map((kpi) => {
        const isChatbotMetric = kpi.id === 'chatbot_queries';
        const isMetricLoading = isChatbotMetric ? chatbotLoading : isLoading;
        const metricError = isChatbotMetric ? chatbotError : error;
        const value = isMetricLoading ? '…' : metricError ? 'Unavailable' : kpi.value ?? 'Unavailable';
        const subtext = metricError
          ? (isChatbotMetric ? 'Chatbot query count could not be loaded' : 'Document list could not be loaded')
          : isMetricLoading ? (isChatbotMetric ? 'Loading chatbot data' : 'Loading document data') : kpi.subtext;
        return (
          <div key={kpi.id} className="fk-pipe-kpi-card">
            <div className="fk-pipe-kpi-label">{kpi.label}</div>
            <div className="fk-pipe-kpi-val">{value}</div>
            <div className="fk-pipe-kpi-sub">{subtext}</div>
          </div>
        );
      })}
    </div>
  );
}

export default PipelineKpiCards;
