import React from 'react';
import { FileText, X, CheckCircle, ShieldCheck } from 'lucide-react';

export function DocumentReviewModal({ document, isOpen, onClose, onShowNotice }) {
  if (!isOpen || !document) return null;

  const handleApprove = () => {
    onClose();
    if (onShowNotice) {
      onShowNotice('Approval interface ready. Backend approval workflow will be added in the next phase.');
    }
  };

  return (
    <div className="ad-modal-backdrop" onClick={onClose}>
      <div
        className="ad-modal"
        style={{ maxWidth: '560px' }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="doc-review-modal-title"
      >
        <div className="ad-modal-header">
          <div className="ad-modal-title" id="doc-review-modal-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FileText size={18} color="var(--fk-olive, #8A875D)" />
            <span>Document Review & Approval</span>
          </div>
          <button className="ad-modal-close" onClick={onClose} aria-label="Close dialog">
            <X size={18} />
          </button>
        </div>

        <div className="ad-modal-body" style={{ gap: '16px' }}>
          <div style={{ background: '#FAF8F4', padding: '14px', borderRadius: '8px', border: '1px solid #ECE7DC' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--fk-olive, #8A875D)', fontWeight: '700', fontSize: '12px', textTransform: 'uppercase', marginBottom: '4px' }}>
              <ShieldCheck size={15} />
              <span>Demonstration Review Workflow</span>
            </div>
            <p style={{ fontSize: '13px', color: '#556366', lineHeight: '1.45' }}>
              Review policy document metadata before authorizing ingestion into the vector search catalog.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div className="ad-form-field">
              <label className="ad-form-label" style={{ fontSize: '11.5px', color: '#748082', textTransform: 'uppercase' }}>
                Document Name
              </label>
              <div style={{ fontSize: '13.5px', fontWeight: '700', color: 'var(--fk-text-primary, #1C352F)' }}>
                {document.name}
              </div>
            </div>

            <div className="ad-form-field">
              <label className="ad-form-label" style={{ fontSize: '11.5px', color: '#748082', textTransform: 'uppercase' }}>
                Source & Format
              </label>
              <div style={{ fontSize: '13px', color: 'var(--fk-text-primary, #1C352F)' }}>
                {document.source} · {document.type} ({document.size})
              </div>
            </div>

            <div className="ad-form-field">
              <label className="ad-form-label" style={{ fontSize: '11.5px', color: '#748082', textTransform: 'uppercase' }}>
                Approval Status
              </label>
              <div>
                <span
                  className={
                    document.approvalStatus === 'pending_approval'
                      ? 'fk-pipe-badge-pending-approval'
                      : document.approvalStatus === 'approved'
                      ? 'fk-pipe-badge-approved'
                      : 'fk-pipe-badge-saved'
                  }
                >
                  {document.approvalLabel}
                </span>
              </div>
            </div>

            <div className="ad-form-field">
              <label className="ad-form-label" style={{ fontSize: '11.5px', color: '#748082', textTransform: 'uppercase' }}>
                Index Status
              </label>
              <div>
                <span
                  className={
                    document.indexStatus === 'indexed'
                      ? 'fk-pipe-badge-indexed'
                      : 'fk-pipe-badge-not-indexed'
                  }
                >
                  {document.indexLabel}
                </span>
              </div>
            </div>

            <div className="ad-form-field" style={{ gridColumn: 'span 2' }}>
              <label className="ad-form-label" style={{ fontSize: '11.5px', color: '#748082', textTransform: 'uppercase' }}>
                Target Department
              </label>
              <div style={{ fontSize: '13px', color: 'var(--fk-text-primary, #1C352F)' }}>
                {document.department || 'Operations / All'}
              </div>
            </div>

            <div className="ad-form-field">
              <label className="ad-form-label" style={{ fontSize: '11.5px', color: '#748082', textTransform: 'uppercase' }}>
                Uploaded By
              </label>
              <div style={{ fontSize: '12.5px', color: '#556366' }}>
                {document.uploadedBy || 'admin@flatkart.com'}
              </div>
            </div>

            <div className="ad-form-field">
              <label className="ad-form-label" style={{ fontSize: '11.5px', color: '#748082', textTransform: 'uppercase' }}>
                SHA-256 Checksum
              </label>
              <div style={{ fontSize: '12px', color: '#556366', fontFamily: 'monospace' }}>
                {document.checksum || '8fa19...3b20'}
              </div>
            </div>
          </div>
        </div>

        <div className="ad-modal-footer">
          <button type="button" className="ad-btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="ad-btn-primary"
            onClick={handleApprove}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <CheckCircle size={15} />
            <span>Approve Document</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export default DocumentReviewModal;
