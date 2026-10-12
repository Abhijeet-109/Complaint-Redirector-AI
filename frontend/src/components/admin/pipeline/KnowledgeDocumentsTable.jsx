import React, { useState, useMemo } from 'react';
import { Search, Info, CheckSquare, Square } from 'lucide-react';

export const INITIAL_KNOWLEDGE_DOCS = [
  {
    id: 'doc-1',
    name: 'Returns Policy.pdf',
    source: 'Local Upload',
    type: 'PDF',
    size: '248 KB',
    approvalStatus: 'saved',
    approvalLabel: 'Saved',
    indexStatus: 'not_indexed',
    indexLabel: 'Not indexed',
    chunks: '—',
    updated: 'Example date',
    department: 'Customer Support / Logistics',
    uploadedBy: 'admin_ops@flatkart.com',
    checksum: 'e7b8a1...49c2',
  },
  {
    id: 'doc-2',
    name: 'Delivery Policy.docx',
    source: 'Local Upload',
    type: 'DOCX',
    size: '86 KB',
    approvalStatus: 'pending_approval',
    approvalLabel: 'Pending Approval',
    indexStatus: 'not_indexed',
    indexLabel: 'Not indexed',
    chunks: '—',
    updated: 'Example date',
    department: 'Shipping & Delivery',
    uploadedBy: 'logistics_lead@flatkart.com',
    checksum: 'c4f2d9...83a1',
  },
  {
    id: 'doc-3',
    name: 'Seller Guidelines.pdf',
    source: 'Local Upload',
    type: 'PDF',
    size: '412 KB',
    approvalStatus: 'approved',
    approvalLabel: 'Approved - example',
    indexStatus: 'indexed',
    indexLabel: 'Indexed - example',
    chunks: '—',
    updated: 'Example date',
    department: 'Merchant Services',
    uploadedBy: 'merchant_ops@flatkart.com',
    checksum: '9a31b7...62e4',
  },
];

export function KnowledgeDocumentsTable({
  onOpenReview,
  onOpenDelete,
  onShowNotice,
}) {
  const [documents, setDocuments] = useState(INITIAL_KNOWLEDGE_DOCS);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [selectedIds, setSelectedIds] = useState(new Set());

  // Local filtering
  const filteredDocuments = useMemo(() => {
    return documents.filter((doc) => {
      const matchesSearch = doc.name.toLowerCase().includes(searchQuery.trim().toLowerCase());
      
      let matchesStatus = true;
      if (statusFilter !== 'all') {
        if (statusFilter === 'saved') matchesStatus = doc.approvalStatus === 'saved';
        else if (statusFilter === 'pending') matchesStatus = doc.approvalStatus === 'pending_approval';
        else if (statusFilter === 'approved') matchesStatus = doc.approvalStatus === 'approved';
        else if (statusFilter === 'indexed') matchesStatus = doc.indexStatus === 'indexed';
      }

      let matchesSource = true;
      if (sourceFilter !== 'all') {
        matchesSource = doc.source === sourceFilter;
      }

      return matchesSearch && matchesStatus && matchesSource;
    });
  }, [documents, searchQuery, statusFilter, sourceFilter]);

  // Checkbox handlers
  const allFilteredSelected =
    filteredDocuments.length > 0 &&
    filteredDocuments.every((d) => selectedIds.has(d.id));

  const handleToggleSelectAll = () => {
    if (allFilteredSelected) {
      setSelectedIds(new Set());
    } else {
      const next = new Set(selectedIds);
      filteredDocuments.forEach((d) => next.add(d.id));
      setSelectedIds(next);
    }
  };

  const handleToggleRow = (id) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
  };

  // Bulk actions
  const handleIndexSelected = () => {
    if (selectedIds.size === 0) {
      onShowNotice('Please select at least one document to index.');
      return;
    }
    onShowNotice('Document-indexing integration is pending.');
  };

  const handleDeleteSelected = () => {
    if (selectedIds.size === 0) {
      onShowNotice('Please select at least one document to delete.');
      return;
    }
    const docsToDelete = documents.filter((d) => selectedIds.has(d.id));
    onOpenDelete(docsToDelete);
  };

  return (
    <div className="fk-pipe-panel">
      {/* Header */}
      <div className="fk-pipe-panel-header">
        <div>
          <h2 className="fk-pipe-panel-title">Knowledge Documents</h2>
          <span className="fk-pipe-panel-sub">
            Illustrative records · not fetched from the backend
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            type="button"
            className="fk-pipe-btn-secondary"
            onClick={handleIndexSelected}
          >
            Index Selected
          </button>
          <button
            type="button"
            className="fk-pipe-btn-secondary"
            onClick={handleDeleteSelected}
          >
            Delete Selected
          </button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="fk-pipe-table-toolbar">
        <div className="fk-pipe-search-input-wrap">
          <Search size={15} className="fk-pipe-search-icon" />
          <input
            type="text"
            placeholder="Search documents"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Search knowledge documents"
          />
        </div>

        <select
          className="fk-pipe-filter-select"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          aria-label="Filter by approval status"
        >
          <option value="all">All statuses</option>
          <option value="saved">Saved</option>
          <option value="pending">Pending Approval</option>
          <option value="approved">Approved - example</option>
          <option value="indexed">Indexed - example</option>
        </select>

        <select
          className="fk-pipe-filter-select"
          value={sourceFilter}
          onChange={(e) => setSourceFilter(e.target.value)}
          aria-label="Filter by document source"
        >
          <option value="all">All sources</option>
          <option value="Local Upload">Local Upload</option>
          <option value="Google Drive">Google Drive</option>
        </select>

        <span className="fk-pipe-toolbar-hint">Filters apply to examples only</span>
      </div>

      {/* Table */}
      <div className="fk-pipe-table-wrapper">
        <table className="fk-pipe-table">
          <thead>
            <tr>
              <th style={{ width: '40px', textAlign: 'center' }}>
                <button
                  type="button"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex' }}
                  onClick={handleToggleSelectAll}
                  title="Select all"
                  aria-label="Select all documents"
                >
                  {allFilteredSelected ? (
                    <CheckSquare size={16} color="var(--fk-olive, #8A875D)" />
                  ) : (
                    <Square size={16} color="#A29C90" />
                  )}
                </button>
              </th>
              <th>Document</th>
              <th>Source</th>
              <th>Type / Size</th>
              <th>Approval Status</th>
              <th>Index Status</th>
              <th>Chunks</th>
              <th>Updated</th>
              <th>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  Actions <Info size={13} color="#8C989A" />
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredDocuments.length === 0 ? (
              <tr>
                <td colSpan={9} style={{ textAlign: 'center', padding: '24px', color: '#8C989A' }}>
                  No illustrative documents match the specified criteria.
                </td>
              </tr>
            ) : (
              filteredDocuments.map((doc) => {
                const isSelected = selectedIds.has(doc.id);
                return (
                  <tr key={doc.id} style={{ backgroundColor: isSelected ? '#FAF7F0' : undefined }}>
                    <td style={{ textAlign: 'center' }}>
                      <button
                        type="button"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex' }}
                        onClick={() => handleToggleRow(doc.id)}
                        aria-label={`Select document ${doc.name}`}
                      >
                        {isSelected ? (
                          <CheckSquare size={16} color="var(--fk-olive, #8A875D)" />
                        ) : (
                          <Square size={16} color="#A29C90" />
                        )}
                      </button>
                    </td>

                    <td>
                      <div className="fk-pipe-doc-cell">
                        <span className="fk-pipe-doc-title">{doc.name}</span>
                        <span className="fk-pipe-doc-sub">Example UI only</span>
                      </div>
                    </td>

                    <td>{doc.source}</td>
                    <td>{doc.type} · {doc.size}</td>

                    <td>
                      <span
                        className={
                          doc.approvalStatus === 'pending_approval'
                            ? 'fk-pipe-badge-pending-approval'
                            : doc.approvalStatus === 'approved'
                            ? 'fk-pipe-badge-approved'
                            : 'fk-pipe-badge-saved'
                        }
                      >
                        {doc.approvalLabel}
                      </span>
                    </td>

                    <td>
                      <span
                        className={
                          doc.indexStatus === 'indexed'
                            ? 'fk-pipe-badge-indexed'
                            : 'fk-pipe-badge-not-indexed'
                        }
                      >
                        {doc.indexLabel}
                      </span>
                    </td>

                    <td>{doc.chunks}</td>
                    <td>{doc.updated}</td>

                    <td>
                      <div className="fk-pipe-actions-cell">
                        <button
                          type="button"
                          className="fk-pipe-action-btn"
                          onClick={() => onOpenReview(doc)}
                        >
                          Review/Approve
                        </button>
                        <button
                          type="button"
                          className="fk-pipe-action-btn"
                          onClick={() => onShowNotice('Document-indexing integration is pending.')}
                        >
                          {doc.indexStatus === 'indexed' ? 'Re-index' : 'Index'}
                        </button>
                        <button
                          type="button"
                          className="fk-pipe-action-btn danger"
                          onClick={() => onOpenDelete([doc])}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="fk-pipe-table-footer">
        {selectedIds.size} example documents selected · actions API pending
      </div>
    </div>
  );
}

export default KnowledgeDocumentsTable;
