import React, { useEffect, useState } from 'react';
import { Download, Eye, X } from 'lucide-react';
import { documentService } from '../../../services/documentService';

export function DocumentPreviewModal({ document, isOpen, onClose }) {
  const [preview, setPreview] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen || !document?.stored_name) return undefined;

    const controller = new AbortController();
    let active = true;
    let objectUrl = '';
    setPreview(null);
    setError('');
    setIsLoading(true);

    documentService.previewDocument(document.stored_name, { signal: controller.signal })
      .then((result) => {
        if (!active) return;
        if (result.type === 'pdf') {
          objectUrl = URL.createObjectURL(result.blob);
          setPreview({ type: 'pdf', url: objectUrl });
        } else {
          setPreview({ type: 'docx', content: result.content });
        }
      })
      .catch((previewError) => {
        if (active && previewError.name !== 'AbortError') {
          setError(previewError.message || 'The document preview could not be loaded.');
        }
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [isOpen, document?.stored_name]);

  if (!isOpen || !document) return null;

  const blocks = preview?.content?.blocks || [];
  const isPdf = preview?.type === 'pdf';

  return (
    <div
      className="ad-modal-backdrop"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <section
        className="ad-modal fk-doc-preview-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="fk-doc-preview-title"
      >
        <header className="ad-modal-header">
          <div className="fk-doc-preview-heading">
            <Eye size={18} aria-hidden="true" />
            <h2 className="ad-modal-title" id="fk-doc-preview-title">{document.name}</h2>
          </div>
          <div className="fk-doc-preview-controls">
            {isPdf && preview?.url && (
              <a
                className="fk-pipe-btn-secondary fk-doc-preview-download"
                href={preview.url}
                download={document.name}
              >
                <Download size={14} /> Download
              </a>
            )}
            <button type="button" className="ad-modal-close" onClick={onClose} aria-label="Close preview">
              <X size={19} />
            </button>
          </div>
        </header>

        <div className="ad-modal-body fk-doc-preview-body">
          {isLoading && <p role="status">Loading document preview…</p>}
          {error && <p className="fk-doc-preview-error" role="alert">{error}</p>}
          {!isLoading && !error && isPdf && (
            <iframe
              className="fk-doc-preview-pdf"
              src={preview.url}
              title={`PDF preview: ${document.name}`}
            />
          )}
          {!isLoading && !error && preview?.type === 'docx' && (
            <article className="fk-doc-preview-content">
              {blocks.length === 0 && <p>This document contains no readable text to preview.</p>}
              {blocks.map((block, index) => block.type === 'table' ? (
                <div className="fk-doc-preview-table-wrap" key={`table-${index}`}>
                  <table>
                    <tbody>
                      {block.rows.map((row, rowIndex) => (
                        <tr key={`row-${rowIndex}`}>
                          {row.map((cell, cellIndex) => <td key={`cell-${cellIndex}`}>{cell}</td>)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <p key={`paragraph-${index}`}>{block.text}</p>)}
              <p className="fk-doc-preview-note">Text preview; original Word layout may differ.</p>
            </article>
          )}
        </div>
      </section>
    </div>
  );
}

export default DocumentPreviewModal;
