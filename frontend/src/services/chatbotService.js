import { apiRequest } from './api.js';

const SESSION_ID_KEY = 'flatkart_chatbot_session_id';

function getSessionId() {
  let sessionId = sessionStorage.getItem(SESSION_ID_KEY);
  if (!sessionId) {
    sessionId = crypto.randomUUID();
    sessionStorage.setItem(SESSION_ID_KEY, sessionId);
  }
  return sessionId;
}

export const chatbotService = {
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
      session_id: getSessionId(),
    };

    if (options.threadId) {
      payload.thread_id = options.threadId;
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
