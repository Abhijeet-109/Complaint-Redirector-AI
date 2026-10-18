import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Send, Bot, X, Sparkles, LogIn, UserPlus } from 'lucide-react';
import { chatbotService } from '../../services/chatbotService';
import { useAuth } from '../../context/AuthContext';
import './chatbot.css';

function renderInlineMarkdown(text, keyPrefix) {
  return text.split(/(\*\*[^*\n]+\*\*)/g).map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={`${keyPrefix}-${index}`}>{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}

function renderMessageMarkdown(text) {
  return text.split(/\n{2,}/).map((block, blockIndex) => {
    const lines = block.split('\n');
    const listItems = lines.map((line) => line.match(/^\s*[-*]\s+(.+)$/));

    if (listItems.every(Boolean)) {
      return (
        <ul key={`list-${blockIndex}`}>
          {listItems.map((match, itemIndex) => (
            <li key={`item-${itemIndex}`}>
              {renderInlineMarkdown(match[1], `list-${blockIndex}-${itemIndex}`)}
            </li>
          ))}
        </ul>
      );
    }

    return (
      <p key={`paragraph-${blockIndex}`}>
        {lines.map((line, lineIndex) => (
          <React.Fragment key={`line-${lineIndex}`}>
            {lineIndex > 0 && <br />}
            {renderInlineMarkdown(line, `paragraph-${blockIndex}-${lineIndex}`)}
          </React.Fragment>
        ))}
      </p>
    );
  });
}

export function ChatbotWidget({ isOpen, onToggle, onNavigate }) {
  const { user, isAuthenticated } = useAuth();
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef(null);

  // Initialize or reset messages when authentication state changes
  useEffect(() => {
    if (isAuthenticated) {
      setMessages([
        {
          sender: 'bot',
          text: "Hi! I'm Flatkart's AI Assistant. How can I help you today?",
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
    if (!textToSend || isLoading) return;

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
    setIsLoading(true);

    try {
      // Call document-based RAG endpoint POST /chatbot/ask
      const result = await chatbotService.askQuestion(textToSend);

      setMessages((prev) => [
        ...prev,
        {
          sender: 'bot',
          text: result.answer || 'Information not found in the provided documents.',
        },
      ]);
    } catch (err) {
      const errorMessage = typeof err?.message === 'string' && err.message.trim()
        ? err.message.trim()
        : 'Please check your connection and try again.';
      setMessages((prev) => [
        ...prev,
        {
          sender: 'bot',
          text: `I'm having trouble retrieving answers right now: ${errorMessage}`,
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickQuestion = (question) => {
    handleSendMessage(question);
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
                  <div className="fk-chat-message-content">{renderMessageMarkdown(m.text)}</div>

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
                </div>
              ))}

              {isLoading && (
                <div className="fk-chat-bubble bot" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Sparkles size={16} className="fk-chat-loading-spinner" color="var(--fk-gold)" />
                  <span>Searching Flatkart documents with AI...</span>
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
                  flexWrap: 'wrap',
                  minWidth: 0,
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
                    whiteSpace: 'normal',
                    cursor: 'pointer',
                  }}
                  onClick={() => handleQuickQuestion("What is Flatkart's return and refund policy?")}
                >
                  🔄 Return Policy
                </button>
                <button
                  style={{
                    fontSize: '11.5px',
                    padding: '4px 8px',
                    background: '#FFFFFF',
                    border: '1px solid #D8D4C8',
                    borderRadius: '12px',
                    whiteSpace: 'normal',
                    cursor: 'pointer',
                  }}
                  onClick={() => handleQuickQuestion('What are the shipping and delivery options?')}
                >
                  🚚 Delivery Options
                </button>
                <button
                  style={{
                    fontSize: '11.5px',
                    padding: '4px 8px',
                    background: '#FFFFFF',
                    border: '1px solid #D8D4C8',
                    borderRadius: '12px',
                    whiteSpace: 'normal',
                    cursor: 'pointer',
                  }}
                  onClick={() => handleQuickQuestion('What payment methods are supported?')}
                >
                  💳 Payment Methods
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
                    ? 'Ask a question about Flatkart policies...'
                    : 'Please log in to chat with AI support...'
                }
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                disabled={isLoading}
              />
              <button
                type="submit"
                className="fk-chatbot-send-btn"
                disabled={isLoading || !inputText.trim()}
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
