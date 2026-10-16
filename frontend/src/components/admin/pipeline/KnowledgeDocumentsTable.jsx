import React, { useMemo, useState, useEffect } from 'react';
import { Search, CheckSquare, Square, RefreshCw, Eye, Trash2 } from 'lucide-react';
import { DOCUMENT_SOURCE_LABELS, normalizeDocumentSource } from '../../../utils/documentSource.js';
import DocumentPreviewModal from './DocumentPreviewModal.jsx';

function mapDocument(file, operationResult) {
  const persistedStatus = file.status === 'indexed' ? 'indexed' : file.status === 'failed' || file.error ? 'failed' : 'saved';
  const indexStatus = operationResult?.status === 'already_indexed'
    ? 'already_indexed'
    : operationResult?.status === 'failed'
      ? 'failed'
      : persistedStatus;
  const source = normalizeDocumentSource(file);
  return {
    id: file.stored_name,
    stored_name: file.stored_name,
    name: file.original_name || file.stored_name,
    source,
    sourceLabel: DOCUMENT_SOURCE_LABELS[source],
    type: file.stored_name.split('.').pop().toUpperCase(),
    size: `${(Number(file.size_bytes || 0) / 1024).toFixed(1)} KB`,
    indexStatus,
    indexLabel: ({ indexed: 'Indexed', saved: 'Saved', failed: 'Failed', already_indexed: 'Already Indexed' })[indexStatus],
    indexError: operationResult?.message || file.error || '',
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
  operationResults = [],
  isIndexing = false,
  driveConnected = null,
  driveStatusLoading = false,
}) {
  const documents = useMemo(() => {
    const resultsByName = new Map(operationResults.map((result) => [result.stored_name, result]));
    return files.map((file) => mapDocument(file, resultsByName.get(file.stored_name)));
  }, [files, operationResults]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [previewDocument, setPreviewDocument] = useState(null);

  useEffect(() => {
    const currentIds = new Set(files.map((file) => file.stored_name));
    onSelectionChange?.(new Set([...selectedIds].filter((id) => currentIds.has(id))));
  }, [files]);

  const filteredDocuments = useMemo(() => documents.filter((doc) => {
    const matchesSearch = `${doc.name} ${doc.stored_name}`.toLowerCase().includes(searchQuery.trim().toLowerCase());
    const matchesStatus = statusFilter === 'all'
      || (statusFilter === 'saved' && doc.indexStatus === 'saved')
      || (statusFilter === 'failed' && doc.indexStatus === 'failed')
      || (statusFilter === 'indexed' && ['indexed', 'already_indexed'].includes(doc.indexStatus));
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
          <option value="local_upload">Local Upload</option>
          <option value="google_drive">Google Drive</option>
          <option value="unknown">Unknown source</option>
        </select>
        {driveStatusLoading
          ? <span className="fk-pipe-toolbar-hint">Checking Drive connection…</span>
          : driveConnected === true
            ? <span className="fk-pipe-toolbar-hint fk-pipe-toolbar-hint--connected">Google Drive connected</span>
            : driveConnected === false
              ? <span className="fk-pipe-toolbar-hint">Google Drive is not connected</span>
              : <span className="fk-pipe-toolbar-hint">Drive status unavailable</span>
        }
      </div>

      <div className="fk-pipe-table-wrapper">
        <table className="fk-pipe-table">
          <thead><tr>
            <th style={{ width: '40px', textAlign: 'center' }}><button type="button" className="fk-pipe-select-all" onClick={toggleSelectAll} title="Select all" aria-label="Select all documents">{allFilteredSelected ? <CheckSquare size={16} /> : <Square size={16} />}</button></th>
            <th>Document</th><th>Source</th><th>Type / Size</th><th>Index Status</th><th>Chunks</th><th>View</th><th>Actions</th>
          </tr></thead>
          <tbody>
            {isLoading ? <tr><td colSpan={8} className="fk-pipe-empty-table-msg">Loading documents…</td></tr>
              : loadError ? <tr><td colSpan={8} role="alert" className="fk-pipe-empty-table-msg">{loadError}</td></tr>
                : filteredDocuments.length === 0 ? <tr><td colSpan={8} className="fk-pipe-empty-table-msg">No uploaded documents match the selected filters.</td></tr>
                  : filteredDocuments.map((doc) => {
                    const selected = selectedIds.has(doc.id);
                    return <tr key={doc.id} style={{ backgroundColor: selected ? '#FAF7F0' : undefined }}>
                      <td style={{ textAlign: 'center' }}><button type="button" className="fk-pipe-row-select" onClick={() => toggleRow(doc.id)} aria-label={`Select document ${doc.name}`}>{selected ? <CheckSquare size={16} /> : <Square size={16} />}</button></td>
                      <td><div className="fk-pipe-doc-cell"><strong className="fk-pipe-doc-title" title={doc.name}>{doc.name}</strong><span className="fk-pipe-doc-sub">{doc.stored_name}</span></div></td>
                      <td>{doc.sourceLabel}</td><td>{doc.type} · {doc.size}</td>
                      <td><span className={`fk-pipe-index-status ${doc.indexStatus === 'indexed' ? 'is-indexed' : doc.indexStatus === 'failed' ? 'is-failed' : doc.indexStatus === 'already_indexed' ? 'is-already-indexed' : 'is-not-indexed'}`} title={doc.indexError || undefined}>{doc.indexLabel}</span></td>
                      <td>{doc.chunks}</td>
                      <td className="fk-pipe-table-icon-cell"><button type="button" className="fk-pipe-icon-btn" onClick={() => setPreviewDocument(doc)} title={`View document ${doc.name}`} aria-label={`View document ${doc.name}`}><Eye size={16} /></button></td>
                      <td className="fk-pipe-table-icon-cell"><button type="button" className="fk-pipe-icon-btn fk-pipe-icon-btn-danger" onClick={() => onOpenDelete?.([doc])} disabled={isIndexing} title={`Delete document ${doc.name}`} aria-label={`Delete document ${doc.name}`}><Trash2 size={16} /></button></td>
                    </tr>;
                  })}
          </tbody>
        </table>
      </div>
      <div className="fk-pipe-table-footer">{selectedIds.size} document(s) selected</div>
      <DocumentPreviewModal document={previewDocument} isOpen={Boolean(previewDocument)} onClose={() => setPreviewDocument(null)} />
    </div>
  );
}

export default KnowledgeDocumentsTable;
