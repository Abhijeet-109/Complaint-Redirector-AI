import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  Cloud,
  FileText,
  Folder,
  LoaderCircle,
  RefreshCw,
  Upload,
  X,
} from 'lucide-react';
import { driveService } from '../../../services/driveService';

const DRIVE_PENDING_KEY = 'flatkart_drive_oauth_pending_at';
const DRIVE_PENDING_WINDOW_MS = 10 * 60 * 1000;
const MAX_IMPORT_FILES = 20;
const DRIVE_FOLDER_MIME = 'application/vnd.google-apps.folder';
const SUPPORTED_FILE_TYPES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.google-apps.document',
]);

function formatModifiedTime(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString();
}

function isFolder(file) {
  return file.mimeType === DRIVE_FOLDER_MIME;
}

export function SourceConnectionsPanel({ onImportComplete, onShowNotice, onStatusChange }) {
  const [status, setStatus] = useState(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [statusError, setStatusError] = useState('');
  const [action, setAction] = useState('');
  const [feedback, setFeedback] = useState(null);
  const [isBrowserOpen, setIsBrowserOpen] = useState(false);
  const [folderStack, setFolderStack] = useState([{ id: null, name: 'My Drive' }]);
  const [files, setFiles] = useState([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [filesError, setFilesError] = useState('');
  const [nextPageToken, setNextPageToken] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [importStatuses, setImportStatuses] = useState([]);
  const [importStatusesLoading, setImportStatusesLoading] = useState(false);
  const [importStatusesError, setImportStatusesError] = useState('');
  const [importResults, setImportResults] = useState([]);
  const [importFeedback, setImportFeedback] = useState(null);
  const [isImporting, setIsImporting] = useState(false);
  const importInFlightRef = useRef(false);

  const refreshStatus = useCallback(async () => {
    setStatusLoading(true);
    setStatusError('');
    onStatusChange?.({ loading: true });
    try {
      const result = await driveService.getStatus();
      setStatus(result);
      onStatusChange?.({ status: result, loading: false });
      return result;
    } catch (error) {
      setStatus(null);
      setStatusError(error.message || 'Could not check Google Drive connection status.');
      onStatusChange?.({ status: null, loading: false });
      return null;
    } finally {
      setStatusLoading(false);
    }
  }, [onStatusChange]);

  useEffect(() => {
    const pendingAt = Number(sessionStorage.getItem(DRIVE_PENDING_KEY));
    sessionStorage.removeItem(DRIVE_PENDING_KEY);
    const returnedFromOAuth = pendingAt > 0 && Date.now() - pendingAt < DRIVE_PENDING_WINDOW_MS;

    refreshStatus().then((result) => {
      if (!returnedFromOAuth) return;
      setFeedback(result?.connected
        ? { type: 'success', text: result.message || 'Google Drive connected.' }
        : { type: 'error', text: 'Google Drive connection was not confirmed. Try connecting again.' });
    });
  }, [refreshStatus]);

  const loadFiles = async ({ folderId = null, pageToken = null, append = false } = {}) => {
    setFilesLoading(true);
    setFilesError('');
    try {
      const response = await driveService.listFiles({ folderId, pageToken });
      const nextFiles = Array.isArray(response.files) ? response.files : [];
      setFiles((previous) => {
        if (!append) return nextFiles;
        const knownIds = new Set(previous.map((file) => file.id));
        const newFiles = nextFiles.filter((file) => {
          if (knownIds.has(file.id)) return false;
          knownIds.add(file.id);
          return true;
        });
        return [...previous, ...newFiles];
      });
      setNextPageToken(response.next_page_token || null);
      return true;
    } catch (error) {
      setFilesError(error.message || 'Could not load Google Drive files.');
      return false;
    } finally {
      setFilesLoading(false);
    }
  };

  const loadImportStatuses = async () => {
    setImportStatusesLoading(true);
    setImportStatusesError('');
    try {
      const response = await driveService.getImportStatus();
      setImportStatuses(Array.isArray(response.files) ? response.files : []);
    } catch (error) {
      setImportStatuses([]);
      setImportStatusesError(error.message || 'Could not load Drive import statuses.');
    } finally {
      setImportStatusesLoading(false);
    }
  };

  const openBrowser = async () => {
    setFolderStack([{ id: null, name: 'My Drive' }]);
    setSelectedIds(new Set());
    setImportResults([]);
    setImportFeedback(null);
    setIsBrowserOpen(true);
    await Promise.all([
      loadFiles(),
      loadImportStatuses(),
    ]);
  };

  const startConnection = async () => {
    setAction('connect');
    setFeedback(null);
    try {
      const response = await driveService.startConnection();
      if (!response.authorization_url) {
        throw new Error('The backend did not return a Google authorization URL.');
      }
      sessionStorage.setItem(DRIVE_PENDING_KEY, String(Date.now()));
      window.location.assign(response.authorization_url);
    } catch (error) {
      setFeedback({ type: 'error', text: error.message || 'Could not start Google Drive connection.' });
    } finally {
      setAction('');
    }
  };

  const disconnect = async () => {
    if (!window.confirm('Disconnect Google Drive? Imported documents will remain in the document store.')) return;
    setAction('disconnect');
    setFeedback(null);
    try {
      const response = await driveService.disconnect();
      await refreshStatus();
      setFeedback({ type: 'success', text: response.message || 'Google Drive disconnected.' });
    } catch (error) {
      setFeedback({ type: 'error', text: error.message || 'Could not disconnect Google Drive.' });
      await refreshStatus();
    } finally {
      setAction('');
    }
  };

  const enterFolder = async (folder) => {
    const loaded = await loadFiles({ folderId: folder.id });
    if (loaded) setFolderStack((previous) => [...previous, { id: folder.id, name: folder.name }]);
  };

  const goToParentFolder = async () => {
    if (folderStack.length <= 1) return;
    const parent = folderStack[folderStack.length - 2];
    const loaded = await loadFiles({ folderId: parent.id });
    if (loaded) setFolderStack((previous) => previous.slice(0, -1));
  };

  const goToBreadcrumb = async (index) => {
    if (index >= folderStack.length - 1 || filesLoading) return;
    const folder = folderStack[index];
    const loaded = await loadFiles({ folderId: folder.id });
    if (loaded) setFolderStack((previous) => previous.slice(0, index + 1));
  };

  const toggleFile = (file) => {
    if (!SUPPORTED_FILE_TYPES.has(file.mimeType)) return;
    setSelectedIds((previous) => {
      const next = new Set(previous);
      if (next.has(file.id)) next.delete(file.id);
      else if (next.size < MAX_IMPORT_FILES) next.add(file.id);
      return next;
    });
  };

  const importSelected = async () => {
    if (selectedIds.size === 0 || importInFlightRef.current) return;
    importInFlightRef.current = true;
    setIsImporting(true);
    setImportFeedback(null);
    setImportResults([]);
    try {
      const response = await driveService.importFiles([...selectedIds]);
      const results = Array.isArray(response.results) ? response.results : [];
      setImportResults(results);
      const importedCount = Number(response.imported_count) || 0;
      const alreadyImportedCount = Number(response.already_imported_count) || 0;
      const failedCount = results.filter((result) => result.status === 'failed').length;
      const hasFailure = failedCount > 0;
      setImportFeedback({
        type: hasFailure ? 'error' : 'success',
        text: `Imported and indexed ${importedCount}; already indexed ${alreadyImportedCount}${hasFailure ? `; ${failedCount} failed` : ''}.`,
      });
      if (importedCount > 0) {
        const listRefreshed = await onImportComplete?.();
        await loadImportStatuses();
        const message = `${importedCount} Google Drive document${importedCount === 1 ? '' : 's'} imported and indexed successfully.`
          + (hasFailure ? ` ${failedCount} file${failedCount === 1 ? '' : 's'} failed; see import results.` : '')
          + (listRefreshed === false ? ' The document list could not be refreshed.' : '');
        onShowNotice?.(message, hasFailure || listRefreshed === false ? 'warning' : 'success');
      } else if (failedCount > 0) {
        onShowNotice?.(`${failedCount} Google Drive file${failedCount === 1 ? '' : 's'} could not be imported. See import results.`, 'error');
      } else if (alreadyImportedCount > 0) {
        onShowNotice?.(`No new files were imported; ${alreadyImportedCount} document${alreadyImportedCount === 1 ? ' was' : 's were'} already indexed.`, 'info');
      }
      setSelectedIds(new Set());
    } catch (error) {
      const message = error.message || 'Could not import the selected Drive files.';
      setImportFeedback({ type: 'error', text: message });
      onShowNotice?.(message, 'error');
    } finally {
      importInFlightRef.current = false;
      setIsImporting(false);
    }
  };

  const connected = status?.connected === true;

  return (
    <div className="fk-pipe-panel">
      <div className="fk-pipe-panel-header">
        <h2 className="fk-pipe-panel-title">Source Connections</h2>
      </div>

      <div className="fk-pipe-sources-list">
        <div className="fk-pipe-source-card">
          <div className="fk-pipe-source-left">
            <div className="fk-pipe-source-icon"><Upload size={17} /></div>
            <div>
              <div className="fk-pipe-source-title">Local Upload</div>
              <div className="fk-pipe-source-sub">Direct file ingestion for PDF/DOCX</div>
            </div>
          </div>
          <span className="fk-pipe-badge-available">Available</span>
        </div>

        <div className="fk-pipe-source-card fk-pipe-drive-source-card">
          <div className="fk-pipe-drive-source-info">
            <div className="fk-pipe-source-left">
              <div className="fk-pipe-source-icon"><Cloud size={17} /></div>
              <div>
                <div className="fk-pipe-source-title">Google Drive</div>
                <div className="fk-pipe-source-sub">
                  {statusLoading ? 'Checking connection…' : status?.message || 'Connection status unavailable.'}
                </div>
              </div>
            </div>
            <div className="fk-pipe-drive-source-status">
              {statusLoading ? <span className="fk-pipe-badge-pending">Checking</span>
                : statusError ? <span className="fk-pipe-badge-pending">Status unavailable</span>
                : connected ? <span className="fk-pipe-badge-available">Connected</span>
                  : <span className="fk-pipe-badge-pending">Not connected</span>}
            </div>
          </div>
          <div className="fk-pipe-drive-source-actions">
            {statusError ? <button type="button" className="fk-pipe-btn-secondary" onClick={refreshStatus} disabled={statusLoading}>Retry Status</button>
              : connected ? <>
              <button type="button" className="fk-pipe-btn-secondary" onClick={openBrowser}>Browse Files</button>
              <button type="button" className="fk-pipe-btn-secondary" onClick={disconnect} disabled={Boolean(action)}>
                {action === 'disconnect' ? 'Disconnecting…' : 'Disconnect'}
              </button>
            </> : <button type="button" className="fk-pipe-btn-secondary" onClick={startConnection} disabled={statusLoading || Boolean(action)}>
              {action === 'connect' ? 'Connecting…' : 'Connect'}
            </button>}
          </div>
        </div>
      </div>

      {statusError && <p className="fk-pipe-config-error" role="alert">{statusError}</p>}
      {feedback && <p className={`fk-pipe-drive-message ${feedback.type}`} role={feedback.type === 'error' ? 'alert' : 'status'}>
        {feedback.type === 'success' ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
        {feedback.text}
      </p>}
      <div className="fk-pipe-sources-footnote">Disconnecting Drive does not remove documents already imported into the document store.</div>

      {isBrowserOpen && (
        <div className="ad-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !isImporting) setIsBrowserOpen(false); }}>
          <section className="ad-modal fk-pipe-drive-modal" role="dialog" aria-modal="true" aria-labelledby="fk-pipe-drive-modal-title">
            <header className="ad-modal-header">
              <div>
                <div className="ad-modal-title" id="fk-pipe-drive-modal-title">Browse Google Drive</div>
                <nav className="fk-pipe-drive-breadcrumbs" aria-label="Current Drive folder">
                  {folderStack.map((folder, index) => <React.Fragment key={folder.id || 'root'}>
                    {index > 0 && <span aria-hidden="true">/</span>}
                    {index === folderStack.length - 1
                      ? <span aria-current="page">{folder.name}</span>
                      : <button type="button" className="fk-pipe-drive-breadcrumb" onClick={() => goToBreadcrumb(index)} disabled={filesLoading}>{folder.name}</button>}
                  </React.Fragment>)}
                </nav>
              </div>
              <button type="button" className="ad-modal-close" aria-label="Close Drive browser" onClick={() => !isImporting && setIsBrowserOpen(false)} disabled={isImporting}><X size={18} /></button>
            </header>

            <div className="ad-modal-body fk-pipe-drive-modal-body">
              <div className="fk-pipe-drive-browser-toolbar">
                <button type="button" className="fk-pipe-btn-secondary" onClick={goToParentFolder} disabled={filesLoading || folderStack.length <= 1}>
                  <ChevronLeft size={14} /> Back
                </button>
                <button type="button" className="fk-pipe-btn-secondary" onClick={() => loadFiles({ folderId: folderStack[folderStack.length - 1]?.id })} disabled={filesLoading}>
                  <RefreshCw size={14} /> Refresh
                </button>
                <span>{selectedIds.size} selected · maximum {MAX_IMPORT_FILES}</span>
              </div>

              {filesError && <div className="fk-pipe-config-error" role="alert">{filesError}</div>}
              <div className="fk-pipe-drive-scroll-area">
              <div className="fk-pipe-drive-file-list" aria-live="polite">
                {filesLoading && files.length === 0 ? <div className="fk-pipe-drive-empty"><LoaderCircle size={18} className="fk-pipe-drive-spinner" /> Loading Drive files…</div>
                  : filesError && files.length === 0 ? <div className="fk-pipe-drive-empty">Drive files could not be loaded.</div>
                    : files.length === 0 ? <div className="fk-pipe-drive-empty">This folder is empty.</div>
                      : files.map((file) => {
                        const folder = isFolder(file);
                        const supported = SUPPORTED_FILE_TYPES.has(file.mimeType);
                        return <div className="fk-pipe-drive-file-row" key={file.id}>
                          {folder ? <button type="button" className="fk-pipe-drive-folder" onClick={() => enterFolder(file)} disabled={filesLoading}>
                            <Folder size={18} /><span className="fk-pipe-drive-file-name">{file.name}</span><span>Open</span>
                          </button> : <label className={`fk-pipe-drive-file${supported ? '' : ' unsupported'}`}>
                            <input type="checkbox" checked={selectedIds.has(file.id)} disabled={!supported || (!selectedIds.has(file.id) && selectedIds.size >= MAX_IMPORT_FILES) || isImporting} onChange={() => toggleFile(file)} />
                            <FileText size={17} />
                            <span className="fk-pipe-drive-file-main"><span className="fk-pipe-drive-file-name">{file.name}</span><span className="fk-pipe-drive-file-meta">{formatModifiedTime(file.modifiedTime)}{!supported ? ' · Unsupported file type' : ''}</span></span>
                          </label>}
                        </div>;
                      })}
              </div>

              {nextPageToken && <div className="fk-pipe-drive-load-more">
                <button type="button" className="fk-pipe-btn-secondary" onClick={() => loadFiles({ folderId: folderStack[folderStack.length - 1]?.id, pageToken: nextPageToken, append: true })} disabled={filesLoading}>
                  {filesLoading ? 'Loading…' : 'Load More Files'}
                </button>
              </div>}

              <section className="fk-pipe-drive-import-status">
                <h3>Previously imported from Drive</h3>
                {importStatusesLoading ? <p className="fk-pipe-panel-sub" role="status">Loading import status…</p>
                  : importStatusesError ? <p className="fk-pipe-config-error" role="alert">{importStatusesError}</p>
                  : importStatuses.length === 0 ? <p className="fk-pipe-panel-sub">No Drive import records are available.</p>
                    : <div className="fk-pipe-drive-status-list">{importStatuses.map((item) => <div key={item.stored_name}>
                      <span className="fk-pipe-drive-file-name">{item.original_name}</span>
                      <span>{item.status}</span>
                      {item.chunks != null && <span>{item.chunks} chunks</span>}
                    </div>)}</div>}
              </section>

              {importFeedback && <p className={`fk-pipe-drive-message ${importFeedback.type}`} role={importFeedback.type === 'error' ? 'alert' : 'status'}>
                {importFeedback.type === 'success' ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}{importFeedback.text}
              </p>}
              {importResults.length > 0 && <div className="fk-pipe-drive-import-results" aria-label="Drive import results">
                {importResults.map((result, index) => <div key={`${result.file_id}-${index}`}>
                  <span>{result.original_name || result.file_id}: {result.status}</span>
                  {result.message && <span>{result.message}</span>}
                </div>)}
              </div>}
              </div>
            </div>

            <footer className="ad-modal-footer">
              <button type="button" className="fk-pipe-btn-secondary" onClick={() => setIsBrowserOpen(false)} disabled={isImporting}>Close</button>
              <button type="button" className="fk-pipe-btn-primary-sm" onClick={importSelected} disabled={isImporting || selectedIds.size === 0}>
                {isImporting ? 'Importing…' : `Import Selected (${selectedIds.size})`}
              </button>
            </footer>
          </section>
        </div>
      )}
    </div>
  );
}

export default SourceConnectionsPanel;
