import React, { useState, useEffect } from 'react';
import {
  UploadCloud,
  FileCheck,
  Activity,
  ArrowRight,
  Info,
  X,
} from 'lucide-react';
import './PipelineManagement.css';
import { PipelineTabs } from './PipelineTabs';
import { PipelineKpiCards } from './PipelineKpiCards';
import { DocumentUploadPanel } from './DocumentUploadPanel';
import { SourceConnectionsPanel } from './SourceConnectionsPanel';
import { KnowledgeDocumentsTable, INITIAL_KNOWLEDGE_DOCS } from './KnowledgeDocumentsTable';
import { IndexingRetrievalPanel } from './IndexingRetrievalPanel';
import { TechnicalConfigPanel } from './TechnicalConfigPanel';
import { ChatbotPerformancePanel } from './ChatbotPerformancePanel';
import { DocumentReviewModal } from './DocumentReviewModal';
import { DeleteConfirmationModal } from './DeleteConfirmationModal';
import { RebuildResetModal } from './RebuildResetModal';

export function PipelineManagementView() {
  // Navigation & View Mode
  const [activeTab, setActiveTab] = useState('documents'); // default to Knowledge Documents matching the baseline screenshot
  const [viewMode, setViewMode] = useState('all'); // default to all sections matching the full screenshot layout!

  // Modals state
  const [reviewModalDoc, setReviewModalDoc] = useState(null);
  const [deleteModalDocs, setDeleteModalDocs] = useState([]);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isRebuildModalOpen, setIsRebuildModalOpen] = useState(false);

  // Notification Toast state
  const [notice, setNotice] = useState(null);

  // Auto-dismiss notice
  useEffect(() => {
    if (notice) {
      const timer = setTimeout(() => setNotice(null), 4500);
      return () => clearTimeout(timer);
    }
  }, [notice]);

  const showNotice = (message) => {
    setNotice(message);
  };

  // Handlers for modal interactions
  const handleOpenReview = (doc) => {
    setReviewModalDoc(doc);
  };

  const handleCloseReview = () => {
    setReviewModalDoc(null);
  };

  const handleOpenDelete = (docs) => {
    setDeleteModalDocs(Array.isArray(docs) ? docs : [docs]);
    setIsDeleteModalOpen(true);
  };

  const handleCloseDelete = () => {
    setIsDeleteModalOpen(false);
    setDeleteModalDocs([]);
  };

  const handlePreviewDeleteModal = () => {
    // Open delete confirmation with sample document matching reference
    handleOpenDelete([INITIAL_KNOWLEDGE_DOCS[0]]);
  };

  return (
    <div className="fk-pipe-container">
      {/* 1. Header Row */}
      <div className="fk-pipe-header-row">
        <div className="fk-pipe-header-left">
          <h1 className="fk-pipe-title">Chatbot & Pipeline Console</h1>
          <p className="fk-pipe-subtitle">
            Knowledge base and vector indexing administration.
          </p>
        </div>

        <div className="fk-pipe-header-right">
          <span className="fk-pipe-status-pill" title="UI PREVIEW · BACKEND INTEGRATION PENDING">
            Design reference · API pending
          </span>
        </div>
      </div>

      {/* 2. Navigation Tabs & View Mode Switcher */}
      <PipelineTabs
        activeTab={activeTab}
        onSelectTab={(tabId) => {
          setActiveTab(tabId);
          setViewMode('tabs');
        }}
        viewMode={viewMode}
        onToggleViewMode={setViewMode}
      />

      {/* 3. Conditional Content Rendering */}
      {viewMode === 'all' ? (
        /* ============================================================
           COMPOSITE ALL-SECTIONS VIEW (EXACTLY MATCHING BASELINE SCREENSHOT)
           ============================================================ */
        <>
          {/* Row 1: 7 KPI Cards */}
          <PipelineKpiCards />

          {/* Row 2: Document Upload & Source Connections */}
          <div className="fk-pipe-split-row">
            <DocumentUploadPanel onShowNotice={showNotice} />
            <SourceConnectionsPanel />
          </div>

          {/* Row 3: Knowledge Documents Table */}
          <KnowledgeDocumentsTable
            onOpenReview={handleOpenReview}
            onOpenDelete={handleOpenDelete}
            onShowNotice={showNotice}
          />

          {/* Row 4: Indexing & Retrieval + Technical Config */}
          <div className="fk-pipe-split-row">
            <IndexingRetrievalPanel onShowNotice={showNotice} />
            <TechnicalConfigPanel onOpenRebuildModal={() => setIsRebuildModalOpen(true)} />
          </div>

          {/* Row 5 & 6: Chatbot Performance & Recent Queries */}
          <ChatbotPerformancePanel onPreviewDeleteModal={handlePreviewDeleteModal} />
        </>
      ) : (
        /* ============================================================
           TABBED FOCUSED VIEWS
           ============================================================ */
        <>
          {/* TAB 1: OVERVIEW */}
          {activeTab === 'overview' && (
            <>
              {/* 7 KPI Cards */}
              <PipelineKpiCards />

              {/* Explanatory Pipeline Lifecycle Overview (Section 7) */}
              <div className="fk-pipe-flow-card">
                <div className="fk-pipe-flow-title">Pipeline Architecture Flow</div>
                <div className="fk-pipe-flow-steps">
                  <div className="fk-pipe-flow-step-item">1. Upload</div>
                  <span className="fk-pipe-step-arrow">→</span>
                  <div className="fk-pipe-flow-step-item">2. Approval</div>
                  <span className="fk-pipe-step-arrow">→</span>
                  <div className="fk-pipe-flow-step-item">3. Indexing</div>
                  <span className="fk-pipe-step-arrow">→</span>
                  <div className="fk-pipe-flow-step-item">4. Retrieval</div>
                  <span className="fk-pipe-step-arrow">→</span>
                  <div className="fk-pipe-flow-step-item">5. Answer</div>
                </div>
              </div>

              {/* Quick Jump Panels */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginTop: '4px' }}>
                <div
                  className="fk-pipe-panel"
                  style={{ cursor: 'pointer' }}
                  onClick={() => setActiveTab('documents')}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    <UploadCloud size={18} color="var(--fk-olive, #8A875D)" />
                    <h3 style={{ fontSize: '14.5px', fontWeight: '800', color: 'var(--fk-text-primary, #1C352F)' }}>
                      Knowledge Documents
                    </h3>
                  </div>
                  <p style={{ fontSize: '12.5px', color: '#637073', lineHeight: '1.45', flex: 1 }}>
                    Ingest policy PDFs and DOCX files. Validate formats and review document queues.
                  </p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', fontWeight: '700', color: 'var(--fk-olive, #8A875D)', marginTop: '12px' }}>
                    <span>Open Documents</span>
                    <ArrowRight size={13} />
                  </div>
                </div>

                <div
                  className="fk-pipe-panel"
                  style={{ cursor: 'pointer' }}
                  onClick={() => setActiveTab('indexing')}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    <FileCheck size={18} color="var(--fk-olive, #8A875D)" />
                    <h3 style={{ fontSize: '14.5px', fontWeight: '800', color: 'var(--fk-text-primary, #1C352F)' }}>
                      Indexing & Retrieval
                    </h3>
                  </div>
                  <p style={{ fontSize: '12.5px', color: '#637073', lineHeight: '1.45', flex: 1 }}>
                    Monitor the 6-stage document lifecycle and configure ChromaDB embedding collections.
                  </p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', fontWeight: '700', color: 'var(--fk-olive, #8A875D)', marginTop: '12px' }}>
                    <span>Inspect Pipeline</span>
                    <ArrowRight size={13} />
                  </div>
                </div>

                <div
                  className="fk-pipe-panel"
                  style={{ cursor: 'pointer' }}
                  onClick={() => setActiveTab('performance')}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    <Activity size={18} color="var(--fk-olive, #8A875D)" />
                    <h3 style={{ fontSize: '14.5px', fontWeight: '800', color: 'var(--fk-text-primary, #1C352F)' }}>
                      Chatbot Performance
                    </h3>
                  </div>
                  <p style={{ fontSize: '12.5px', color: '#637073', lineHeight: '1.45', flex: 1 }}>
                    Telemetry metrics, response latencies, source tracking, and recent assistant query logs.
                  </p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', fontWeight: '700', color: 'var(--fk-olive, #8A875D)', marginTop: '12px' }}>
                    <span>View Telemetry</span>
                    <ArrowRight size={13} />
                  </div>
                </div>
              </div>
            </>
          )}

          {/* TAB 2: KNOWLEDGE DOCUMENTS */}
          {activeTab === 'documents' && (
            <>
              <div className="fk-pipe-split-row">
                <DocumentUploadPanel onShowNotice={showNotice} />
                <SourceConnectionsPanel />
              </div>

              <KnowledgeDocumentsTable
                onOpenReview={handleOpenReview}
                onOpenDelete={handleOpenDelete}
                onShowNotice={showNotice}
              />
            </>
          )}

          {/* TAB 3: INDEXING & RETRIEVAL */}
          {activeTab === 'indexing' && (
            <div className="fk-pipe-split-row">
              <IndexingRetrievalPanel onShowNotice={showNotice} />
              <TechnicalConfigPanel onOpenRebuildModal={() => setIsRebuildModalOpen(true)} />
            </div>
          )}

          {/* TAB 4: CHATBOT PERFORMANCE */}
          {activeTab === 'performance' && (
            <ChatbotPerformancePanel onPreviewDeleteModal={handlePreviewDeleteModal} />
          )}
        </>
      )}

      {/* 4. Document Review & Approval Modal */}
      <DocumentReviewModal
        document={reviewModalDoc}
        isOpen={Boolean(reviewModalDoc)}
        onClose={handleCloseReview}
        onShowNotice={showNotice}
      />

      {/* 5. Delete Confirmation Modal */}
      <DeleteConfirmationModal
        documents={deleteModalDocs}
        isOpen={isDeleteModalOpen}
        onClose={handleCloseDelete}
        onShowNotice={showNotice}
      />

      {/* 6. Rebuild / Reset Vector Index Modal */}
      <RebuildResetModal
        isOpen={isRebuildModalOpen}
        onClose={() => setIsRebuildModalOpen(false)}
      />

      {/* 7. Notification Toast */}
      {notice && (
        <div className="fk-pipe-toast" role="status" aria-live="polite">
          <Info size={17} color="var(--fk-gold, #C2A15A)" flexShrink={0} />
          <span style={{ flex: 1 }}>{notice}</span>
          <button
            type="button"
            className="fk-pipe-toast-close"
            onClick={() => setNotice(null)}
            aria-label="Dismiss message"
          >
            <X size={15} />
          </button>
        </div>
      )}
    </div>
  );
}

export default PipelineManagementView;
