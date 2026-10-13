import React, { useMemo, useState, useEffect } from 'react';
import { Search, CheckSquare, Square, RefreshCw } from 'lucide-react';

function mapDocument(file) {
  const indexStatus = file.status === 'indexed' ? 'indexed' : 'not_indexed';
  return {
    id: file.stored_name,
    stored_name: file.stored_name,
    name: file.original_name || file.stored_name,
    source: 'Local Upload',
    type: file.stored_name.split('.').pop().toUpperCase(),
    size: `${(Number(file.size_bytes || 0) / 1024).toFixed(1)} KB`,
    indexStatus,
    indexLabel: indexStatus === 'indexed' ? 'Indexed' : 'Not Indexed',
    indexError: file.error || '',
    chunks: file.chunks ?? '—',
  };
}

export function KnowledgeDocumentsTable({
  onOpenDelete,
  onShowNotice,
  files = [],
  isLoading = false,
  loadError = '',
  refreshDocuments,
  selectedIds = new Set(),
  onSelectionChange,
  onIndexDocuments,
  isIndexing = false,
}) {
  const documents = useMemo(() => files.map(mapDocument), [files]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all');

  useEffect(() => {
    const currentIds = new Set(files.map((file) => file.stored_name));
    onSelectionChange?.(new Set([...selectedIds].filter((id) => currentIds.has(id))));
  }, [files]);

  const filteredDocuments = useMemo(() => documents.filter((doc) => {
    const matchesSearch = `${doc.name} ${doc.stored_name}`.toLowerCase().includes(searchQuery.trim().toLowerCase());
    const matchesStatus = statusFilter === 'all'
      || (statusFilter === 'saved' && doc.indexStatus === 'not_indexed' && !doc.indexError)
      || (statusFilter === 'failed' && Boolean(doc.indexError))
      || (statusFilter === 'indexed' && doc.indexStatus === 'indexed');
    return matchesSearch && matchesStatus && (sourceFilter === 'all' || sourceFilter === doc.source);
  }), [documents, searchQuery, statusFilter, sourceFilter]);

  const allFilteredSelected = filteredDocuments.length > 0 && filteredDocuments.every((doc) => selectedIds.has(doc.id));
  const toggleSelectAll = () => onSelectionChange?.(allFilteredSelected
    ? new Set()
    : new Set([...selectedIds, ...filteredDocuments.map((doc) => doc.id)]));
  const toggleRow = (id) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectionChange?.(next);
  };

  const refresh = async () => {
    const result = await refreshDocuments?.();
    onShowNotice?.(result ? 'Document and index status refreshed.' : 'Could not refresh document and index status.');
  };
  const deleteSelected = () => {
    const docs = documents.filter((doc) => selectedIds.has(doc.id));
    if (docs.length) onOpenDelete?.(docs);
    else onShowNotice?.('Select at least one document to delete.');
  };

  return (
    <div className="fk-pipe-panel">
      <div className="fk-pipe-panel-header">
        <div>
          <h2 className="fk-pipe-panel-title">Knowledge Documents</h2>
          <span className="fk-pipe-panel-sub">Uploaded documents from the backend</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button type="button" className="fk-pipe-btn-secondary" onClick={refresh} disabled={isLoading || isIndexing}>
            <RefreshCw size={14} /> Refresh Status
          </button>
          <button type="button" className="fk-pipe-btn-secondary" onClick={() => onIndexDocuments?.([...selectedIds], false)} disabled={isIndexing || selectedIds.size === 0}>
            {isIndexing ? 'Indexing…' : 'Index Selected'}
          </button>
          <button type="button" className="fk-pipe-btn-secondary" onClick={deleteSelected} disabled={isIndexing || selectedIds.size === 0}>
            Delete Selected
          </button>
        </div>
      </div>

      <div className="fk-pipe-table-toolbar">
        <div className="fk-pipe-search-input-wrap">
          <Search size={15} className="fk-pipe-search-icon" />
          <input type="text" placeholder="Search documents" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} aria-label="Search knowledge documents" />
        </div>
        <select className="fk-pipe-filter-select" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Filter by index status">
          <option value="all">All statuses</option>
          <option value="saved">Saved · not indexed</option>
          <option value="failed">Latest indexing attempt failed</option>
          <option value="indexed">Indexed</option>
        </select>
        <select className="fk-pipe-filter-select" value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)} aria-label="Filter by document source">
          <option value="all">All sources</option>
          <option value="Local Upload">Local Upload</option>
        </select>
        <span className="fk-pipe-toolbar-hint">Google Drive is not connected</span>
      </div>

      <div className="fk-pipe-table-wrapper">
        <table className="fk-pipe-table">
          <thead><tr>
            <th style={{ width: '40px', textAlign: 'center' }}><button type="button" className="fk-pipe-select-all" onClick={toggleSelectAll} title="Select all" aria-label="Select all documents">{allFilteredSelected ? <CheckSquare size={16} /> : <Square size={16} />}</button></th>
            <th>Document</th><th>Source</th><th>Type / Size</th><th>Index Status</th><th>Chunks</th><th>Actions</th>
          </tr></thead>
          <tbody>
            {isLoading ? <tr><td colSpan={7} className="fk-pipe-empty-table-msg">Loading documents…</td></tr>
              : loadError ? <tr><td colSpan={7} role="alert" className="fk-pipe-empty-table-msg">{loadError}</td></tr>
                : filteredDocuments.length === 0 ? <tr><td colSpan={7} className="fk-pipe-empty-table-msg">No uploaded documents match the selected filters.</td></tr>
                  : filteredDocuments.map((doc) => {
                    const selected = selectedIds.has(doc.id);
                    return <tr key={doc.id} style={{ backgroundColor: selected ? '#FAF7F0' : undefined }}>
                      <td style={{ textAlign: 'center' }}><button type="button" className="fk-pipe-row-select" onClick={() => toggleRow(doc.id)} aria-label={`Select document ${doc.name}`}>{selected ? <CheckSquare size={16} /> : <Square size={16} />}</button></td>
                      <td><div className="fk-pipe-doc-cell"><strong className="fk-pipe-doc-title">{doc.name}</strong><span className="fk-pipe-doc-sub">{doc.stored_name}</span></div></td>
                      <td>{doc.source}</td><td>{doc.type} · {doc.size}</td>
                      <td><span className={`fk-pipe-index-status ${doc.indexStatus === 'indexed' ? 'is-indexed' : 'is-not-indexed'}${doc.indexError ? ' has-error' : ''}`} title={doc.indexError || undefined}>{doc.indexLabel}</span></td>
                      <td>{doc.chunks}</td>
                      <td><div className="fk-pipe-actions-cell">
                        {doc.indexStatus !== 'indexed' && <button type="button" className="fk-pipe-action-btn" onClick={() => onIndexDocuments?.([doc.id], false)} disabled={isIndexing}>Index</button>}
                        <button type="button" className="fk-pipe-action-btn danger" onClick={() => onOpenDelete?.([doc])} disabled={isIndexing}>Delete</button>
                      </div></td>
                    </tr>;
                  })}
          </tbody>
        </table>
      </div>
      <div className="fk-pipe-table-footer">{selectedIds.size} document(s) selected</div>
    </div>
  );
}

export default KnowledgeDocumentsTable;
