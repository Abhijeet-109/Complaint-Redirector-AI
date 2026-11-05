import { apiRequest } from './api.js';

const SESSION_ID_KEY_PREFIX = 'flatkart_chatbot_session_id:';

function getWidgetSessionStorageKey(userId) {
  if (userId === null || userId === undefined || String(userId).trim() === '') {
    throw new TypeError('A stable authenticated user ID is required for the widget session.');
  }
  return `${SESSION_ID_KEY_PREFIX}${encodeURIComponent(String(userId))}`;
}

function getWidgetSessionId(userId) {
  const storageKey = getWidgetSessionStorageKey(userId);
  let sessionId = sessionStorage.getItem(storageKey);
  if (!sessionId) {
    sessionId = crypto.randomUUID();
    sessionStorage.setItem(storageKey, sessionId);
  }
  return sessionId;
}

function clearWidgetSessionId(userId) {
  sessionStorage.removeItem(getWidgetSessionStorageKey(userId));
}

export const chatbotService = {
  /** Retrieve or create the floating widget session ID for an authenticated user. */
  getWidgetSessionId,

  /** Clear only the floating widget session ID belonging to an authenticated user. */
  clearWidgetSessionId,

  /**
   * Retrieve list of conversations for current user.
   * Endpoint: GET /chatbot/conversations
   */
  async getConversations() {
    return await apiRequest('/chatbot/conversations', {
      method: 'GET',
    });
  },

  /**
   * Create a new chat conversation.
   * Endpoint: POST /chatbot/conversations
   */
  async createConversation(title = 'New chat') {
    return await apiRequest('/chatbot/conversations', {
      method: 'POST',
      body: JSON.stringify({
        title: title ? title.trim() : 'New chat',
      }),
    });
  },

  /**
   * Retrieve a conversation and its messages by thread_id.
   * Endpoint: GET /chatbot/conversations/{thread_id}
   */
  async getConversation(threadId) {
    return await apiRequest(`/chatbot/conversations/${encodeURIComponent(threadId)}`, {
      method: 'GET',
    });
  },

  /**
   * Delete a conversation by thread_id.
   * Endpoint: DELETE /chatbot/conversations/{thread_id}
   */
  async deleteConversation(threadId) {
    return await apiRequest(`/chatbot/conversations/${encodeURIComponent(threadId)}`, {
      method: 'DELETE',
    });
  },

  /**
   * Send a question to Flatkart's document-based RAG assistant.
   * Endpoint: POST /chatbot/ask
   * Request body: { question: string, thread_id?: string, session_id?: string, request_id?: string }
   */
  async askQuestion(question, options = {}) {
    const payload = {
      question: question.trim(),
    };

    if (options.threadId) {
      payload.thread_id = options.threadId;
    } else if (options.sessionId) {
      payload.session_id = options.sessionId;
    }

    if (options.requestId) {
      payload.request_id = options.requestId;
    }

    return await apiRequest('/chatbot/ask', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  /**
   * Health check for chatbot service.
   * Endpoint: GET /chatbot/health
   */
  async checkHealth() {
    return await apiRequest('/chatbot/health', {
      method: 'GET',
    });
  },
};

export default chatbotService;
