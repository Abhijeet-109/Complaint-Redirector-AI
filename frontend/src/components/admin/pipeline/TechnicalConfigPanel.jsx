import React, { useEffect, useState } from 'react';
import { documentService } from '../../../services/documentService';

export function TechnicalConfigPanel() {
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    documentService.getPipelineConfig()
      .then((result) => { if (active) { setConfig(result); setError(''); } })
      .catch((requestError) => { if (active) setError(requestError.message || 'Technical configuration is unavailable.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const rows = [
    ['ChromaDB collection', config?.collection_name],
    ['Embedding model', config?.embedding_model],
    ['Chunk size', config?.chunk_size],
    ['Chunk overlap', config?.chunk_overlap],
    ['Persistent storage', config?.persistent_storage],
  ];

  return (
    <div className="fk-pipe-panel">
      <div className="fk-pipe-panel-header"><h2 className="fk-pipe-panel-title">Technical configuration</h2></div>
      {loading ? <p className="fk-pipe-panel-sub" role="status">Loading backend configuration…</p>
        : error ? <p className="fk-pipe-config-error" role="alert">{error}</p>
          : <div className="fk-pipe-tech-list">{rows.map(([label, value]) => (
            <div className="fk-pipe-tech-item" key={label}>
              <span className="fk-pipe-tech-label">{label}</span>
              <span className="fk-pipe-tech-val">{value ?? 'Unavailable'}</span>
            </div>
          ))}</div>}
    </div>
  );
}

export default TechnicalConfigPanel;
