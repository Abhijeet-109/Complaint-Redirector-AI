import test from 'node:test';
import assert from 'node:assert/strict';
import { cartForOwner, cartItemKey, cartQuantity, EMPTY_SERVER_CART } from '../src/utils/commerceState.js';

test('a server cart is only visible to the authenticated owner', () => {
  const privateCart = { id: 8, items: [{ variant_id: 4, quantity: 2 }], item_count: 2, subtotal: '80.00' };
  const entry = { ownerId: 17, value: privateCart };
  assert.equal(cartForOwner(entry, 17), privateCart);
  assert.equal(cartForOwner(entry, 18), EMPTY_SERVER_CART);
  assert.equal(cartForOwner(entry, null), EMPTY_SERVER_CART);
});

test('cart count comes from the server count and has a safe empty fallback', () => {
  assert.equal(cartQuantity({ item_count: 4 }), 4);
  assert.equal(cartQuantity({ item_count: '4' }), 0);
  assert.equal(cartQuantity(null), 0);
});

test('different variants remain separate cart line identities', () => {
  const rows = [{ variant_id: 31, quantity: 1 }, { variant_id: 32, quantity: 1 }];
  assert.notEqual(cartItemKey(rows[0]), cartItemKey(rows[1]));
  assert.equal(cartItemKey(rows[0]), '31');
});
