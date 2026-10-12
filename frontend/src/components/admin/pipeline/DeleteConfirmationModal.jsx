import React, { useState } from 'react';
import { AlertTriangle, X, Trash2 } from 'lucide-react';
import { documentService } from '../../../services/documentService';

export function DeleteConfirmationModal({
  documents = [],
  isOpen,
  onClose,
  onShowNotice,
  onDeleteComplete,
}) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  if (!isOpen || !documents || documents.length === 0) return null;

  const handleDeleteConfirm = async () => {
    if (isDeleting) return;
    setIsDeleting(true);
    setDeleteError('');
    try {
      const response = await documentService.deleteDocuments(
        documents.map((document) => document.stored_name).filter(Boolean)
      );
      const results = response.results || [];
      const deletedCount = results.filter((result) => result.status === 'deleted').length;
      const failures = results.filter((result) => result.status !== 'deleted');
      await onDeleteComplete?.(results);

      if (failures.length > 0) {
        setDeleteError(failures.map((result) => result.message).filter(Boolean).join(' ')
          || `${failures.length} document(s) could not be deleted.`);
      } else {
        onShowNotice?.(`${deletedCount} document${deletedCount === 1 ? '' : 's'} deleted.`);
        onClose();
      }
    } catch (error) {
      setDeleteError(error.message || 'Document deletion failed. Please try again.');
    } finally {
      setIsDeleting(false);
    }
  };

  const isMultiple = documents.length > 1;

  return (
    <div className="ad-modal-backdrop" onClick={isDeleting ? undefined : onClose}>
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
          <button className="ad-modal-close" onClick={onClose} disabled={isDeleting} aria-label="Close dialog">
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
            <strong>System Impact:</strong> Deleting removes the stored source file and its associated vectors from ChromaDB.
          </div>
          {deleteError && <p role="alert" style={{ color: '#A63227', fontSize: '12.5px' }}>{deleteError}</p>}
        </div>

        <div className="ad-modal-footer">
          <button type="button" className="ad-btn-secondary" onClick={onClose} disabled={isDeleting}>
            Cancel
          </button>
          <button
            type="button"
            className="ad-btn-danger"
            onClick={handleDeleteConfirm}
            disabled={isDeleting}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <Trash2 size={15} />
            <span>{isDeleting ? 'Deleting…' : `Delete Document${isMultiple ? 's' : ''}`}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export default DeleteConfirmationModal;
