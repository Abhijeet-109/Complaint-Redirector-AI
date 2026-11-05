import assert from 'node:assert/strict';
import test from 'node:test';
import { chatbotService } from '../src/services/chatbotService.js';
import { resolveAuthorizedPage } from '../src/utils/roleAccess.js';

test('my-conversations route permissions', () => {
  // Customers can access my-conversations
  assert.equal(resolveAuthorizedPage('my-conversations', 'user', true), 'my-conversations');
  // Unauthenticated users are redirected to login
  assert.equal(resolveAuthorizedPage('my-conversations', null, false), 'login');
  // Administrative roles are confined to their dashboards
  assert.equal(resolveAuthorizedPage('my-conversations', 'admin', true), 'admin-dashboard');
  assert.equal(resolveAuthorizedPage('my-conversations', 'super_admin', true), 'super-admin-dashboard');
  assert.equal(resolveAuthorizedPage('my-conversations', 'department_handler', true), 'handler-dashboard');
});

test('chatbotService contract endpoints and methods', () => {
  assert.equal(typeof chatbotService.getConversations, 'function');
  assert.equal(typeof chatbotService.createConversation, 'function');
  assert.equal(typeof chatbotService.getConversation, 'function');
  assert.equal(typeof chatbotService.deleteConversation, 'function');
  assert.equal(typeof chatbotService.askQuestion, 'function');
  assert.equal(typeof chatbotService.checkHealth, 'function');
});

async function withBrowserStorage(run) {
  const originalSessionStorage = globalThis.sessionStorage;
  const originalLocalStorage = globalThis.localStorage;
  const values = new Map();
  const storage = {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
  };
  globalThis.sessionStorage = storage;
  globalThis.localStorage = storage;

  try {
    return await run(values);
  } finally {
    if (originalSessionStorage === undefined) delete globalThis.sessionStorage;
    else globalThis.sessionStorage = originalSessionStorage;
    if (originalLocalStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = originalLocalStorage;
  }
}

test('widget session IDs are stable per user and clearing one user does not affect another', async () => {
  await withBrowserStorage((values) => {
    const firstUserSession = chatbotService.getWidgetSessionId(17);
    assert.equal(chatbotService.getWidgetSessionId(17), firstUserSession);

    const secondUserSession = chatbotService.getWidgetSessionId(23);
    assert.notEqual(secondUserSession, firstUserSession);

    chatbotService.clearWidgetSessionId(17);
    assert.equal(values.has('flatkart_chatbot_session_id:17'), false);
    assert.equal(values.get('flatkart_chatbot_session_id:23'), secondUserSession);
  });
});

test('askQuestion sends explicitly supplied session_id and request_id', async () => {
  await withBrowserStorage(async () => {
    const originalFetch = globalThis.fetch;
    let payload;
    globalThis.fetch = async (_url, options) => {
      payload = JSON.parse(options.body);
      return {
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: async () => ({ answer: 'ok' }),
      };
    };

    try {
      await chatbotService.askQuestion('  hello  ', {
        sessionId: 'widget-session',
        requestId: 'request-1',
      });
      assert.deepEqual(payload, {
        question: 'hello',
        session_id: 'widget-session',
        request_id: 'request-1',
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

test('askQuestion gives explicit thread_id precedence over session_id', async () => {
  await withBrowserStorage(async () => {
    const originalFetch = globalThis.fetch;
    let payload;
    globalThis.fetch = async (_url, options) => {
      payload = JSON.parse(options.body);
      return {
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: async () => ({ answer: 'ok' }),
      };
    };

    try {
      await chatbotService.askQuestion('hello', {
        threadId: 'conversation-1',
        sessionId: 'widget-session',
        requestId: 'request-2',
      });
      assert.deepEqual(payload, {
        question: 'hello',
        thread_id: 'conversation-1',
        request_id: 'request-2',
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

