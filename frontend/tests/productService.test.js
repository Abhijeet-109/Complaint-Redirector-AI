import test from 'node:test';
import assert from 'node:assert/strict';
import { productService } from '../src/services/productService.js';

function installFetch(t) {
  const requests = [];
  const previousFetch = globalThis.fetch;
  const previousStorage = globalThis.localStorage;
  globalThis.localStorage = { getItem: (key) => key === 'flatkart_token' ? 'customer-token' : null };
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options });
    return { ok: true, status: 200, headers: { get: () => null }, json: async () => ({ items: [] }) };
  };
  t.after(() => { globalThis.fetch = previousFetch; globalThis.localStorage = previousStorage; });
  return requests;
}

test('cart API sends selected product and variant without client prices or user ids', async (t) => {
  const requests = installFetch(t);
  await productService.addCartItem(9, 42, 2);
  const request = requests[0];
  assert.equal(request.url, '/api/cart/items');
  assert.equal(request.options.method, 'POST');
  assert.equal(request.options.headers.Authorization, 'Bearer customer-token');
  assert.deepEqual(JSON.parse(request.options.body), { product_id: 9, variant_id: 42, quantity: 2 });
});

test('cart quantity updates and removal use the selected variant id', async (t) => {
  const requests = installFetch(t);
  await productService.updateCartItem(42, 3);
  await productService.removeCartItem(42);
  assert.equal(requests[0].url, '/api/cart/items/42');
  assert.equal(requests[0].options.method, 'PUT');
  assert.deepEqual(JSON.parse(requests[0].options.body), { quantity: 3 });
  assert.equal(requests[1].url, '/api/cart/items/42');
  assert.equal(requests[1].options.method, 'DELETE');
});

test('COD and Razorpay checkout send only address data and an idempotency key', async (t) => {
  const requests = installFetch(t);
  const address = { recipient_name: 'Customer', pin_code: '411001' };
  await productService.placeCodOrder(address, 'cod-key-0001');
  await productService.createRazorpayCheckout(address, 'razorpay-key-0001');
  for (const request of requests) {
    assert.equal(request.options.method, 'POST');
    assert.ok(request.options.headers['Idempotency-Key']);
    assert.deepEqual(JSON.parse(request.options.body), { address });
    assert.equal(JSON.parse(request.options.body).total, undefined);
  }
});
