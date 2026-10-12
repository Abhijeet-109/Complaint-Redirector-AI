import React from 'react';
import { AlertOctagon, X, RotateCcw } from 'lucide-react';

export function RebuildResetModal({ isOpen, onClose }) {
  if (!isOpen) return null;

  return (
    <div className="ad-modal-backdrop" onClick={onClose}>
      <div
        className="ad-modal"
        style={{ maxWidth: '540px' }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="rebuild-modal-title"
      >
        <div className="ad-modal-header">
          <div className="ad-modal-title" id="rebuild-modal-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertOctagon size={18} color="#C03E33" />
            <span>Rebuild / Reset Vector Index</span>
          </div>
          <button className="ad-modal-close" onClick={onClose} aria-label="Close dialog">
            <X size={18} />
          </button>
        </div>

        <div className="ad-modal-body" style={{ gap: '16px' }}>
          <div
            style={{
              background: '#FAF2F0',
              border: '1px solid #F3DAD6',
              borderRadius: '8px',
              padding: '14px 16px',
              fontSize: '13px',
              color: '#8C352A',
              lineHeight: '1.5',
            }}
          >
            <strong>Warning:</strong> Rebuilding or resetting the vector index can affect the chatbot’s searchable knowledge. Backend protection, backup and recovery must be implemented before this operation is enabled.
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px', color: '#556366' }}>
            <div>
              <strong>Target Collection:</strong> <code style={{ background: '#F1ECE2', padding: '2px 6px', borderRadius: '4px' }}>flatkart_documents</code>
            </div>
            <div>
              <strong>Action Status:</strong> Safeguard active · UI simulation only
            </div>
          </div>
        </div>

        <div className="ad-modal-footer">
          <button type="button" className="ad-btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="ad-btn-danger"
            disabled
            style={{ opacity: 0.5, cursor: 'not-allowed', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            title="Backend protection prevents resetting ChromaDB in this UI-only phase"
          >
            <RotateCcw size={15} />
            <span>Rebuild Index (Pending Backend)</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export default RebuildResetModal;
