const API_BASE = '';

export async function apiRequest(endpoint, options = {}) {
  const token = localStorage.getItem('flatkart_token');
  
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    let errorDetail = 'API request failed';
    try {
      const responseText = await response.text();
      try {
        const errorData = JSON.parse(responseText);
        const detailMessage = typeof errorData?.detail === 'string' ? errorData.detail.trim() : '';
        const message = typeof errorData?.message === 'string' ? errorData.message.trim() : '';
        const validationErrors = Array.isArray(errorData?.detail) ? errorData.detail : [];
        const validationMessages = validationErrors
          .map((item) => typeof item?.msg === 'string' ? item.msg.trim() : '')
          .filter(Boolean);
        const questionTooLong = endpoint === '/chatbot/ask' && validationErrors.some((item) => (
          Array.isArray(item?.loc)
          && item.loc.includes('question')
          && Number(item?.ctx?.max_length) === 2000
        ));

        errorDetail = detailMessage
          || validationMessages.join(' ')
          || message
          || `${response.status} ${response.statusText}`.trim()
          || errorDetail;
        if (questionTooLong) {
          errorDetail = 'Your question is too long. Please limit it to 2,000 characters.';
        }
      } catch {
        errorDetail = responseText.trim().slice(0, 300) || `${response.status} ${response.statusText}` || errorDetail;
      }
    } catch {
      errorDetail = `${response.status} ${response.statusText}` || errorDetail;
    }
    throw new Error(errorDetail);
  }

  return response.json();
}
