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
        errorDetail = errorData.detail || errorData.message || responseText || errorDetail;
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
