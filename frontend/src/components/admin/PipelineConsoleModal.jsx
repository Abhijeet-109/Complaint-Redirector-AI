import React from 'react';
import { Bot, X, Sparkles, Database, FileCheck } from 'lucide-react';

export function PipelineConsoleModal({ isOpen, onClose }) {
  if (!isOpen) return null;

  return (
    <div className="ad-modal-backdrop" onClick={onClose}>
      <div className="ad-modal" style={{ maxWidth: '580px' }} onClick={(e) => e.stopPropagation()}>
        <div className="ad-modal-header">
          <div className="ad-modal-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Bot size={20} color="var(--fk-olive)" />
            <span>Chatbot & RAG Pipeline Management</span>
          </div>
          <button className="ad-modal-close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="ad-modal-body" style={{ gap: '20px' }}>
          <div style={{ background: '#FAF8F4', padding: '16px', borderRadius: '10px', border: '1px solid #ECE7DC' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--fk-olive)', fontWeight: '800', fontSize: '13px', textTransform: 'uppercase', marginBottom: '6px' }}>
              <Sparkles size={16} />
              <span>Next Phase Development</span>
            </div>
            <p style={{ fontSize: '13.5px', color: '#556366', lineHeight: '1.5' }}>
              Chatbot document ingestion, knowledge base indexing, and RAG pipeline configurations are reserved for the upcoming deployment phase.
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
              <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#F0ECE2', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Database size={16} color="var(--fk-olive)" />
              </div>
              <div>
                <div style={{ fontSize: '13.5px', fontWeight: '700', color: 'var(--fk-text-primary)' }}>
                  Knowledge Document Indexing
                </div>
                <div style={{ fontSize: '12.5px', color: '#748082' }}>
                  Upload and index policy and FAQ documents directly into ChromaDB for context-aware customer answers.
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
              <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#F0ECE2', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <FileCheck size={16} color="var(--fk-olive)" />
              </div>
              <div>
                <div style={{ fontSize: '13.5px', fontWeight: '700', color: 'var(--fk-text-primary)' }}>
                  Vector Pipeline Health & Audit
                </div>
                <div style={{ fontSize: '12.5px', color: '#748082' }}>
                  Inspect real-time embedding health, chunk quality, and automated query response logs.
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="ad-modal-footer">
          <button className="ad-btn-primary" onClick={onClose}>
            Got It
          </button>
        </div>
      </div>
    </div>
  );
}

export default PipelineConsoleModal;
