import React from 'react';
import { Upload, Cloud } from 'lucide-react';

export function SourceConnectionsPanel() {
  return (
    <div className="fk-pipe-panel">
      <div className="fk-pipe-panel-header">
        <h2 className="fk-pipe-panel-title">Source Connections</h2>
      </div>

      <div className="fk-pipe-sources-list">
        {/* Local Upload */}
        <div className="fk-pipe-source-card">
          <div className="fk-pipe-source-left">
            <div className="fk-pipe-source-icon">
              <Upload size={17} />
            </div>
            <div>
              <div className="fk-pipe-source-title">Local Upload</div>
              <div className="fk-pipe-source-sub">Direct file ingestion for PDF/DOCX</div>
            </div>
          </div>
          <span className="fk-pipe-badge-available">Available</span>
        </div>

        {/* Google Drive */}
        <div className="fk-pipe-source-card">
          <div className="fk-pipe-source-left">
            <div className="fk-pipe-source-icon">
              <Cloud size={17} />
            </div>
            <div>
              <div className="fk-pipe-source-title">Google Drive</div>
              <div className="fk-pipe-source-sub">Not connected in this phase</div>
            </div>
          </div>
          <span className="fk-pipe-badge-pending">Coming later · Not connected</span>
        </div>
      </div>

      <div className="fk-pipe-sources-footnote">
          Local PDF/DOCX uploads are active. Google Drive is not connected.
      </div>
    </div>
  );
}

export default SourceConnectionsPanel;
