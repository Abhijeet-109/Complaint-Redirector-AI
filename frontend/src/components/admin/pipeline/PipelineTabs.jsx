import React from 'react';
import { Layers, LayoutList } from 'lucide-react';

export const PIPELINE_TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'documents', label: 'Knowledge Documents' },
  { id: 'indexing', label: 'Indexing & Retrieval' },
  { id: 'performance', label: 'Chatbot Performance' },
];

export function PipelineTabs({
  activeTab,
  onSelectTab,
  viewMode = 'tabs',
  onToggleViewMode,
}) {
  return (
    <div className="fk-pipe-tabs-bar">
      <div className="fk-pipe-tabs-list" role="tablist" aria-label="Pipeline console navigation">
        {PIPELINE_TABS.map((tab) => {
          const isActive = viewMode === 'tabs' && activeTab === tab.id;
          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={isActive}
              className={`fk-pipe-tab-btn ${isActive ? 'active' : ''}`}
              onClick={() => {
                if (viewMode === 'all') {
                  onToggleViewMode('tabs');
                }
                onSelectTab(tab.id);
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <button
          type="button"
          className={`fk-pipe-viewmode-btn ${viewMode === 'all' ? 'active' : ''}`}
          onClick={() => onToggleViewMode(viewMode === 'all' ? 'tabs' : 'all')}
          title="Toggle composite view matching the design reference"
        >
          {viewMode === 'all' ? <LayoutList size={14} /> : <Layers size={14} />}
          <span>{viewMode === 'all' ? 'Show Tabbed' : 'View All Sections'}</span>
        </button>
      </div>
    </div>
  );
}

export default PipelineTabs;
