import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveAuthorizedPage } from '../src/utils/roleAccess.js';

test('each administrative role is confined to its own dashboard', () => {
  const cases = [
    ['department_handler', 'home', 'handler-dashboard'],
    ['department_handler', 'admin-dashboard', 'handler-dashboard'],
    ['admin', 'home', 'admin-dashboard'],
    ['admin', 'my-complaints', 'admin-dashboard'],
    ['admin', 'super-admin-dashboard', 'admin-dashboard'],
    ['super_admin', 'home', 'super-admin-dashboard'],
    ['super_admin', 'my-complaints', 'super-admin-dashboard'],
    ['super_admin', 'admin-dashboard', 'super-admin-dashboard'],
  ];

  for (const [role, requestedPage, expectedPage] of cases) {
    assert.equal(resolveAuthorizedPage(requestedPage, role, true), expectedPage);
  }
});

test('customers retain the shopping site and cannot open administrative dashboards', () => {
  assert.equal(resolveAuthorizedPage('home', 'user', true), 'home');
  assert.equal(resolveAuthorizedPage('my-complaints', 'user', true), 'my-complaints');
  assert.equal(resolveAuthorizedPage('admin-dashboard', 'user', true), 'my-complaints');
});

test('public login and registration remain available, while protected routes require login', () => {
  assert.equal(resolveAuthorizedPage('home', null, false), 'home');
  assert.equal(resolveAuthorizedPage('login', 'admin', true), 'login');
  assert.equal(resolveAuthorizedPage('register', 'super_admin', true), 'register');
  assert.equal(resolveAuthorizedPage('handler-dashboard', null, false), 'login');
  assert.equal(resolveAuthorizedPage('my-complaints', null, false), 'login');
});

test('unrecognized authenticated roles fail closed', () => {
  assert.equal(resolveAuthorizedPage('home', 'unknown', true), 'login');
});
