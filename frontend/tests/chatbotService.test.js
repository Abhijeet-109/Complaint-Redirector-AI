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

