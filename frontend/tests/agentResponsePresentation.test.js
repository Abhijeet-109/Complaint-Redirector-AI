import assert from 'node:assert/strict';
import test from 'node:test';
import { getStructuredResponseSummary, isValidStructuredResponse } from '../src/components/chatbot/agentResponsePresentation.js';

function envelope(responseType, data, answer = 'Old verbose Markdown table') {
  return { schema_version: 1, agent: 'order', response_type: responseType, answer, data };
}

test('structured summaries derive counts from validated business data, not old prose', () => {
  const response = envelope('order_list', {
    orders: [{ order_number: 'O-1' }, { order_number: 'O-2' }],
  });
  assert.equal(isValidStructuredResponse(response), true);
  assert.equal(getStructuredResponseSummary(response), 'Here are your 2 recent orders.');
});

test('product and empty list responses have concise, meaningful summaries', () => {
  const product = envelope('product_list', {
    products: [{ name: 'Watch', variants: [] }],
  });
  const emptyShipments = envelope('shipment_list', { shipments: [] });
  assert.equal(getStructuredResponseSummary(product), 'I found 1 matching product.');
  assert.equal(getStructuredResponseSummary(emptyShipments), 'No shipment information was found.');
});

test('text, legacy, malformed, and unknown responses select Markdown fallback', () => {
  const text = envelope('text', null, 'A grounded answer.');
  const malformed = envelope('order_list', { orders: 'not-an-array' });
  const unknown = envelope('mystery', {});
  assert.equal(isValidStructuredResponse(text), true);
  assert.equal(getStructuredResponseSummary(text), null);
  assert.equal(isValidStructuredResponse(undefined), false);
  assert.equal(isValidStructuredResponse(malformed), false);
  assert.equal(isValidStructuredResponse(unknown), false);
});

test('cart and return responses require renderable data before selecting cards', () => {
  const cart = envelope('cart_summary', { items: [], item_count: 0, total: '0.00' });
  const returns = envelope('return_request_list', { return_requests: [] });
  const invalidCart = envelope('cart_update', { items: [], item_count: 0 });
  assert.equal(getStructuredResponseSummary(cart), 'Your cart is empty.');
  assert.equal(getStructuredResponseSummary(returns), "You don't have any existing return requests.");
  assert.equal(isValidStructuredResponse(invalidCart), false);
});
