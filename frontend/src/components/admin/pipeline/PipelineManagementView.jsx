import React, { useState, useEffect, useCallback } from 'react';
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
import { KnowledgeDocumentsTable } from './KnowledgeDocumentsTable';
import { IndexingRetrievalPanel } from './IndexingRetrievalPanel';
import { TechnicalConfigPanel } from './TechnicalConfigPanel';
import { ChatbotPerformancePanel } from './ChatbotPerformancePanel';
import { DeleteConfirmationModal } from './DeleteConfirmationModal';
import { documentService } from '../../../services/documentService';
import { adminService } from '../../../services/adminService';

export function PipelineManagementView() {
  // Navigation & View Mode
  const [activeTab, setActiveTab] = useState('documents'); // default to Knowledge Documents matching the baseline screenshot
  const [viewMode, setViewMode] = useState('all'); // default to all sections matching the full screenshot layout!

  // Modals state
  const [deleteModalDocs, setDeleteModalDocs] = useState([]);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

  // Notification Toast state
  const [notice, setNotice] = useState(null);
  const [selectedDocumentNames, setSelectedDocumentNames] = useState(new Set());
  const [isIndexing, setIsIndexing] = useState(false);
  const [indexingResults, setIndexingResults] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [documentsLoading, setDocumentsLoading] = useState(true);
  const [documentsError, setDocumentsError] = useState('');
  const [chatbotPerformance, setChatbotPerformance] = useState(null);
  const [chatbotLoading, setChatbotLoading] = useState(true);
  const [chatbotError, setChatbotError] = useState('');

  // Auto-dismiss notice
  useEffect(() => {
    if (notice) {
      const timer = setTimeout(() => setNotice(null), 4500);
      return () => clearTimeout(timer);
    }
  }, [notice]);

  const showNotice = useCallback((message) => {
    setNotice(message);
  }, []);

  const refreshDocuments = useCallback(async () => {
    setDocumentsLoading(true);
    try {
      const response = await documentService.listDocuments();
      const files = response.files || [];
      setDocuments(files);
      setDocumentsError('');
      return files;
    } catch (error) {
      setDocumentsError(error.message || 'Could not load uploaded documents.');
      return null;
    } finally {
      setDocumentsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshDocuments();
  }, [refreshDocuments]);

  const refreshChatbotPerformance = useCallback(async () => {
    setChatbotLoading(true);
    setChatbotError('');
    try {
      setChatbotPerformance(await adminService.getChatbotPerformance({ offset: 0, limit: 10 }));
    } catch (error) {
      setChatbotPerformance(null);
      setChatbotError(error.message || 'Chatbot telemetry is unavailable.');
    } finally {
      setChatbotLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshChatbotPerformance();
  }, [refreshChatbotPerformance]);

  const handleUploadComplete = async () => {
    const refreshed = await refreshDocuments();
    if (!refreshed) showNotice('Upload succeeded, but the document list could not be refreshed.');
  };

  // Handlers for modal interactions
  const handleOpenDelete = (docs) => {
    setDeleteModalDocs(Array.isArray(docs) ? docs : [docs]);
    setIsDeleteModalOpen(true);
  };

  const handleCloseDelete = () => {
    setIsDeleteModalOpen(false);
    setDeleteModalDocs([]);
  };

  const handleDeleteComplete = async (results) => {
    const deletedNames = new Set(
      results.filter((result) => result.status === 'deleted').map((result) => result.stored_name)
    );
    setDeleteModalDocs((previous) => previous.filter((document) => !deletedNames.has(document.stored_name)));
    const refreshed = await refreshDocuments();
    if (!refreshed) showNotice('Deletion completed, but the document list could not be refreshed.');
  };

  const handleIndexDocuments = async (storedNames) => {
    const names = storedNames.filter(Boolean);
    if (!names.length || isIndexing) return;
    setIsIndexing(true);
    setIndexingResults([]);
    try {
      const response = await documentService.indexDocuments(names);
      const results = response.results || [];
      setIndexingResults(results);
      await refreshDocuments();
      const failed = results.filter((result) => result.status === 'failed').length;
      showNotice(`${results.length - failed} document(s) indexed or already current; ${failed} failed. See per-document results below.`);
    } catch (error) {
      setIndexingResults([{ status: 'failed', message: error.message || 'Document indexing failed.' }]);
      showNotice(error.message || 'Document indexing failed.');
    } finally {
      setIsIndexing(false);
    }
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
          <span className="fk-pipe-status-pill">
            Admin console
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
          <PipelineKpiCards documents={documents} isLoading={documentsLoading} error={documentsError} chatbotTotal={chatbotPerformance?.total_requests} chatbotLoading={chatbotLoading} chatbotError={chatbotError} />

          {/* Row 2: Document Upload & Source Connections */}
          <div className="fk-pipe-split-row">
            <DocumentUploadPanel onShowNotice={showNotice} onUploadComplete={handleUploadComplete} />
            <SourceConnectionsPanel onImportComplete={handleUploadComplete} />
          </div>

          {/* Row 3: Knowledge Documents Table */}
          <KnowledgeDocumentsTable
            onOpenDelete={handleOpenDelete}
            onShowNotice={showNotice}
            files={documents}
            isLoading={documentsLoading}
            loadError={documentsError}
            refreshDocuments={refreshDocuments}
            selectedIds={selectedDocumentNames}
            onSelectionChange={setSelectedDocumentNames}
            onIndexDocuments={handleIndexDocuments}
            isIndexing={isIndexing}
          />

          {/* Row 4: Indexing & Retrieval + Technical Config */}
          <div className="fk-pipe-split-row">
            <IndexingRetrievalPanel documents={documents} selectedCount={selectedDocumentNames.size} isLoading={documentsLoading} loadError={documentsError} isIndexing={isIndexing} results={indexingResults} onRefresh={refreshDocuments} onIndex={() => handleIndexDocuments([...selectedDocumentNames])} />
            <TechnicalConfigPanel />
          </div>

          {/* Row 5 & 6: Chatbot Performance & Recent Queries */}
          <ChatbotPerformancePanel data={chatbotPerformance} loading={chatbotLoading} error={chatbotError} onRefresh={refreshChatbotPerformance} />
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
              <PipelineKpiCards documents={documents} isLoading={documentsLoading} error={documentsError} chatbotTotal={chatbotPerformance?.total_requests} chatbotLoading={chatbotLoading} chatbotError={chatbotError} />

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
                    Upload supported PDF and DOCX files, check stored files, and manage their index.
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
                    Check live document index status and manage indexing in ChromaDB.
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
                    Persisted chatbot request outcomes and response latency for the last 30 days.
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
                <DocumentUploadPanel onShowNotice={showNotice} onUploadComplete={handleUploadComplete} />
                <SourceConnectionsPanel onImportComplete={handleUploadComplete} />
              </div>

              <KnowledgeDocumentsTable
                onOpenDelete={handleOpenDelete}
                onShowNotice={showNotice}
                files={documents}
                isLoading={documentsLoading}
                loadError={documentsError}
                refreshDocuments={refreshDocuments}
                selectedIds={selectedDocumentNames}
                onSelectionChange={setSelectedDocumentNames}
                onIndexDocuments={handleIndexDocuments}
                isIndexing={isIndexing}
              />
            </>
          )}

          {/* TAB 3: INDEXING & RETRIEVAL */}
          {activeTab === 'indexing' && (
            <div className="fk-pipe-split-row">
              <IndexingRetrievalPanel documents={documents} selectedCount={selectedDocumentNames.size} isLoading={documentsLoading} loadError={documentsError} isIndexing={isIndexing} results={indexingResults} onRefresh={refreshDocuments} onIndex={() => handleIndexDocuments([...selectedDocumentNames])} />
              <TechnicalConfigPanel />
            </div>
          )}

          {/* TAB 4: CHATBOT PERFORMANCE */}
          {activeTab === 'performance' && (
            <ChatbotPerformancePanel data={chatbotPerformance} loading={chatbotLoading} error={chatbotError} onRefresh={refreshChatbotPerformance} />
          )}
        </>
      )}

      {/* 5. Delete Confirmation Modal */}
      <DeleteConfirmationModal
        documents={deleteModalDocs}
        isOpen={isDeleteModalOpen}
        onClose={handleCloseDelete}
        onShowNotice={showNotice}
        onDeleteComplete={handleDeleteComplete}
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
