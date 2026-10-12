import { apiRequest } from './api';

export const chatbotService = {
  /**
   * Send a question to Flatkart's document-based RAG assistant.
   * Endpoint: POST /chatbot/ask
   * Request body: { question: string }
   * Response: { answer: string, sources: Array<{ document: string, page: number|null }> }
   */
  async askQuestion(question) {
    return await apiRequest('/chatbot/ask', {
      method: 'POST',
      body: JSON.stringify({ question: question.trim() }),
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
