import React from 'react';
import { AlertTriangle } from 'lucide-react';

export function TechnicalConfigPanel({ onOpenRebuildModal }) {
  return (
    <div className="fk-pipe-panel">
      <div className="fk-pipe-panel-header">
        <h2 className="fk-pipe-panel-title">Technical configuration</h2>
      </div>

      <div className="fk-pipe-tech-list">
        <div className="fk-pipe-tech-item">
          <span className="fk-pipe-tech-label">ChromaDB collection</span>
          <span className="fk-pipe-tech-val mono">flatkart_documents</span>
        </div>
        <div className="fk-pipe-tech-item">
          <span className="fk-pipe-tech-label">Embedding model</span>
          <span className="fk-pipe-tech-val mono">all-MiniLM-L6-v2</span>
        </div>
        <div className="fk-pipe-tech-item">
          <span className="fk-pipe-tech-label">Chunking configuration</span>
          <span className="fk-pipe-tech-val">Read from backend</span>
        </div>
      </div>

      <div className="fk-pipe-tech-warning">
        <AlertTriangle size={14} flexShrink={0} />
        <span>Future rebuild/reset requires confirmation.</span>
      </div>

      <button
        type="button"
        className="fk-pipe-rebuild-btn"
        onClick={onOpenRebuildModal}
      >
        Rebuild / reset · future
      </button>
    </div>
  );
}

export default TechnicalConfigPanel;
