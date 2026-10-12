import React from 'react';
import { RefreshCw } from 'lucide-react';

export function IndexingRetrievalPanel({ documents = [], selectedCount = 0, isLoading = false, loadError = '', isIndexing = false, results = [], onRefresh, onIndex, onReindex }) {
  const indexedCount = documents.filter((document) => document.status === 'indexed').length;
  const pendingCount = documents.filter((document) => document.status !== 'indexed').length;

  return (
    <div className="fk-pipe-panel">
      <div className="fk-pipe-panel-header">
        <div>
          <h2 className="fk-pipe-panel-title">Indexing & Retrieval</h2>
          <span className="fk-pipe-panel-sub">Live file and ChromaDB index status</span>
        </div>
        <button type="button" className="fk-pipe-btn-secondary" onClick={onRefresh} disabled={isLoading || isIndexing}>
          <RefreshCw size={14} /> Refresh Status
        </button>
      </div>
      {loadError ? <p className="fk-pipe-config-error" role="alert">{loadError}</p> : <div className="fk-pipe-tech-list">
        <div className="fk-pipe-tech-item"><span className="fk-pipe-tech-label">Uploaded documents</span><span className="fk-pipe-tech-val">{isLoading ? 'Loading…' : documents.length}</span></div>
        <div className="fk-pipe-tech-item"><span className="fk-pipe-tech-label">Indexed in ChromaDB</span><span className="fk-pipe-tech-val">{isLoading ? 'Loading…' : indexedCount}</span></div>
        <div className="fk-pipe-tech-item"><span className="fk-pipe-tech-label">Not indexed</span><span className="fk-pipe-tech-val">{isLoading ? 'Loading…' : pendingCount}</span></div>
      </div>}
      <p className="fk-pipe-panel-sub">Retrieval and answer stages are not reported by the document index endpoint.</p>
      <div className="fk-pipe-actions-row">
        <button type="button" className="fk-pipe-btn-secondary" onClick={onIndex} disabled={isIndexing || selectedCount === 0}>{isIndexing ? 'Indexing…' : `Index Selected (${selectedCount})`}</button>
        <button type="button" className="fk-pipe-btn-secondary" onClick={onReindex} disabled={isIndexing || selectedCount === 0}>{isIndexing ? 'Re-indexing…' : `Re-index Selected (${selectedCount})`}</button>
      </div>
      {results.length > 0 && <div className="fk-pipe-index-results" role="status" aria-live="polite">
        <strong>Latest indexing results</strong>
        {results.map((result, index) => <div key={`${result.stored_name || 'request'}-${index}`}>
          <span>{result.stored_name || 'Request'}: {result.status}</span>
          {result.chunks != null && <span> · {result.chunks} chunks</span>}
          {result.message && <div className="fk-pipe-config-error">{result.message}</div>}
        </div>)}
      </div>}
    </div>
  );
}

export default IndexingRetrievalPanel;
