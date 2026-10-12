import React, { useState } from 'react';
import { X, Sparkles, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { complaintService } from '../../services/complaintService';

export function ComplaintForm({ isOpen, onClose, onComplaintSubmitted }) {
  const [complaintText, setComplaintText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    const trimmed = complaintText.trim();
    if (!trimmed) {
      setErrorMessage('Please describe your issue before submitting.');
      return;
    }

    setIsSubmitting(true);
    try {
      // Call backend POST /api/v1/complaints
      await complaintService.createComplaint(trimmed);

      // Requirement: Display the exact success message
      setSuccessMessage('Complaint submitted successfully. Our team will contact you shortly.');

      // Clear input text
      setComplaintText('');

      // Notify parent to refresh complaint list
      if (onComplaintSubmitted) {
        onComplaintSubmitted();
      }

      // Automatically close modal after brief delay or user can close immediately
      setTimeout(() => {
        if (onClose) onClose();
      }, 2000);
    } catch (err) {
      setErrorMessage(
        err.message || 'Failed to submit complaint. Please try again.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleModalClose = () => {
    if (isSubmitting) return;
    setErrorMessage('');
    setSuccessMessage('');
    if (onClose) onClose();
  };

  return (
    <div
      className="fk-complaint-modal-overlay"
      onClick={handleModalClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div
        className="fk-complaint-modal-card"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Left Lifestyle Visual (Matching reference Image 2) */}
        <div className="fk-complaint-modal-visual">
          <img
            src="/assets/complaint_modal_decor.jpg"
            alt="Flatkart Support"
            className="fk-complaint-visual-img"
          />
        </div>

        {/* Right Form Container */}
        <div className="fk-complaint-modal-content">
          {/* Header with Dark Green Background */}
          <div className="fk-complaint-modal-header">
            <h3 id="modal-title" className="fk-complaint-modal-title">
              Submit a new complaint
            </h3>
            <button
              className="fk-complaint-modal-close"
              onClick={handleModalClose}
              disabled={isSubmitting}
              aria-label="Close dialog"
            >
              <X size={20} />
            </button>
          </div>

          {/* Form Body */}
          <form onSubmit={handleSubmit} className="fk-complaint-form" noValidate>
            {/* Success Message Banner */}
            {successMessage && (
              <div className="fk-complaint-alert success" role="alert">
                <CheckCircle2 size={18} />
                <span>{successMessage}</span>
              </div>
            )}

            {/* Error Message Banner */}
            {errorMessage && (
              <div className="fk-complaint-alert error" role="alert">
                <AlertCircle size={18} />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Describe Issue Input Area */}
            <div className="fk-form-field">
              <label htmlFor="complaint-text" className="fk-form-label">
                Describe your issue
              </label>
              <textarea
                id="complaint-text"
                className="fk-complaint-textarea"
                rows={5}
                placeholder="Tell us what happened and how we can help"
                value={complaintText}
                onChange={(e) => setComplaintText(e.target.value)}
                disabled={isSubmitting || !!successMessage}
                required
              />
            </div>

            {/* AI Routing Feature Card (Exact replica from Image 2) */}
            <div className="fk-ai-routing-card">
              <div className="fk-ai-routing-title">
                <Sparkles size={15} color="var(--fk-gold)" />
                <span>AI routing</span>
              </div>
              <p className="fk-ai-routing-desc">
                We use AI to understand your issue and route it to the right team.
                You'll get updates here and via email.
              </p>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              className="fk-complaint-submit-btn"
              disabled={isSubmitting || !!successMessage || !complaintText.trim()}
            >
              {isSubmitting ? (
                <>
                  <Loader2 size={18} className="fk-spin-icon" />
                  <span>Submitting complaint...</span>
                </>
              ) : (
                'Submit complaint'
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default ComplaintForm;
