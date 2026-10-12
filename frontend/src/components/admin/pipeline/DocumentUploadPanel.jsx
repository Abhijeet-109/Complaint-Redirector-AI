import React, { useState, useRef } from 'react';
import { UploadCloud, FileText, X } from 'lucide-react';

const INITIAL_DEMO_FILES = [
  {
    id: 'demo-1',
    name: 'Returns Policy.pdf',
    sizeFormatted: '248 KB',
    status: 'example',
    statusLabel: 'Example - valid type',
    isValid: true,
  },
  {
    id: 'demo-2',
    name: 'Delivery Policy.docx',
    sizeFormatted: '86 KB',
    status: 'example',
    statusLabel: 'Example - valid type',
    isValid: true,
  },
];

function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export function DocumentUploadPanel({ onShowNotice }) {
  const [selectedFiles, setSelectedFiles] = useState(INITIAL_DEMO_FILES);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef(null);

  const processIncomingFiles = (fileList) => {
    if (!fileList || fileList.length === 0) return;

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
    if (e.dataTransfer && e.dataTransfer.files) {
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

  const handleUploadClick = () => {
    if (onShowNotice) {
      onShowNotice('Upload UI is ready. Backend integration will be added in the next phase.');
    }
  };

  return (
    <div className="fk-pipe-panel">
      <div className="fk-pipe-panel-header">
        <h2 className="fk-pipe-panel-title">Document upload</h2>
        <span className="fk-pipe-panel-sub">Local selection preview · API pending</span>
      </div>

      {/* Hidden File Input */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileInputChange}
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
        onClick={() => fileInputRef.current && fileInputRef.current.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            fileInputRef.current && fileInputRef.current.click();
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
            <div key={f.id} className="fk-pipe-file-chip">
              <FileText size={15} color="var(--fk-olive, #8A875D)" />
              <span className="fk-pipe-file-name" title={f.name}>
                {f.name}
              </span>
              <span className="fk-pipe-file-size">{f.sizeFormatted}</span>
              <span
                className={`fk-pipe-badge-tag ${
                  f.isValid ? (f.status === 'valid' ? 'valid' : '') : 'invalid'
                }`}
              >
                {f.statusLabel}
              </span>
              <button
                type="button"
                className="fk-pipe-file-remove"
                onClick={(e) => {
                  e.stopPropagation();
                  handleRemoveFile(f.id);
                }}
                title={`Remove ${f.name} from selection`}
                aria-label={`Remove ${f.name}`}
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Upload Footer */}
      <div className="fk-pipe-upload-footer">
        <span className="fk-pipe-upload-notice">
          {selectedFiles.length > 0
            ? `Files are not sent or saved in this reference (${selectedFiles.length} selected).`
            : 'Files are not sent or saved in this reference.'}
        </span>
        <button
          type="button"
          className="fk-pipe-upload-btn"
          onClick={handleUploadClick}
          disabled={selectedFiles.length === 0}
        >
          Upload Documents
        </button>
      </div>
    </div>
  );
}

export default DocumentUploadPanel;
