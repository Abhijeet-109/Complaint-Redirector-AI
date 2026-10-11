import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Send, Bot, X, Sparkles, AlertCircle, CheckCircle } from 'lucide-react';
import { complaintService } from '../../services/complaintService';
import { useAuth } from '../../context/AuthContext';

export function ChatbotWidget({ isOpen, onToggle }) {
  const { user, isAuthenticated } = useAuth();
  const [messages, setMessages] = useState([
    {
      sender: 'bot',
      text: "Hello! I'm Flatkart's AI Support Assistant. Tell me your issue or complaint, and I will instantly analyze and route it to the right department.",
    },
  ]);
  const [inputText, setInputText] = useState('');
  const [isClassifying, setIsClassifying] = useState(false);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  const handleSendMessage = async (customText) => {
    const textToSend = (customText || inputText).trim();
    if (!textToSend || isClassifying) return;

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
      if (isAuthenticated) {
        try {
          const compRes = await complaintService.createComplaint(textToSend);
          complaintId = compRes.id;
          botResponseText += `\n\nYour complaint has been logged as Ticket #${complaintId} and routed to the ${prediction.department} team.`;
        } catch {
          // If creation requires specific role or auth issue
          botResponseText += `\n\nWould you like me to submit an official ticket to ${prediction.department}?`;
        }
      } else {
        botResponseText += `\n\nTip: Sign in with your Flatkart account to automatically track this ticket in 'My Orders'.`;
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

  return (
    <>
      {/* Floating Pebble Widget Button (Screenshot replica) */}
      <div
        className="fk-floating-help-widget"
        onClick={onToggle}
        title="Need help? Click to open assistant"
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
              <button className="fk-chatbot-header-close" onClick={onToggle}>
                <X size={20} />
              </button>
            </div>

            <div className="fk-chatbot-messages">
              {messages.map((m, idx) => (
                <div key={idx} className={`fk-chat-bubble ${m.sender}`}>
                  <div>{m.text}</div>
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

            {/* Quick Inquiry Buttons */}
            <div style={{ padding: '8px 16px', background: '#F4F1EA', display: 'flex', gap: '6px', overflowX: 'auto', borderTop: '1px solid #EFECE4' }}>
              <button
                style={{ fontSize: '11.5px', padding: '4px 8px', background: '#FFFFFF', border: '1px solid #D8D4C8', borderRadius: '12px', whiteSpace: 'nowrap', cursor: 'pointer' }}
                onClick={() => handleQuickIssue("My package delivery is delayed, tracking number not updated")}
              >
                🚚 Delivery Delay
              </button>
              <button
                style={{ fontSize: '11.5px', padding: '4px 8px', background: '#FFFFFF', border: '1px solid #D8D4C8', borderRadius: '12px', whiteSpace: 'nowrap', cursor: 'pointer' }}
                onClick={() => handleQuickIssue("Money debited from UPI but order status shows payment failed")}
              >
                💳 Payment Issue
              </button>
              <button
                style={{ fontSize: '11.5px', padding: '4px 8px', background: '#FFFFFF', border: '1px solid #D8D4C8', borderRadius: '12px', whiteSpace: 'nowrap', cursor: 'pointer' }}
                onClick={() => handleQuickIssue("Shirt size M is too small, I want to replace with size L")}
              >
                🔄 Size Replacement
              </button>
            </div>

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
                placeholder="Describe your issue or complaint..."
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                disabled={isClassifying}
              />
              <button
                type="submit"
                className="fk-chatbot-send-btn"
                disabled={isClassifying || !inputText.trim()}
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
