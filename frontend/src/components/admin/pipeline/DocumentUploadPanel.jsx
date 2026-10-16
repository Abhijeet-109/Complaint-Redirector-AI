import React, { useState, useRef } from 'react';
import { UploadCloud, FileText, X } from 'lucide-react';
import { documentService } from '../../../services/documentService';
import { findExistingLocalDocuments, hasUnresolvedDocumentChoices, partitionDocumentUploads } from '../../../utils/documentUpload.js';

function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export function DocumentUploadPanel({ onShowNotice, onUploadComplete, documents = [] }) {
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const fileInputRef = useRef(null);
  const uploadInFlightRef = useRef(false);

  const processIncomingFiles = (fileList) => {
    if (isUploading || !fileList || fileList.length === 0) return;

    const newFiles = [];
    const existingNames = new Set(selectedFiles.map((f) => f.name.toLowerCase()));

    for (const file of Array.from(fileList)) {
      const lowerName = file.name.toLowerCase();
      if (existingNames.has(lowerName)) {
        if (onShowNotice) {
          onShowNotice(`"${file.name}" is already in the selection queue.`);
        }
        continue;
      }

      existingNames.add(lowerName);
      const isPdf = lowerName.endsWith('.pdf');
      const isDocx = lowerName.endsWith('.docx');
      const isValid = isPdf || isDocx;
      const matches = findExistingLocalDocuments(file.name, documents);

      newFiles.push({
        id: `local-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
        name: file.name,
        sizeFormatted: formatBytes(file.size),
        status: isValid ? 'valid' : 'invalid',
        statusLabel: isValid
          ? isPdf ? 'Valid PDF' : 'Valid DOCX'
          : 'Invalid type (PDF/DOCX required)',
        isValid,
        fileObject: file,
        existingMatches: matches,
        uploadChoice: matches.length ? '' : 'separate',
      });
    }

    if (newFiles.length > 0) {
      setSelectedFiles((prev) => [...prev, ...newFiles]);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    if (!isUploading && e.dataTransfer && e.dataTransfer.files) {
      processIncomingFiles(e.dataTransfer.files);
    }
  };

  const handleFileInputChange = (e) => {
    if (e.target.files) {
      processIncomingFiles(e.target.files);
      // Reset input value so same file can be re-selected if deleted
      e.target.value = '';
    }
  };

  const handleRemoveFile = (fileId) => {
    setSelectedFiles((prev) => prev.filter((f) => f.id !== fileId));
  };

  const handleUploadClick = async () => {
    const files = selectedFiles.filter((file) => file.isValid && file.fileObject);
    if (files.length === 0 || uploadInFlightRef.current) return;
    if (hasUnresolvedDocumentChoices(files)) {
      onShowNotice?.('Choose whether to update the matching document or upload a separate copy.', 'warning');
      return;
    }

    uploadInFlightRef.current = true;
    setIsUploading(true);
    setUploadError('');
    try {
      const { separateFiles, replacements } = partitionDocumentUploads(files);
      let uploadedCount = 0;
      let failedCount = 0;
      let updatedCount = 0;
      let alreadyCurrentCount = 0;
      const failureDetails = [];

      if (separateFiles.length) {
        try {
          const response = await documentService.uploadDocuments(separateFiles.map((file) => file.fileObject));
          const uploadedFiles = Array.isArray(response.files) ? response.files : [];
          uploadedCount = Number.isInteger(response.uploaded_count) ? response.uploaded_count : uploadedFiles.length;
          const errors = Array.isArray(response.errors) ? response.errors : [];
          failedCount += Math.max(Number(response.failed_count) || 0, errors.length);
          failureDetails.push(...errors.map((item) => `${item.original_name || 'File'}: ${item.message || 'Upload failed.'}`));
        } catch (error) {
          failedCount += separateFiles.length;
          failureDetails.push(error.message || 'Upload failed. Please try again.');
        }
      }

      for (const replacement of replacements) {
        try {
          const result = await documentService.replaceDocument(replacement.uploadChoice, replacement.fileObject);
          if (result.status === 'already_indexed') alreadyCurrentCount += 1;
          else if (result.status === 'indexed') updatedCount += 1;
          else failureDetails.push(`${replacement.name}: The document was saved but is not indexed yet.`);
        } catch (error) {
          failedCount += 1;
          failureDetails.push(`${replacement.name}: ${error.message || 'Update failed.'}`);
        }
      }

      const rejectedLocalFiles = selectedFiles.filter((file) => !file.isValid);
      failedCount += rejectedLocalFiles.length;
      failureDetails.push(...rejectedLocalFiles.map((file) => `${file.name}: PDF or DOCX files only.`));

      setSelectedFiles([]);

      const successCount = uploadedCount + updatedCount + alreadyCurrentCount;
      if (successCount > 0) {
        const listRefreshed = await onUploadComplete?.();
        const messages = [];
        if (uploadedCount) messages.push(`${uploadedCount} document${uploadedCount === 1 ? '' : 's'} uploaded; indexing is pending.`);
        if (updatedCount) messages.push(`${updatedCount} document${updatedCount === 1 ? '' : 's'} updated and indexed.`);
        if (alreadyCurrentCount) messages.push(`${alreadyCurrentCount} document${alreadyCurrentCount === 1 ? ' is' : 's are'} already up to date.`);
        if (failedCount) messages.push(`${failedCount} file${failedCount === 1 ? '' : 's'} failed.`);
        if (listRefreshed === false) messages.push('The document list could not be refreshed.');
        const message = messages.join(' ');
        onShowNotice?.(message, failedCount || listRefreshed === false ? 'warning' : 'success');
      } else {
        const message = failureDetails.join(' ') || 'No documents were uploaded successfully.';
        setUploadError(message);
        onShowNotice?.(message, 'error');
      }

      if (failureDetails.length > 0) setUploadError(failureDetails.join(' '));
    } catch (error) {
      const message = error.message || 'Upload failed. Please try again.';
      setUploadError(message);
      onShowNotice?.(message, 'error');
    } finally {
      uploadInFlightRef.current = false;
      setIsUploading(false);
    }
  };

  return (
    <div className="fk-pipe-panel">
      <div className="fk-pipe-panel-header">
        <h2 className="fk-pipe-panel-title">Document upload</h2>
        <span className="fk-pipe-panel-sub">Upload PDF or DOCX documents</span>
      </div>

      {/* Hidden File Input */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileInputChange}
        disabled={isUploading}
        style={{ display: 'none' }}
        multiple
        accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        aria-label="Upload document files"
      />

      {/* Drag & Drop Zone */}
      <div
        className={`fk-pipe-dropzone ${isDragOver ? 'drag-active' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => !isUploading && fileInputRef.current && fileInputRef.current.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            !isUploading && fileInputRef.current && fileInputRef.current.click();
          }
        }}
      >
        <div className="fk-pipe-dropzone-icon">
          <UploadCloud size={24} />
        </div>
        <div className="fk-pipe-dropzone-title">Drag and drop PDF or DOCX files here</div>
        <div className="fk-pipe-dropzone-hint">Multiple files supported</div>
        <button
          type="button"
          className="fk-pipe-browse-btn"
          onClick={(e) => {
            e.stopPropagation();
            fileInputRef.current && fileInputRef.current.click();
          }}
        >
          Browse Files
        </button>
      </div>

      {/* Selected Files Queue */}
      {selectedFiles.length > 0 && (
        <div className="fk-pipe-file-queue" aria-label="Selected files queue">
          {selectedFiles.map((f) => (
            <div key={f.id} className="fk-pipe-file-queue-item">
              <div className="fk-pipe-file-chip">
                <FileText size={15} color="var(--fk-olive, #8A875D)" />
                <span className="fk-pipe-file-name" title={f.name}>{f.name}</span>
                <span className="fk-pipe-file-size">{f.sizeFormatted}</span>
                <span className={`fk-pipe-badge-tag ${f.isValid ? (f.status === 'valid' ? 'valid' : '') : 'invalid'}`}>
                  {f.statusLabel}
                </span>
                <button
                  type="button"
                  className="fk-pipe-file-remove"
                  disabled={isUploading}
                  onClick={(e) => { e.stopPropagation(); handleRemoveFile(f.id); }}
                  title={`Remove ${f.name} from selection`}
                  aria-label={`Remove ${f.name}`}
                ><X size={14} /></button>
              </div>
              {f.existingMatches.length > 0 && (
                <label className="fk-pipe-file-match">
                  This name matches a saved local document. Choose what to do:
                  <select
                    value={f.uploadChoice}
                    onChange={(event) => setSelectedFiles((previous) => previous.map((item) =>
                      item.id === f.id ? { ...item, uploadChoice: event.target.value } : item
                    ))}
                    disabled={isUploading}
                  >
                    <option value="">Choose an action</option>
                    <option value="separate">Upload as a separate document</option>
                    {f.existingMatches.map((document) => (
                      <option key={document.stored_name} value={document.stored_name}>
                        Update existing copy ({document.stored_name.slice(0, 8)})
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Upload Footer */}
      <div className="fk-pipe-upload-footer">
        <span className="fk-pipe-upload-notice">
          {selectedFiles.length > 0
            ? `${selectedFiles.filter((file) => file.isValid && file.fileObject).length} valid file(s) selected.`
            : 'Selected files will be saved to the document store.'}
        </span>
        <button
          type="button"
          className="fk-pipe-upload-btn"
          onClick={handleUploadClick}
          disabled={isUploading || !selectedFiles.some((file) => file.isValid && file.fileObject)
            || hasUnresolvedDocumentChoices(selectedFiles)}
        >
          {isUploading ? 'Uploading…' : 'Upload Documents'}
        </button>
      </div>
      {uploadError && <div className="fk-pipe-upload-notice" role="alert">{uploadError}</div>}
    </div>
  );
}

export default DocumentUploadPanel;
