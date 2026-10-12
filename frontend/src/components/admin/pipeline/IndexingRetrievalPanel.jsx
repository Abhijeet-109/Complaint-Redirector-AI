import React from 'react';

const LIFECYCLE_STEPS = [
  { num: 1, label: 'Uploaded' },
  { num: 2, label: 'Pending Approval' },
  { num: 3, label: 'Approved' },
  { num: 4, label: 'Indexed' },
  { num: 5, label: 'Retrieved' },
  { num: 6, label: 'Answered' },
];

export function IndexingRetrievalPanel({ onShowNotice }) {
  return (
    <div className="fk-pipe-panel">
      <div className="fk-pipe-panel-header">
        <h2 className="fk-pipe-panel-title">Indexing & Retrieval</h2>
        <span className="fk-pipe-panel-sub">Conceptual lifecycle · no live status</span>
      </div>

      {/* Lifecycle Flow Tracker */}
      <div className="fk-pipe-lifecycle-track" aria-label="Conceptual indexing and retrieval lifecycle">
        {LIFECYCLE_STEPS.map((step, idx) => (
          <React.Fragment key={step.num}>
            <div className="fk-pipe-lifecycle-step">
              <span className="fk-pipe-step-num">{step.num}</span>
              <span className="fk-pipe-step-label">{step.label}</span>
            </div>
            {idx < LIFECYCLE_STEPS.length - 1 && (
              <span className="fk-pipe-step-arrow" aria-hidden="true">→</span>
            )}
          </React.Fragment>
        ))}
      </div>

      {/* Action Buttons */}
      <div className="fk-pipe-actions-row">
        <button
          type="button"
          className="fk-pipe-btn-secondary"
          onClick={() => onShowNotice('Live pipeline status integration is pending.')}
        >
          Refresh Pipeline Status
        </button>
        <button
          type="button"
          className="fk-pipe-btn-secondary"
          onClick={() => onShowNotice('Document-indexing integration is pending.')}
        >
          Index Selected
        </button>
        <button
          type="button"
          className="fk-pipe-btn-secondary"
          onClick={() => onShowNotice('Re-indexing integration is pending.')}
        >
          Re-index Selected
        </button>
      </div>
    </div>
  );
}

export default IndexingRetrievalPanel;
