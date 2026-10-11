import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Send, Bot, X, Sparkles, LogIn, UserPlus } from 'lucide-react';
import { complaintService } from '../../services/complaintService';
import { useAuth } from '../../context/AuthContext';

export function ChatbotWidget({ isOpen, onToggle, onNavigate }) {
  const { user, isAuthenticated } = useAuth();
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [isClassifying, setIsClassifying] = useState(false);
  const messagesEndRef = useRef(null);

  // Initialize or reset messages when authentication state changes
  useEffect(() => {
    if (isAuthenticated) {
      setMessages([
        {
          sender: 'bot',
          text: `Hello ${user?.name ? user.name.split(' ')[0] : ''}! I'm Flatkart's AI Support Assistant. Tell me your issue or complaint, and I will instantly analyze and route it to the right department.`,
        },
      ]);
    } else {
      setMessages([
        {
          sender: 'bot',
          text: 'Oops, looks like someone forgot to log in... 👀',
          isGuestPrompt: true,
        },
      ]);
    }
  }, [isAuthenticated, user?.name]);

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  const handleSendMessage = async (customText) => {
    const textToSend = (customText || inputText).trim();
    if (!textToSend || isClassifying) return;

    if (!isAuthenticated) {
      // Guest attempted to send
      setMessages((prev) => [
        ...prev,
        { sender: 'user', text: textToSend },
        {
          sender: 'bot',
          text: 'Oops, looks like someone forgot to log in... 👀',
          isGuestPrompt: true,
        },
      ]);
      setInputText('');
      return;
    }

    // Add user message
    const userMsg = { sender: 'user', text: textToSend };
    setMessages((prev) => [...prev, userMsg]);
    setInputText('');
    setIsClassifying(true);

    try {
      // 1. Call real backend ML classifier
      const prediction = await complaintService.predictDepartment(textToSend);

      let botResponseText = `I've analyzed your complaint. Based on our AI model, this falls under **${prediction.department}** (Confidence: ${(parseFloat(prediction.confidence) * 100).toFixed(1)}%).`;

      // 2. If user is logged in, optionally register real complaint in DB
      let complaintId = null;
      try {
        const compRes = await complaintService.createComplaint(textToSend);
        complaintId = compRes.id;
        botResponseText += `\n\nYour complaint has been logged as Ticket #${complaintId} and routed to the ${prediction.department} team.`;
      } catch {
        botResponseText += `\n\nWould you like me to submit an official ticket to ${prediction.department}?`;
      }

      setMessages((prev) => [
        ...prev,
        {
          sender: 'bot',
          text: botResponseText,
          department: prediction.department,
          confidence: prediction.confidence,
          ticketId: complaintId,
        },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          sender: 'bot',
          text: `We received your request: "${textToSend}". Our support desk is reviewing it. (Note: ${err.message || 'Connecting to classifier'})`,
        },
      ]);
    } finally {
      setIsClassifying(false);
    }
  };

  const handleQuickIssue = (issue) => {
    handleSendMessage(issue);
  };

  const handleAuthNavigation = (page) => {
    if (onToggle) onToggle(); // Close widget
    if (onNavigate) {
      onNavigate(page);
    }
  };

  return (
    <>
      {/* Floating Pebble Widget Button (Screenshot replica) */}
      <div
        className="fk-floating-help-widget"
        onClick={onToggle}
        title="Need help? Click to open assistant"
        role="button"
        tabIndex={0}
        aria-label="Toggle Flatkart AI Help Assistant"
      >
        <div className="fk-help-pebble-card">
          <div className="fk-help-title">Need help?</div>
          <div className="fk-help-desc">
            We're here<br />to assist you.
          </div>
          <div className="fk-help-divider" />
          <div className={`fk-help-circle-toggle ${isOpen ? 'open' : ''}`}>
            <ChevronDown size={20} strokeWidth={2.5} />
          </div>
        </div>
      </div>

      {/* Interactive AI Assistant Modal */}
      {isOpen && (
        <div className="fk-chatbot-modal-backdrop" onClick={onToggle}>
          <div className="fk-chatbot-window" onClick={(e) => e.stopPropagation()}>
            <div className="fk-chatbot-header">
              <div className="fk-chatbot-header-title">
                <Bot size={20} color="var(--fk-gold)" />
                <span>Flatkart AI Support</span>
              </div>
              <button
                className="fk-chatbot-header-close"
                onClick={onToggle}
                aria-label="Close Chatbot"
              >
                <X size={20} />
              </button>
            </div>

            <div className="fk-chatbot-messages">
              {messages.map((m, idx) => (
                <div key={idx} className={`fk-chat-bubble ${m.sender}`}>
                  <div style={{ whiteSpace: 'pre-wrap', lineHeight: '1.4' }}>{m.text}</div>

                  {/* Guest Login/Register prompt actions */}
                  {m.isGuestPrompt && (
                    <div
                      style={{
                        marginTop: '12px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px',
                        paddingTop: '8px',
                        borderTop: '1px solid rgba(0, 0, 0, 0.08)',
                      }}
                    >
                      <button
                        onClick={() => handleAuthNavigation('login')}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px',
                          backgroundColor: 'var(--fk-header)',
                          color: '#FFFFFF',
                          padding: '8px 14px',
                          borderRadius: '6px',
                          fontWeight: '600',
                          fontSize: '13px',
                          cursor: 'pointer',
                          border: 'none',
                          transition: 'opacity 0.2s',
                        }}
                      >
                        <LogIn size={15} /> Log in to continue
                      </button>
                      <button
                        onClick={() => handleAuthNavigation('register')}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px',
                          backgroundColor: 'var(--fk-navigation)',
                          color: 'var(--fk-text-primary)',
                          border: '1px solid #D8D4C8',
                          padding: '7px 14px',
                          borderRadius: '6px',
                          fontWeight: '600',
                          fontSize: '13px',
                          cursor: 'pointer',
                          transition: 'background-color 0.2s',
                        }}
                      >
                        <UserPlus size={15} /> Create a new account
                      </button>
                    </div>
                  )}

                  {m.department && (
                    <div className="fk-chat-badge-prediction">
                      <strong>Assigned Department:</strong> {m.department}
                      <br />
                      <strong>Confidence:</strong> {(parseFloat(m.confidence) * 100).toFixed(1)}%
                    </div>
                  )}
                </div>
              ))}

              {isClassifying && (
                <div className="fk-chat-bubble bot" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Sparkles size={16} className="animate-spin" color="var(--fk-gold)" />
                  <span>Analyzing complaint with AI model...</span>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Quick Inquiry Buttons (only for authenticated users) */}
            {isAuthenticated && (
              <div
                style={{
                  padding: '8px 16px',
                  background: '#F4F1EA',
                  display: 'flex',
                  gap: '6px',
                  overflowX: 'auto',
                  borderTop: '1px solid #EFECE4',
                }}
              >
                <button
                  style={{
                    fontSize: '11.5px',
                    padding: '4px 8px',
                    background: '#FFFFFF',
                    border: '1px solid #D8D4C8',
                    borderRadius: '12px',
                    whiteSpace: 'nowrap',
                    cursor: 'pointer',
                  }}
                  onClick={() => handleQuickIssue('My package delivery is delayed, tracking number not updated')}
                >
                  🚚 Delivery Delay
                </button>
                <button
                  style={{
                    fontSize: '11.5px',
                    padding: '4px 8px',
                    background: '#FFFFFF',
                    border: '1px solid #D8D4C8',
                    borderRadius: '12px',
                    whiteSpace: 'nowrap',
                    cursor: 'pointer',
                  }}
                  onClick={() => handleQuickIssue('Money debited from UPI but order status shows payment failed')}
                >
                  💳 Payment Issue
                </button>
                <button
                  style={{
                    fontSize: '11.5px',
                    padding: '4px 8px',
                    background: '#FFFFFF',
                    border: '1px solid #D8D4C8',
                    borderRadius: '12px',
                    whiteSpace: 'nowrap',
                    cursor: 'pointer',
                  }}
                  onClick={() => handleQuickIssue('Shirt size M is too small, I want to replace with size L')}
                >
                  🔄 Size Replacement
                </button>
              </div>
            )}

            <form
              className="fk-chatbot-input-bar"
              onSubmit={(e) => {
                e.preventDefault();
                handleSendMessage();
              }}
            >
              <input
                type="text"
                className="fk-chatbot-input"
                placeholder={
                  isAuthenticated
                    ? 'Describe your issue or complaint...'
                    : 'Please log in to chat with AI support...'
                }
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                disabled={isClassifying}
              />
              <button
                type="submit"
                className="fk-chatbot-send-btn"
                disabled={isClassifying || !inputText.trim()}
                aria-label="Send Message"
              >
                <Send size={16} />
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

export default ChatbotWidget;
