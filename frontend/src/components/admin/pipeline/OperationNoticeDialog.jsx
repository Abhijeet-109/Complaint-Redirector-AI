import React, { useEffect, useRef } from 'react';
import { AlertCircle, CheckCircle, Info } from 'lucide-react';

const NOTICE_DETAILS = {
  success: { title: 'Operation complete', Icon: CheckCircle },
  warning: { title: 'Please review', Icon: AlertCircle },
  error: { title: 'Operation failed', Icon: AlertCircle },
  info: { title: 'Notice', Icon: Info },
};

export function OperationNoticeDialog({ notice, onClose }) {
  const okButtonRef = useRef(null);

  useEffect(() => {
    if (notice) okButtonRef.current?.focus();
  }, [notice]);

  if (!notice) return null;

  const { title, Icon } = NOTICE_DETAILS[notice.type] || NOTICE_DETAILS.info;

  return (
    <div className="ad-modal-backdrop fk-pipe-notice-backdrop">
      <section
        className="ad-modal fk-pipe-notice-dialog"
        role={notice.type === 'error' ? 'alertdialog' : 'dialog'}
        aria-modal="true"
        aria-labelledby="fk-pipe-notice-title"
        aria-describedby="fk-pipe-notice-message"
      >
        <div className="ad-modal-header">
          <h2 className="ad-modal-title fk-pipe-notice-title" id="fk-pipe-notice-title">
            <Icon size={19} aria-hidden="true" />
            {title}
          </h2>
        </div>
        <div className="ad-modal-body">
          <p className="fk-pipe-notice-message" id="fk-pipe-notice-message" aria-live={notice.type === 'error' ? 'assertive' : 'polite'}>
            {notice.message}
          </p>
        </div>
        <div className="ad-modal-footer fk-pipe-notice-footer">
          <button ref={okButtonRef} type="button" className="ad-btn-primary" onClick={onClose}>
            OK
          </button>
        </div>
      </section>
    </div>
  );
}

export default OperationNoticeDialog;
