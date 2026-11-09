export const EMPTY_SERVER_CART = Object.freeze({
  id: null,
  items: [],
  item_count: 0,
  subtotal: '0.00',
  total_amount: '0.00',
  payment_methods: Object.freeze({ cod: false, online: false }),
});

export function cartForOwner(serverCart, ownerId) {
  return cartBelongsTo(serverCart?.ownerId, ownerId)
    ? serverCart.value
    : EMPTY_SERVER_CART;
}

export function cartBelongsTo(ownerId, currentOwnerId) {
  return ownerId != null && ownerId === currentOwnerId;
}

export function cartQuantity(cart) {
  return Number.isInteger(cart?.item_count) ? cart.item_count : 0;
}

export function cartItemKey(item) {
  return String(item.variant_id);
}
