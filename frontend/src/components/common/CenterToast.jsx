import React, { useEffect, useRef } from 'react';
import { CheckCircle, AlertTriangle, X } from 'lucide-react';
import './CenterToast.css';

export function CenterToast({ visible, message, type = 'success', onDismiss }) {
  const timerRef = useRef(null);

  useEffect(() => {
    if (!visible) return;
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => { onDismiss?.(); }, 3200);
    return () => clearTimeout(timerRef.current);
  }, [visible, message, onDismiss]);

  if (!visible || !message) return null;

  const isWarning = type === 'warning';

  return (
    <div className="fk-center-toast-wrap">
      <div
        className="fk-center-toast"
        role={isWarning ? 'alert' : 'status'}
        aria-live={isWarning ? 'assertive' : 'polite'}
      >
        <span className={`fk-center-toast-icon${isWarning ? ' fk-center-toast-icon--warning' : ''}`}>
          {isWarning ? <AlertTriangle size={18} /> : <CheckCircle size={18} />}
        </span>
        <span className="fk-center-toast-text">{message}</span>
        <button
          type="button"
          className="fk-center-toast-close"
          aria-label="Dismiss notification"
          onClick={() => { clearTimeout(timerRef.current); onDismiss?.(); }}
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}

export default CenterToast;
