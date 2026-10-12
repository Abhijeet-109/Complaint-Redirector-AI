import React from 'react';
import { AlertTriangle, X, Trash2 } from 'lucide-react';

export function DeleteConfirmationModal({ documents = [], isOpen, onClose, onShowNotice }) {
  if (!isOpen || !documents || documents.length === 0) return null;

  const handleDeleteConfirm = () => {
    onClose();
    if (onShowNotice) {
      onShowNotice('Deletion UI is ready. Backend deletion and ChromaDB cleanup will be implemented in the next phase.');
    }
  };

  const isMultiple = documents.length > 1;

  return (
    <div className="ad-modal-backdrop" onClick={onClose}>
      <div
        className="ad-modal"
        style={{ maxWidth: '520px' }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-confirm-title"
      >
        <div className="ad-modal-header">
          <div className="ad-modal-title" id="delete-confirm-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertTriangle size={18} color="#C03E33" />
            <span>Confirm Document Deletion</span>
          </div>
          <button className="ad-modal-close" onClick={onClose} aria-label="Close dialog">
            <X size={18} />
          </button>
        </div>

        <div className="ad-modal-body" style={{ gap: '16px' }}>
          <p style={{ fontSize: '13.5px', color: 'var(--fk-text-primary, #1C352F)', lineHeight: '1.5' }}>
            {isMultiple
              ? `Are you sure you want to delete these ${documents.length} documents?`
              : `Are you sure you want to delete "${documents[0].name}"?`}
          </p>

          <div
            style={{
              background: '#FDFBF8',
              border: '1px solid #ECE7DC',
              borderRadius: '8px',
              padding: '12px 14px',
              maxHeight: '140px',
              overflowY: 'auto',
            }}
          >
            <div style={{ fontSize: '11px', fontWeight: '800', color: '#748082', textTransform: 'uppercase', marginBottom: '6px' }}>
              Selected File{isMultiple ? 's' : ''}
            </div>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '5px' }}>
              {documents.map((doc) => (
                <li key={doc.id} style={{ fontSize: '12.5px', color: 'var(--fk-text-primary, #1C352F)', display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontWeight: '600' }}>{doc.name}</span>
                  <span style={{ color: '#8C989A' }}>{doc.size}</span>
                </li>
              ))}
            </ul>
          </div>

          <div
            style={{
              background: '#FAF2F0',
              border: '1px solid #F3DAD6',
              borderRadius: '8px',
              padding: '12px 14px',
              fontSize: '12.5px',
              color: '#8C352A',
              lineHeight: '1.45',
            }}
          >
            <strong>System Impact:</strong> Deleting will remove the stored source file and permanently purge all associated vector chunk embeddings from ChromaDB. Backend deletion and ChromaDB cleanup will be implemented in the next phase.
          </div>
        </div>

        <div className="ad-modal-footer">
          <button type="button" className="ad-btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="ad-btn-danger"
            onClick={handleDeleteConfirm}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <Trash2 size={15} />
            <span>Delete Document{isMultiple ? 's' : ''}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export default DeleteConfirmationModal;
