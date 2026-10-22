import { apiRequest } from './api';

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
   * Send a question to Flatkart's document-based RAG assistant.
   * Endpoint: POST /chatbot/ask
   * Request body: { question: string, session_id: string }
   * Response: { answer: string, sources: Array<{ document: string, page: number|null }> }
   */
  async askQuestion(question) {
    return await apiRequest('/chatbot/ask', {
      method: 'POST',
      body: JSON.stringify({
        question: question.trim(),
        session_id: getSessionId(),
      }),
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
