import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  MessageSquare,
  Plus,
  Search,
  Bot,
  Trash2,
  Download,
  MoreVertical,
  Paperclip,
  Mic,
  Send,
  ShoppingBag,
  Package,
  Truck,
  RotateCcw,
  ShoppingCart,
  HelpCircle,
  AlertCircle,
  Loader2,
  X,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { Header } from '../components/layout/Header';
import { CategoryNav } from '../components/layout/CategoryNav';
import { AccountSidebar } from '../components/account/AccountSidebar';
import { CartDrawer } from '../components/common/CartDrawer';
import { WishlistDrawer } from '../components/common/WishlistDrawer';
import { OrdersModal } from '../components/common/OrdersModal';

import { chatbotService } from '../services/chatbotService';
import { useAuth } from '../context/AuthContext';
import './MyConversations.css';

// Quick action pill definitions matching screenshot
const QUICK_ACTIONS = [
  { id: 'products', label: 'Find products', icon: ShoppingBag, prompt: 'Show me popular and trending products' },
  { id: 'orders', label: 'Check my orders', icon: Package, prompt: 'Show me all my recent orders' },
  { id: 'shipping', label: 'Track shipping', icon: Truck, prompt: 'Track shipping for my latest order' },
  { id: 'returns', label: 'Returns & refunds', icon: RotateCcw, prompt: 'What is your return and refund policy?' },
  { id: 'cart', label: 'Manage my cart', icon: ShoppingCart, prompt: 'Show items currently in my shopping cart' },
  { id: 'support', label: 'Get support', icon: HelpCircle, prompt: 'I need customer support with an order' },
];

function formatConversationDate(dateStr) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

export function MyConversations({ onNavigate }) {
  const { user, isAuthenticated, loading: authLoading } = useAuth();

  // State: Conversations list
  const [conversations, setConversations] = useState([]);
  const [activeThreadId, setActiveThreadId] = useState(null);
  const [isLoadingConversations, setIsLoadingConversations] = useState(true);
  const [conversationsError, setConversationsError] = useState('');

  // State: Active conversation messages
  const [messages, setMessages] = useState([]);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [messageError, setMessageError] = useState('');

  // State: Input & sending
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [lastFailedRequest, setLastFailedRequest] = useState(null); // { question, requestId, threadId }
  const [isListening, setIsListening] = useState(false);

  // State: Search filter
  const [searchQuery, setSearchQuery] = useState('');

  // State: UI menus & modals
  const [isOptionsMenuOpen, setIsOptionsMenuOpen] = useState(false);
  const [isOrdersOpen, setIsOrdersOpen] = useState(false);

  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const menuRef = useRef(null);
  const fileInputRef = useRef(null);

  // Auth protection
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      if (onNavigate) onNavigate('login');
    }
  }, [authLoading, isAuthenticated, onNavigate]);

  // Click outside options menu
  useEffect(() => {
    function handleClickOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setIsOptionsMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Auto-scroll messages to bottom
  const scrollToBottom = (smooth = true) => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' });
    }
  };

  useEffect(() => {
    scrollToBottom(true);
  }, [messages, isSending]);

  // 1. Load user's conversations
  const loadConversations = async (autoSelectThreadId = null) => {
    if (!isAuthenticated) return;
    setIsLoadingConversations(true);
    setConversationsError('');
    try {
      const res = await chatbotService.getConversations();
      const list = Array.isArray(res?.conversations) ? res.conversations : [];
      setConversations(list);

      if (autoSelectThreadId) {
        setActiveThreadId(autoSelectThreadId);
      } else if (list.length > 0 && !activeThreadId) {
        // Automatically select the most recent conversation
        setActiveThreadId(list[0].thread_id);
      }
    } catch (err) {
      setConversationsError(err.message || 'Failed to load conversations');
    } finally {
      setIsLoadingConversations(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      loadConversations();
    }
  }, [isAuthenticated]);

  // 2. Load messages when activeThreadId changes
  useEffect(() => {
    if (!activeThreadId) {
      setMessages([]);
      return;
    }

    let isSubscribed = true;
    const fetchMessages = async () => {
      setIsLoadingMessages(true);
      setMessageError('');
      try {
        const data = await chatbotService.getConversation(activeThreadId);
        if (isSubscribed) {
          const loadedMessages = Array.isArray(data?.messages) ? data.messages : [];
          setMessages(loadedMessages);
        }
      } catch (err) {
        if (isSubscribed) {
          setMessageError(err.message || 'Failed to load message history.');
        }
      } finally {
        if (isSubscribed) {
          setIsLoadingMessages(false);
        }
      }
    };

    fetchMessages();

    return () => {
      isSubscribed = false;
    };
  }, [activeThreadId]);

  // 3. Start a new conversation
  const handleNewConversation = () => {
    setActiveThreadId(null);
    setMessages([]);
    setMessageError('');
    setInputText('');
    setLastFailedRequest(null);
    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  // 4. Send Message (with requestId tracking for idempotent retry)
  const handleSendMessage = async (textToSend = null, retryPayload = null) => {
    const question = (textToSend !== null ? textToSend : inputText).trim();
    if (!question || isSending) return;

    const requestId = retryPayload?.requestId || crypto.randomUUID();
    const threadIdToUse = retryPayload?.threadId || activeThreadId || undefined;

    // Optimistically add human message
    const userMsg = {
      role: 'user',
      content: question,
      timestamp: new Date().toISOString(),
    };

    if (!retryPayload) {
      setMessages((prev) => [...prev, userMsg]);
      setInputText('');
    }

    setIsSending(true);
    setMessageError('');
    setLastFailedRequest(null);

    try {
      const response = await chatbotService.askQuestion(question, {
        threadId: threadIdToUse,
        requestId,
      });

      const returnedThreadId = response?.thread_id || threadIdToUse;

      const assistantMsg = {
        role: 'assistant',
        content: response?.answer || 'Thank you. How else may I assist you today?',
        sources: Array.isArray(response?.sources) ? response.sources : [],
        timestamp: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, assistantMsg]);

      // If this was a new conversation, update activeThreadId and reload list
      if (!activeThreadId || activeThreadId !== returnedThreadId) {
        setActiveThreadId(returnedThreadId);
      }

      // Refresh list to update updated_at and titles
      await loadConversations(returnedThreadId);
    } catch (err) {
      setMessageError(err.message || 'Failed to send message. Please try again.');
      setLastFailedRequest({
        question,
        requestId,
        threadId: threadIdToUse,
      });
    } finally {
      setIsSending(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  };

  const handleRetry = () => {
    if (lastFailedRequest) {
      handleSendMessage(lastFailedRequest.question, lastFailedRequest);
    }
  };

  // 5. Delete conversation
  const handleDeleteConversation = async () => {
    if (!activeThreadId) return;
    const confirmDelete = window.confirm('Are you sure you want to delete this conversation?');
    if (!confirmDelete) return;

    try {
      await chatbotService.deleteConversation(activeThreadId);
      const remaining = conversations.filter((c) => c.thread_id !== activeThreadId);
      setConversations(remaining);

      if (remaining.length > 0) {
        setActiveThreadId(remaining[0].thread_id);
      } else {
        handleNewConversation();
      }
    } catch (err) {
      alert(`Could not delete conversation: ${err.message}`);
    } finally {
      setIsOptionsMenuOpen(false);
    }
  };

  // 6. Download conversation transcript
  const handleDownloadTranscript = () => {
    if (!messages.length) {
      alert('There are no messages in this conversation to download.');
      return;
    }

    const currentConv = conversations.find((c) => c.thread_id === activeThreadId);
    const title = currentConv?.title || 'Flatkart Assistant Conversation';

    let content = `====================================================\n`;
    content += `FLATKART AI ASSISTANT - CONVERSATION TRANSCRIPT\n`;
    content += `Title: ${title}\n`;
    content += `Date: ${new Date().toLocaleString()}\n`;
    content += `Thread ID: ${activeThreadId || 'N/A'}\n`;
    content += `====================================================\n\n`;

    messages.forEach((msg, idx) => {
      const sender = msg.role === 'assistant' ? 'Flatkart Assistant' : (user?.name || 'Customer');
      content += `[${sender}]:\n${msg.content}\n\n`;
      if (msg.sources && msg.sources.length > 0) {
        content += `Sources: ${msg.sources.map((s) => s.document || s).join(', ')}\n\n`;
      }
    });

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `flatkart-chat-${(activeThreadId || 'new').slice(0, 8)}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setIsOptionsMenuOpen(false);
  };

  // Voice input toggle (Web Speech API)
  const handleVoiceInput = () => {
    if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
      alert('Speech recognition is not supported in this browser.');
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.lang = 'en-IN';
    recognition.interimResults = false;

    if (isListening) {
      setIsListening(false);
      return;
    }

    recognition.onstart = () => setIsListening(true);
    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      setInputText((prev) => (prev ? `${prev} ${transcript}` : transcript));
      setIsListening(false);
    };
    recognition.onerror = () => setIsListening(false);
    recognition.onend = () => setIsListening(false);

    recognition.start();
  };

  // Filter conversations by search term
  const filteredConversations = useMemo(() => {
    if (!searchQuery.trim()) return conversations;
    const q = searchQuery.toLowerCase();
    return conversations.filter((c) =>
      (c.title && c.title.toLowerCase().includes(q))
    );
  }, [conversations, searchQuery]);

  // Current active conversation title
  const activeConversation = useMemo(() => {
    return conversations.find((c) => c.thread_id === activeThreadId);
  }, [conversations, activeThreadId]);

  return (
    <div className="fk-conversations-page">
      {/* Top Main Navigation Header */}
      <Header
        onNavigate={onNavigate}
        onOpenOrders={() => setIsOrdersOpen(true)}
      />

      {/* Secondary Category Navigation Bar */}
      <CategoryNav
        activeCategory="Home"
        onSelectCategory={(cat) => {
          if (cat.toLowerCase() === 'home' && onNavigate) onNavigate('home');
        }}
      />

      {/* Main Grid: Sidebar + Conversations Content */}
      <div className="fk-conversations-container">
        {/* Left Sidebar matching reference (showDecor={false} as in screenshot) */}
        <AccountSidebar
          activeItem="conversations"
          onNavigate={onNavigate}
          onOpenOrders={() => setIsOrdersOpen(true)}
          showDecor={false}
        />

        {/* Right Main Content */}
        <main className="fk-conversations-main">
          {/* Breadcrumb Navigation matching screenshot */}
          <nav className="fk-breadcrumb-nav" aria-label="Breadcrumb">
            <span
              className="fk-breadcrumb-link"
              onClick={() => onNavigate && onNavigate('home')}
            >
              Home
            </span>
            <span className="fk-breadcrumb-sep">&gt;</span>
            <span
              className="fk-breadcrumb-link"
              onClick={() => onNavigate && onNavigate('my-complaints')}
            >
              My Account
            </span>
            <span className="fk-breadcrumb-sep">&gt;</span>
            <span className="fk-breadcrumb-current">My Conversations</span>
          </nav>

          {/* Heading and Subtitle */}
          <div className="fk-conversations-header">
            <h1 className="fk-conversations-title">My Conversations</h1>
            <p className="fk-conversations-subtitle">
              Chat with Flatkart AI for products, orders, returns, shipping and more.
            </p>
          </div>

          {/* Two Panels Layout */}
          <div className="fk-conversations-panels">
            {/* ---------------------------------------------------- */}
            {/* LEFT PANEL: Conversation History & Search */}
            {/* ---------------------------------------------------- */}
            <section className="fk-conv-left-panel" aria-label="Conversation history">
              {/* "+ New Conversation" Button */}
              <button
                className="fk-new-conv-btn"
                onClick={handleNewConversation}
                aria-label="Start new conversation"
              >
                <Plus size={18} strokeWidth={2.4} />
                <span>New Conversation</span>
              </button>

              {/* Search Conversations Input */}
              <div className="fk-conv-search-box">
                <div className="fk-conv-search-icon">
                  <Search size={16} strokeWidth={2.2} />
                </div>
                <input
                  type="text"
                  className="fk-conv-search-input"
                  placeholder="Search conversations"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  aria-label="Search conversations"
                />
                {searchQuery && (
                  <button
                    className="fk-conv-search-clear"
                    onClick={() => setSearchQuery('')}
                    title="Clear search"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              {/* Conversations List */}
              <div className="fk-conv-list" role="list">
                {isLoadingConversations ? (
                  <div className="fk-conv-list-empty">
                    <Loader2 size={20} className="fk-spin" />
                    <span>Loading conversations…</span>
                  </div>
                ) : filteredConversations.length === 0 ? (
                  <div className="fk-conv-list-empty">
                    <MessageSquare size={24} strokeWidth={1.5} />
                    <span>
                      {searchQuery
                        ? 'No conversations found'
                        : 'No conversations yet.\nClick "+ New Conversation" to chat.'}
                    </span>
                  </div>
                ) : (
                  filteredConversations.map((conv) => {
                    const isSelected = conv.thread_id === activeThreadId;
                    const dateDisplay = formatConversationDate(conv.updated_at || conv.created_at);

                    return (
                      <button
                        key={conv.thread_id}
                        className={`fk-conv-item ${isSelected ? 'active' : ''}`}
                        onClick={() => {
                          setActiveThreadId(conv.thread_id);
                          setLastFailedRequest(null);
                        }}
                        aria-selected={isSelected}
                      >
                        <div className="fk-conv-item-icon">
                          <MessageSquare size={17} strokeWidth={isSelected ? 2.2 : 1.8} />
                        </div>
                        <div className="fk-conv-item-content">
                          <div className="fk-conv-item-header">
                            <span className="fk-conv-item-title" title={conv.title}>
                              {conv.title || 'New chat'}
                            </span>
                            {dateDisplay && (
                              <span className="fk-conv-item-date">{dateDisplay}</span>
                            )}
                          </div>
                          <span className="fk-conv-item-preview">
                            {conv.title || 'Start conversation...'}
                          </span>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </section>

            {/* ---------------------------------------------------- */}
            {/* RIGHT PANEL: Chat Interface */}
            {/* ---------------------------------------------------- */}
            <section className="fk-conv-right-panel" aria-label="Chat window">
              {/* Header Bar */}
              <div className="fk-chat-header">
                <div className="fk-chat-header-info">
                  <div className="fk-chat-avatar-small">
                    <Bot size={22} strokeWidth={2} />
                  </div>
                  <div className="fk-chat-header-titles">
                    <div className="fk-chat-header-title-row">
                      <span className="fk-chat-header-name">Flatkart Assistant</span>
                      <span className="fk-chat-ai-badge">AI</span>
                    </div>
                    <span className="fk-chat-header-desc">
                      Your AI shopping and support assistant
                    </span>
                  </div>
                </div>

                <div className="fk-chat-header-actions" ref={menuRef}>
                  <button
                    className="fk-chat-action-btn delete-btn"
                    onClick={handleDeleteConversation}
                    disabled={!activeThreadId}
                    title="Delete conversation"
                    aria-label="Delete conversation"
                  >
                    <Trash2 size={17} strokeWidth={1.8} />
                  </button>

                  <button
                    className="fk-chat-action-btn"
                    onClick={handleDownloadTranscript}
                    disabled={!messages.length}
                    title="Download conversation transcript"
                    aria-label="Download conversation transcript"
                  >
                    <Download size={17} strokeWidth={1.8} />
                  </button>

                  <button
                    className="fk-chat-action-btn"
                    onClick={() => setIsOptionsMenuOpen((prev) => !prev)}
                    title="More actions"
                    aria-label="More actions"
                  >
                    <MoreVertical size={17} strokeWidth={1.8} />
                  </button>

                  {isOptionsMenuOpen && (
                    <div className="fk-chat-menu-dropdown">
                      <button
                        className="fk-chat-menu-item"
                        onClick={() => {
                          setIsOptionsMenuOpen(false);
                          handleNewConversation();
                        }}
                      >
                        <Plus size={14} /> New Conversation
                      </button>
                      <button
                        className="fk-chat-menu-item"
                        onClick={handleDownloadTranscript}
                        disabled={!messages.length}
                      >
                        <Download size={14} /> Export Transcript
                      </button>
                      {activeThreadId && (
                        <button
                          className="fk-chat-menu-item"
                          style={{ color: '#D32F2F' }}
                          onClick={handleDeleteConversation}
                        >
                          <Trash2 size={14} /> Delete Conversation
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Chat Body: Welcome Screen (when empty) vs Messages List */}
              <div className="fk-chat-body">
                {isLoadingMessages ? (
                  <div className="fk-chat-welcome-container">
                    <Loader2 size={32} className="fk-spin" style={{ color: '#758552' }} />
                    <span style={{ marginTop: '12px', color: '#70797B', fontSize: '13px' }}>
                      Loading conversation messages…
                    </span>
                  </div>
                ) : messages.length === 0 ? (
                  /* Welcome Screen matching exact reference screenshot */
                  <div className="fk-chat-welcome-container">
                    <div className="fk-chat-welcome-avatar">
                      <Bot size={34} strokeWidth={2} />
                    </div>

                    <h2 className="fk-chat-welcome-title">How can I help you today?</h2>
                    <p className="fk-chat-welcome-subtitle">
                      Ask about products, orders, cart, shipping, returns or general support.
                    </p>

                    {/* Quick action suggestion buttons grid */}
                    <div className="fk-quick-actions-grid">
                      {QUICK_ACTIONS.map((item) => {
                        const Icon = item.icon;
                        return (
                          <button
                            key={item.id}
                            className="fk-quick-action-pill"
                            onClick={() => handleSendMessage(item.prompt)}
                            disabled={isSending}
                          >
                            <Icon size={16} strokeWidth={1.9} />
                            <span>{item.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  /* Messages History */
                  <div className="fk-chat-messages-container">
                    {messages.map((msg, index) => {
                      const isUser = msg.role === 'user';

                      return (
                        <div
                          key={index}
                          className={`fk-chat-msg-row ${isUser ? 'user' : 'assistant'}`}
                        >
                          {!isUser && (
                            <div className="fk-chat-avatar-small" style={{ width: 30, height: 30 }}>
                              <Bot size={16} strokeWidth={2} />
                            </div>
                          )}

                          <div className={isUser ? 'fk-chat-user-bubble' : 'fk-chat-assistant-bubble'}>
                            {isUser ? (
                              <span>{msg.content}</span>
                            ) : (
                              <>
                                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                  {msg.content}
                                </ReactMarkdown>

                                {Array.isArray(msg.sources) && msg.sources.length > 0 && (
                                  <div className="fk-chat-sources">
                                    <span className="fk-chat-sources-label">Sources:</span>
                                    {msg.sources.map((src, sIdx) => {
                                      const label = typeof src === 'string' ? src : (src.document || 'Document');
                                      return (
                                        <span key={sIdx} className="fk-chat-source-tag">
                                          {label}
                                        </span>
                                      );
                                    })}
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}

                    {/* In-flight typing indicator */}
                    {isSending && (
                      <div className="fk-chat-msg-row assistant">
                        <div className="fk-chat-avatar-small" style={{ width: 30, height: 30 }}>
                          <Bot size={16} strokeWidth={2} />
                        </div>
                        <div className="fk-chat-typing-bubble">
                          <span className="fk-chat-typing-dot" />
                          <span className="fk-chat-typing-dot" />
                          <span className="fk-chat-typing-dot" />
                        </div>
                      </div>
                    )}

                    {/* Message Error State with Retry Button */}
                    {messageError && (
                      <div className="fk-chat-msg-error">
                        <AlertCircle size={16} />
                        <span>{messageError}</span>
                        {lastFailedRequest && (
                          <button className="fk-chat-retry-btn" onClick={handleRetry}>
                            Retry
                          </button>
                        )}
                      </div>
                    )}

                    <div ref={messagesEndRef} />
                  </div>
                )}
              </div>

              {/* Bottom Input Area matching reference screenshot */}
              <div className="fk-chat-input-area">
                <form
                  className="fk-chat-input-pill"
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSendMessage();
                  }}
                >
                  <input
                    type="file"
                    ref={fileInputRef}
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        setInputText((prev) =>
                          prev
                            ? `${prev} [Attachment: ${e.target.files[0].name}]`
                            : `[Attachment: ${e.target.files[0].name}]`
                        );
                      }
                    }}
                  />

                  {/* Attachment Icon */}
                  <button
                    type="button"
                    className="fk-chat-attach-btn"
                    onClick={() => fileInputRef.current?.click()}
                    title="Attach file"
                    aria-label="Attach file"
                  >
                    <Paperclip size={18} strokeWidth={2} />
                  </button>

                  {/* Input field */}
                  <input
                    ref={inputRef}
                    type="text"
                    className="fk-chat-text-input"
                    placeholder="Ask something..."
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    disabled={isSending}
                    aria-label="Ask Flatkart Assistant"
                  />

                  {/* Microphone icon */}
                  <button
                    type="button"
                    className={`fk-chat-mic-btn ${isListening ? 'listening' : ''}`}
                    onClick={handleVoiceInput}
                    title={isListening ? 'Listening… click to stop' : 'Use voice input'}
                    aria-label="Voice input"
                  >
                    <Mic size={18} strokeWidth={2} />
                  </button>

                  {/* Send Button */}
                  <button
                    type="submit"
                    className="fk-chat-send-btn"
                    disabled={!inputText.trim() || isSending}
                    title="Send message"
                    aria-label="Send message"
                  >
                    <Send size={15} strokeWidth={2.4} />
                  </button>
                </form>
              </div>
            </section>
          </div>
        </main>
      </div>

      {/* Global Modals & Drawers for header actions */}
      <CartDrawer onNavigate={onNavigate} />
      <WishlistDrawer onNavigate={onNavigate} />
      <OrdersModal isOpen={isOrdersOpen} onClose={() => setIsOrdersOpen(false)} />
    </div>
  );
}

export default MyConversations;

