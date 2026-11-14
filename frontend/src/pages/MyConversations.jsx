import React, { useState, useEffect, useMemo, useRef, lazy, Suspense } from 'react';
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
  CheckCircle,
  AlertTriangle,
  Info,
} from 'lucide-react';

import { AccountLayout } from '../components/account/AccountLayout';
import { CartDrawer } from '../components/common/CartDrawer';
import { WishlistDrawer } from '../components/common/WishlistDrawer';
import { ChatbotWidget } from '../components/chatbot/ChatbotWidget';
import { isValidStructuredResponse } from '../components/chatbot/agentResponsePresentation';

const AssistantMessageContent = lazy(() => import('../components/chatbot/AssistantMessageContent'));

import { chatbotService } from '../services/chatbotService';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import './MyConversations.css';

// Quick action suggestions matching reference UI
const QUICK_ACTIONS = [
  { id: 'products', label: 'Find products', icon: ShoppingBag, prompt: 'Show me popular and trending products' },
  { id: 'orders', label: 'Check my orders', icon: Package, prompt: 'Show me all my recent orders' },
  { id: 'shipping', label: 'Track shipping', icon: Truck, prompt: 'Track shipping for my latest order' },
  { id: 'returns', label: 'Returns & refunds', icon: RotateCcw, prompt: 'What is your return and refund policy?' },
  { id: 'cart', label: 'Manage my cart', icon: ShoppingCart, prompt: 'Show items currently in my shopping cart' },
  { id: 'support', label: 'Get support', icon: HelpCircle, prompt: 'I need customer support with an order' },
];

/**
 * Format conversation timestamp dynamically based on database created_at / updated_at.
 */
function formatConversationDate(dateStr) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();

    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const isYesterday = d.toDateString() === yesterday.toDateString();

    if (isToday) {
      return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    }
    if (isYesterday) {
      return 'Yesterday';
    }
    if (d.getFullYear() === now.getFullYear()) {
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
  } catch {
    return '';
  }
}

export function MyConversations({ onNavigate }) {
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const { setIsWishlistOpen } = useCart();

  // Conversations list & active selection
  const [conversations, setConversations] = useState([]);
  const [activeThreadId, setActiveThreadId] = useState(null);
  const [isLoadingConversations, setIsLoadingConversations] = useState(true);
  const [conversationsError, setConversationsError] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  // Active conversation messages
  const [messages, setMessages] = useState([]);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [messageError, setMessageError] = useState('');

  // Input & sending state
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [lastFailedRequest, setLastFailedRequest] = useState(null);
  const [isListening, setIsListening] = useState(false);
  const [returnIntakeContext, setReturnIntakeContext] = useState(null);
  const [returnIntake, setReturnIntake] = useState(null);
  const [returnDescriptionDraft, setReturnDescriptionDraft] = useState('');
  const [evidenceAttachments, setEvidenceAttachments] = useState([]);
  const evidenceObjectUrlsRef = useRef([]);
  const [evidenceUploadState, setEvidenceUploadState] = useState({ busy: false, message: '', error: false });

  useEffect(() => () => {
    evidenceObjectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    evidenceObjectUrlsRef.current = [];
  }, []);

  // Search filter
  const [searchQuery, setSearchQuery] = useState('');

  // Dropdown & modal states
  const [isOptionsMenuOpen, setIsOptionsMenuOpen] = useState(false);
  const [isChatbotOpen, setIsChatbotOpen] = useState(false);

  // Custom delete confirmation modal & in-app toast states
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [toast, setToast] = useState(null);

  const showToast = (message, type = 'info', duration = 3500) => {
    const id = Date.now();
    setToast({ id, message, type });
    setTimeout(() => {
      setToast((prev) => (prev?.id === id ? null : prev));
    }, duration);
  };

  const clearEvidencePreviews = () => {
    evidenceObjectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    evidenceObjectUrlsRef.current = [];
    setEvidenceAttachments([]);
  };

  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const menuRef = useRef(null);
  const fileInputRef = useRef(null);
  const handledReturnHandoffRef = useRef(false);
  const skipMessageLoadRef = useRef(null);

  // Ref tracking current activeThreadId to prevent race conditions during switching
  const activeThreadIdRef = useRef(activeThreadId);
  useEffect(() => {
    activeThreadIdRef.current = activeThreadId;
  }, [activeThreadId]);

  // Auth protection
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      if (onNavigate) onNavigate('login');
    }
  }, [authLoading, isAuthenticated, onNavigate]);

  // Close options menu on outside click
  useEffect(() => {
    function handleClickOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setIsOptionsMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Auto-scroll messages
  const scrollToBottom = (smooth = true) => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' });
    }
  };

  useEffect(() => {
    scrollToBottom(true);
  }, [messages, isSending]);

  // 1. Load user's conversations from backend API
  const loadConversations = async (selectThreadId = null) => {
    if (!isAuthenticated) return;
    setIsLoadingConversations(true);
    setConversationsError('');
    try {
      const res = await chatbotService.getConversations();
      const list = Array.isArray(res?.conversations) ? res.conversations : [];
      // Sort by updated_at descending
      const sorted = [...list].sort(
        (a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at)
      );
      setConversations(sorted);

      if (selectThreadId) {
        setActiveThreadId(selectThreadId);
      } else if (sorted.length > 0 && !activeThreadIdRef.current) {
        setActiveThreadId(sorted[0].thread_id);
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

  useEffect(() => {
    if (!isAuthenticated || isLoadingConversations || handledReturnHandoffRef.current) return;
    const storageKey = 'flatkart_return_intake_handoff';
    const rawHandoff = sessionStorage.getItem(storageKey);
    if (!rawHandoff) return;
    // Consume before any async work so React re-renders cannot create duplicate threads/messages.
    sessionStorage.removeItem(storageKey);
    handledReturnHandoffRef.current = true;
    let handoff;
    try {
      handoff = JSON.parse(rawHandoff);
    } catch {
      return;
    }
    if (handoff?.intent !== 'return_replacement'
      || !handoff.orderId || !handoff.orderItemId
      || Date.now() - Number(handoff.createdAt || 0) > 5 * 60 * 1000) return;

    const startReturnConversation = async () => {
      setIsCreating(true);
      try {
        const conversation = await chatbotService.createConversation('Return or Replace');
        setConversations((previous) => [conversation, ...previous.filter((item) => item.thread_id !== conversation.thread_id)]);
        skipMessageLoadRef.current = conversation.thread_id;
        setActiveThreadId(conversation.thread_id);
        setMessages([]);
        const itemName = [handoff.productName, handoff.variantName].filter(Boolean).join(' - ');
        const quantity = handoff.quantity ? `, quantity ${handoff.quantity}` : '';
        const question = `I want to return or replace ${itemName || 'an item'} from order #${handoff.orderNumber || handoff.orderId}${quantity}.`;
        await handleSendMessage(question, null, {
          threadId: conversation.thread_id,
          orderId: handoff.orderId,
          orderItemId: handoff.orderItemId,
          newReturnIntake: true,
        });
      } catch (err) {
        setMessageError(err.message || 'Could not start the return or replacement conversation.');
      } finally {
        setIsCreating(false);
      }
    };
    void startReturnConversation();
  }, [isAuthenticated, isLoadingConversations]);

  // 2. Load messages when activeThreadId changes
  useEffect(() => {
    if (!activeThreadId) {
      setMessages([]);
      return;
    }
    if (skipMessageLoadRef.current === activeThreadId) {
      skipMessageLoadRef.current = null;
      return;
    }

    let isSubscribed = true;
    setIsLoadingMessages(true);
    setMessageError('');

    chatbotService.getConversation(activeThreadId)
      .then((data) => {
        if (isSubscribed) {
          const loaded = Array.isArray(data?.messages) ? data.messages : [];
          setMessages(loaded);
          const intake = data?.return_intake || null;
          setReturnIntake(intake);
          setReturnDescriptionDraft(intake?.description || '');
          setReturnIntakeContext(intake?.active ? {
            threadId: activeThreadId,
            orderId: intake.order_id,
            orderItemId: intake.order_item_id,
            returnSubmissionKey: intake.return_submission_key || data.return_submission_key,
          } : null);
          clearEvidencePreviews();
          const stagedEvidence = Array.isArray(data?.staged_evidence) ? data.staged_evidence : [];
          Promise.all(stagedEvidence.map(async (item) => {
            try {
              const blob = await chatbotService.getStagedEvidenceBlob(item.preview_url);
              const url = URL.createObjectURL(blob);
              evidenceObjectUrlsRef.current.push(url);
              return { name: item.filename, size: item.size_bytes, type: item.content_type, url };
            } catch {
              return null;
            }
          })).then((previews) => {
            const usable = previews.filter(Boolean);
            if (isSubscribed) setEvidenceAttachments(usable);
            else usable.forEach((item) => URL.revokeObjectURL(item.url));
          });

          // Update preview for this conversation in list
          if (loaded.length > 0) {
            const lastMsg = loaded[loaded.length - 1];
            setConversations((prev) =>
              prev.map((c) =>
                c.thread_id === activeThreadId
                  ? { ...c, last_message: lastMsg.content }
                  : c
              )
            );
          }
        }
      })
      .catch((err) => {
        if (isSubscribed) {
          setMessageError(err.message || 'Failed to load conversation history.');
        }
      })
      .finally(() => {
        if (isSubscribed) {
          setIsLoadingMessages(false);
        }
      });

    return () => {
      isSubscribed = false;
    };
  }, [activeThreadId]);

  // 3. New Conversation workflow:
  // Calls POST /chatbot/conversations, receives new thread_id, immediately adds to sidebar,
  // sets active, clears messages, and shows welcome screen without touching previous conversation.
  const handleNewConversation = async () => {
    if (isCreating) return;
    setIsCreating(true);
    setMessageError('');
    try {
      const newConv = await chatbotService.createConversation('New chat');
      const newRecord = {
        ...newConv,
        title: newConv.title || 'New chat',
        last_message: '',
      };

      setConversations((prev) => [
        newRecord,
        ...prev.filter((c) => c.thread_id !== newConv.thread_id),
      ]);
      setActiveThreadId(newConv.thread_id);
      setMessages([]);
      setInputText('');
      setLastFailedRequest(null);
    } catch (err) {
      setMessageError(err.message || 'Failed to create new conversation.');
    } finally {
      setIsCreating(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  };

  // 4. Send Message:
  // Explicitly binds to activeThreadId, generates unique request_id,
  // displays user turn immediately, updates conversation title & timestamp dynamically,
  // and prevents delayed responses from cross-polluting other threads.
  const handleSendMessage = async (textToSend = null, retryPayload = null, requestContext = {}) => {
    const question = (textToSend !== null ? textToSend : inputText).trim();
    if (!question || isSending) return;

    let targetThreadId = retryPayload?.threadId || requestContext.threadId || activeThreadId;

    // If no active thread exists yet, create one on the fly
    if (!targetThreadId) {
      try {
        const created = await chatbotService.createConversation('New chat');
        targetThreadId = created.thread_id;
        setConversations((prev) => [created, ...prev]);
        setActiveThreadId(targetThreadId);
      } catch (err) {
        setMessageError('Failed to initialize conversation: ' + err.message);
        return;
      }
    }

    const requestId = retryPayload?.requestId || crypto.randomUUID();

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

    // Optimistically update conversation preview in sidebar
    setConversations((prev) =>
      prev.map((c) =>
        c.thread_id === targetThreadId
          ? {
              ...c,
              last_message: question,
              updated_at: new Date().toISOString(),
            }
          : c
      )
    );

    try {
      const response = await chatbotService.askQuestion(question, {
        threadId: targetThreadId,
        requestId,
        orderId: requestContext.orderId,
        orderItemId: requestContext.orderItemId,
        newReturnIntake: requestContext.newReturnIntake,
      });

      if (requestContext.newReturnIntake && response?.return_submission_key) {
        setReturnIntakeContext({
          threadId: targetThreadId,
          orderId: requestContext.orderId,
          orderItemId: requestContext.orderItemId,
          returnSubmissionKey: response.return_submission_key,
        });
        setReturnIntake(response.return_intake || null);
        clearEvidencePreviews();
        setReturnDescriptionDraft('');
        setEvidenceUploadState({ busy: false, message: '', error: false });
      }

      const returnedThreadId = response?.thread_id || targetThreadId;
      const returnedTitle = response?.title;
      const returnedUpdatedAt = response?.updated_at || new Date().toISOString();
      const answer = response?.answer || 'Thank you. How else may I assist you today?';
      const assistantMsg = {
        role: 'assistant',
        content: answer,
        structured_response: response?.response_type ? response : null,
        timestamp: returnedUpdatedAt,
      };

      // Only update current messages view if user is STILL viewing this thread
      if (activeThreadIdRef.current === targetThreadId) {
        setMessages((prev) => [...prev, assistantMsg]);
      }

      // Update sidebar conversation record dynamically
      setConversations((prev) => {
        const updated = prev.map((c) => {
          if (c.thread_id === targetThreadId) {
            return {
              ...c,
              title: returnedTitle || (c.title === 'New chat' ? question.slice(0, 80) : c.title),
              last_message: answer.slice(0, 100),
              updated_at: returnedUpdatedAt,
            };
          }
          return c;
        });
        return updated.sort(
          (a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at)
        );
      });
    } catch (err) {
      setMessageError(err.message || 'Failed to send message. Please try again.');
      setLastFailedRequest({
        question,
        requestId,
        threadId: targetThreadId,
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

  const handleEvidenceSelection = async (event) => {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (!files.length) return;
    if (!returnIntakeContext?.returnSubmissionKey || returnIntakeContext.threadId !== activeThreadId) {
      setEvidenceUploadState({ busy: false, message: 'Start a return or replacement request before attaching evidence.', error: true });
      return;
    }
    if ((returnIntake?.evidence_count || 0) + files.length > 5) {
      setEvidenceUploadState({ busy: false, message: 'You can attach up to five evidence images to this request.', error: true });
      return;
    }
    setEvidenceUploadState({ busy: true, message: 'Uploading evidence…', error: false });
    try {
      const result = await chatbotService.uploadReturnEvidence({ ...returnIntakeContext, files });
      const successfulFiles = (result?.files || []).filter((file) => file.status === 'pending_submission');
      const failedFiles = (result?.files || []).filter((file) => file.status !== 'pending_submission');
      if (!successfulFiles.length) {
        throw new Error(failedFiles[0]?.message || 'Evidence upload failed. Please retry.');
      }
      const successfulIndexes = (result?.files || []).map((file, index) => file.status === 'pending_submission' ? index : -1).filter((index) => index >= 0);
      const previews = successfulIndexes.map((index) => {
        const file = files[index];
        const url = URL.createObjectURL(file);
        evidenceObjectUrlsRef.current.push(url);
        return { name: file.name, size: file.size, type: file.type, url };
      });
      setEvidenceAttachments((previous) => [...previous, ...previews]);
      if (result.return_intake) setReturnIntake(result.return_intake);
      const summary = `${successfulFiles.length} evidence ${successfulFiles.length === 1 ? 'image' : 'images'} uploaded${failedFiles.length ? `; ${failedFiles.length} failed` : ''}.`;
      setEvidenceUploadState({
        busy: false,
        message: failedFiles.length
          ? `${summary} ${failedFiles.map((file) => `${file.filename || 'Image'}: ${file.message}`).join(' ')} `
          : summary,
        error: failedFiles.length > 0,
      });
    } catch (err) {
      setEvidenceUploadState({ busy: false, message: err.message || 'Evidence upload failed. Please retry.', error: true });
    }
  };

  const handleReturnIntakeAction = async (action, value) => {
    const threadId = activeThreadId;
    if (!threadId || !returnIntake?.active || isSending || evidenceUploadState.busy) return;
    setIsSending(true);
    setMessageError('');
    try {
      const result = await chatbotService.submitReturnIntakeAction(threadId, action, value);
      if (activeThreadIdRef.current !== threadId) return;
      if (result?.return_intake) setReturnIntake(result.return_intake);
      if (result?.success === false) {
        setMessageError(result.answer || 'The return request could not be submitted. Please try again.');
      } else if (action === 'confirm' && result.answer) {
        setMessages((previous) => [...previous, {
          role: 'assistant', content: result.answer,
          structured_response: { schema_version: 1, agent: 'returns', response_type: 'text', answer: result.answer, data: null },
          timestamp: new Date().toISOString(),
        }]);
      } else if (action === 'cancel') {
        setReturnIntakeContext(null);
        clearEvidencePreviews();
        setEvidenceUploadState({ busy: false, message: 'Return intake cancelled. No request was submitted.', error: false });
      }
    } catch (err) {
      if (activeThreadIdRef.current === threadId) setMessageError(err.message || 'The return details could not be updated.');
    } finally {
      setIsSending(false);
    }
  };

  // 5. Delete conversation (Open custom confirmation modal)
  const handleDeleteConversation = () => {
    if (!activeThreadId) return;
    setIsOptionsMenuOpen(false);
    setIsDeleteModalOpen(true);
  };

  const confirmDeleteConversation = async () => {
    if (!activeThreadId) return;
    const threadToDelete = activeThreadId;
    setIsDeleting(true);
    try {
      await chatbotService.deleteConversation(threadToDelete);
      const remaining = conversations.filter((c) => c.thread_id !== threadToDelete);
      setConversations(remaining);

      if (remaining.length > 0) {
        setActiveThreadId(remaining[0].thread_id);
      } else {
        setActiveThreadId(null);
        setMessages([]);
      }
      setIsDeleteModalOpen(false);
      showToast('Conversation deleted successfully', 'success');
    } catch (err) {
      showToast(`Could not delete conversation: ${err.message}`, 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  // 6. Download conversation transcript
  const handleDownloadTranscript = () => {
    if (!messages.length) {
      showToast('There are no messages in this conversation to download.', 'warning');
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

    messages.forEach((msg) => {
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
    showToast('Conversation transcript downloaded successfully', 'success');
  };

  // Voice input toggle (Web Speech API)
  const handleVoiceInput = () => {
    if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
      showToast('Speech recognition is not supported in this browser.', 'info');
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
    recognition.onerror = (event) => {
      setIsListening(false);
      if (event.error && event.error !== 'no-speech') {
        showToast(`Voice input notice: ${event.error}`, 'warning');
      }
    };
    recognition.onend = () => setIsListening(false);

    recognition.start();
  };

  // Filter conversations by search term
  const filteredConversations = useMemo(() => {
    if (!searchQuery.trim()) return conversations;
    const q = searchQuery.toLowerCase();
    return conversations.filter(
      (c) =>
        (c.title && c.title.toLowerCase().includes(q)) ||
        (c.last_message && c.last_message.toLowerCase().includes(q))
    );
  }, [conversations, searchQuery]);

  return (
    <AccountLayout
      activeItem="conversations"
      onNavigate={onNavigate}
      onOpenWishlist={() => setIsWishlistOpen(true)}
      onToggleChatbot={() => setIsChatbotOpen((open) => !open)}
    >
      <div className="fk-conversations-main">
        <div className="fk-conversations-header">
          <h1 className="fk-conversations-title">My Conversations</h1>
          <p className="fk-conversations-subtitle">
            AI shopping &amp; support
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
                disabled={isCreating}
                aria-label="Start new conversation"
              >
                {isCreating ? (
                  <Loader2 size={16} className="fk-spin" />
                ) : (
                  <Plus size={18} strokeWidth={2.4} />
                )}
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
                    const previewText = conv.last_message || (conv.title === 'New chat' ? 'Start a conversation...' : conv.title);

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
                          <span className="fk-conv-item-preview" title={previewText}>
                            {previewText}
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
                  /* Welcome Screen matching exact reference UI */
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
                                <Suspense fallback={
                                  isValidStructuredResponse(msg.structured_response)
                                    && msg.structured_response.response_type !== 'text' ? null : <span>{msg.content}</span>
                                }>
                                  <AssistantMessageContent
                                    content={msg.content}
                                    response={msg.structured_response}
                                  />
                                </Suspense>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}

                    {returnIntake?.active && returnIntake.thread_id === activeThreadId && (
                      <div className="fk-return-intake-panel" aria-live="polite">
                        {returnIntake.step === 'resolution' && <>
                          <strong>How would you like us to resolve this item?</strong>
                          <div className="fk-return-intake-options">
                            <button type="button" disabled={isSending} onClick={() => handleReturnIntakeAction('select_resolution', 'refund')}>Return &amp; Refund</button>
                            <button type="button" disabled={isSending} onClick={() => handleReturnIntakeAction('select_resolution', 'replacement')}>Return &amp; Replacement</button>
                          </div>
                          <button type="button" className="fk-return-intake-cancel" disabled={isSending} onClick={() => handleReturnIntakeAction('cancel')}>Cancel request</button>
                        </>}
                        {returnIntake.step === 'reason' && <>
                          <strong>What is the reason for this request?</strong>
                          <div className="fk-return-intake-options">
                            {[
                              ['Defective', 'defective'], ['Damaged', 'damaged'], ['Wrong item', 'wrong_item'],
                              ['Missing parts', 'missing_parts'], ['Not as described', 'not_as_described'], ['Changed mind', 'changed_mind'],
                            ].map(([label, value]) => <button key={value} type="button" disabled={isSending} onClick={() => handleReturnIntakeAction('select_reason', value)}>{label}</button>)}
                          </div>
                          <button type="button" className="fk-return-intake-back" disabled={isSending} onClick={() => handleReturnIntakeAction('go_back')}>Back</button>
                        </>}
                        {returnIntake.step === 'refund_timing' && <>
                          <strong>When should the refund be issued?</strong>
                          <div className="fk-return-intake-options">
                            <button type="button" disabled={isSending} onClick={() => handleReturnIntakeAction('select_refund_timing', 'immediate')}>Refund immediately</button>
                            <button type="button" disabled={isSending} onClick={() => handleReturnIntakeAction('select_refund_timing', 'after_collection')}>After the item is collected</button>
                          </div>
                          <button type="button" className="fk-return-intake-back" disabled={isSending} onClick={() => handleReturnIntakeAction('go_back')}>Back</button>
                        </>}
                        {returnIntake.step === 'description' && <>
                          <label htmlFor="fk-return-description"><strong>Would you like to add a short description?</strong></label>
                          <textarea id="fk-return-description" maxLength={2000} value={returnDescriptionDraft}
                            onChange={(event) => setReturnDescriptionDraft(event.target.value)}
                            placeholder="Description (optional)" disabled={isSending} />
                          <div className="fk-return-intake-options">
                            <button type="button" disabled={isSending || !returnDescriptionDraft.trim()} onClick={() => handleReturnIntakeAction('set_description', returnDescriptionDraft)}>Save description</button>
                            <button type="button" disabled={isSending} onClick={() => { setReturnDescriptionDraft(''); handleReturnIntakeAction('skip_description'); }}>Skip</button>
                          </div>
                          <button type="button" className="fk-return-intake-back" disabled={isSending} onClick={() => handleReturnIntakeAction('go_back')}>Back</button>
                        </>}
                        {returnIntake.step === 'evidence' && <>
                          <strong>Please attach at least one photo of the item you received.</strong>
                          <p>Use the paperclip below to upload a JPEG, PNG, or WebP image.</p>
                          {evidenceUploadState.busy && <span role="status">Uploading evidence…</span>}
                          <button type="button" className="fk-return-intake-back" disabled={isSending || evidenceUploadState.busy} onClick={() => handleReturnIntakeAction('go_back')}>Back</button>
                        </>}
                        {returnIntake.step === 'review' && <>
                          <strong>Review your request</strong>
                          <dl className="fk-return-intake-summary">
                            <div><dt>Order</dt><dd>{returnIntake.order_number}</dd></div>
                            <div><dt>Product</dt><dd>{[returnIntake.product_name, returnIntake.variant_name].filter(Boolean).join(' · ')}</dd></div>
                            <div><dt>Resolution</dt><dd>{returnIntake.resolution_type === 'replacement' ? 'Return & Replacement' : 'Return & Refund'}</dd></div>
                            <div><dt>Reason</dt><dd>{returnIntake.reason_code?.replace(/_/g, ' ')}</dd></div>
                            {returnIntake.resolution_type === 'refund' && <div><dt>Refund timing</dt><dd>{returnIntake.refund_timing === 'immediate' ? 'Immediately' : 'After collection'}</dd></div>}
                            <div><dt>Quantity</dt><dd><select aria-label="Quantity" value={returnIntake.quantity} disabled={isSending} onChange={(event) => handleReturnIntakeAction('set_quantity', event.target.value)}>{Array.from({ length: returnIntake.max_quantity }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1}</option>)}</select></dd></div>
                            <div><dt>Evidence</dt><dd>{returnIntake.evidence_count} {returnIntake.evidence_count === 1 ? 'image' : 'images'}</dd></div>
                            {returnIntake.description && <div><dt>Description</dt><dd>{returnIntake.description}</dd></div>}
                          </dl>
                          {!!evidenceAttachments.length && <div className="fk-return-intake-previews">{evidenceAttachments.map((file, index) => <div key={`${file.name}-${index}`}><img src={file.url} alt={file.name} /><span>{file.name} · {Math.max(1, Math.round(file.size / 1024))} KB</span></div>)}</div>}
                          <div className="fk-return-intake-options">
                            <button type="button" disabled={isSending || evidenceUploadState.busy || !returnIntake.evidence_count} onClick={() => handleReturnIntakeAction('confirm')}>{isSending ? 'Submitting request…' : 'Confirm Request'}</button>
                            <button type="button" disabled={isSending || evidenceUploadState.busy} onClick={() => handleReturnIntakeAction('cancel')}>Cancel Request</button>
                            <button type="button" className="fk-return-intake-back" disabled={isSending || evidenceUploadState.busy} onClick={() => handleReturnIntakeAction('go_back')}>Back</button>
                          </div>
                        </>}
                        {!['resolution', 'review'].includes(returnIntake.step) && (
                          <button type="button" className="fk-return-intake-cancel" disabled={isSending || evidenceUploadState.busy} onClick={() => handleReturnIntakeAction('cancel')}>Cancel request</button>
                        )}
                      </div>
                    )}

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

              {/* Bottom Input Area matching reference UI */}
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
                    accept="image/jpeg,image/png,image/webp"
                    multiple
                    disabled={!returnIntake?.active || returnIntake.thread_id !== activeThreadId || isSending || evidenceUploadState.busy}
                    onChange={handleEvidenceSelection}
                  />

                  {/* Attachment Icon */}
                  <button
                    type="button"
                    className="fk-chat-attach-btn"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={!returnIntake?.active || returnIntake.thread_id !== activeThreadId || isSending || evidenceUploadState.busy}
                    title={returnIntake?.active && returnIntake.thread_id === activeThreadId ? 'Attach return evidence' : 'Start a return intake to attach evidence'}
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
                    disabled={isSending || evidenceUploadState.busy || (returnIntake?.active && returnIntake.thread_id === activeThreadId)}
                    aria-label="Ask Flatkart Assistant"
                  />

                  {/* Microphone icon */}
                  <button
                    type="button"
                    className={`fk-chat-mic-btn ${isListening ? 'listening' : ''}`}
                    onClick={handleVoiceInput}
                    disabled={isSending || evidenceUploadState.busy || (returnIntake?.active && returnIntake.thread_id === activeThreadId)}
                    title={isListening ? 'Listening… click to stop' : 'Use voice input'}
                    aria-label="Voice input"
                  >
                    <Mic size={18} strokeWidth={2} />
                  </button>

                  {/* Send Button */}
                  <button
                    type="submit"
                    className="fk-chat-send-btn"
                    disabled={!inputText.trim() || isSending || (returnIntake?.active && returnIntake.thread_id === activeThreadId)}
                    title="Send message"
                    aria-label="Send message"
                  >
                    <Send size={15} strokeWidth={2.4} />
                  </button>
                </form>
                {evidenceUploadState.message && (
                  <p className={`fk-chat-evidence-status ${evidenceUploadState.error ? 'is-error' : ''}`} role={evidenceUploadState.error ? 'alert' : 'status'}>
                    {evidenceUploadState.message}
                  </p>
                )}
              </div>
            </section>
          </div>
        </div>

      {/* Global Modals & Drawers */}
      <CartDrawer onNavigate={onNavigate} />
      <WishlistDrawer onNavigate={onNavigate} />
      <ChatbotWidget isOpen={isChatbotOpen} onToggle={() => setIsChatbotOpen((open) => !open)} onNavigate={onNavigate} />

      {/* Custom Delete Confirmation Modal */}
      {isDeleteModalOpen && (
        <div
          className="fk-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="fk-delete-dialog-title"
          onClick={() => {
            if (!isDeleting) setIsDeleteModalOpen(false);
          }}
        >
          <div
            className="fk-delete-modal-card"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="fk-modal-header">
              <div className="fk-modal-icon-badge">
                <Trash2 size={20} />
              </div>
              <h3 id="fk-delete-dialog-title" className="fk-delete-modal-title">
                Delete Conversation
              </h3>
            </div>
            <p className="fk-delete-modal-body">
              Are you sure you want to delete this conversation? This action cannot be undone and all message history in this thread will be permanently removed.
            </p>
            <div className="fk-modal-actions">
              <button
                type="button"
                className="fk-modal-btn fk-modal-btn-cancel"
                onClick={() => setIsDeleteModalOpen(false)}
                disabled={isDeleting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="fk-modal-btn fk-modal-btn-delete"
                onClick={confirmDeleteConversation}
                disabled={isDeleting}
              >
                {isDeleting ? (
                  <>
                    <Loader2 size={15} className="fk-spinner" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <>
                    <Trash2 size={15} />
                    <span>Delete</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* In-app Toast Notifications */}
      {toast && (
        <div className="fk-toast-container" aria-live="polite">
          <div className={`fk-toast fk-toast-${toast.type}`}>
            <div className="fk-toast-icon">
              {toast.type === 'success' && <CheckCircle size={18} />}
              {toast.type === 'error' && <AlertCircle size={18} />}
              {toast.type === 'warning' && <AlertTriangle size={18} />}
              {toast.type === 'info' && <Info size={18} />}
            </div>
            <span className="fk-toast-message">{toast.message}</span>
            <button
              type="button"
              className="fk-toast-close"
              onClick={() => setToast(null)}
              aria-label="Close notification"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}
    </AccountLayout>
  );
}

export default MyConversations;
