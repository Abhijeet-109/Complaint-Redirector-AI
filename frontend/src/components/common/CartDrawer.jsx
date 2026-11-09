import React, { useState } from 'react';
import { X, Trash2, ArrowRight, Minus, Plus } from 'lucide-react';
import { useCart } from '../../context/CartContext';
import { cartItemKey } from '../../utils/commerceState';

const currency = (value) => `₹${Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function CartDrawer({ onNavigate }) {
  const {
    cartItems, subtotal, removeFromCart, updateQuantity, isCartOpen, setIsCartOpen,
    cartLoading, cartError, setCartError,
  } = useCart();
  const [busyVariant, setBusyVariant] = useState(null);

  const mutate = async (variantId, action) => {
    setBusyVariant(variantId);
    setCartError('');
    try { await action(); }
    catch (error) { setCartError(error.message || 'Could not update your cart.'); }
    finally { setBusyVariant(null); }
  };

  if (!isCartOpen) return null;

  return (
    <div className="fk-drawer-overlay" onClick={() => setIsCartOpen(false)}>
      <div className="fk-drawer" onClick={(event) => event.stopPropagation()}>
        <div className="fk-drawer-header">
          <h3 style={{ fontSize: '17px', fontWeight: '700' }}>Shopping Cart ({cartItems.reduce((sum, item) => sum + item.quantity, 0)})</h3>
          <button type="button" aria-label="Close cart" style={{ color: '#FFFFFF', background: 'none', border: 'none', cursor: 'pointer' }} onClick={() => setIsCartOpen(false)}><X size={20} /></button>
        </div>
        <div className="fk-drawer-content" aria-live="polite">
          {cartLoading && cartItems.length === 0 && <p className="fk-cart-message">Loading your cart…</p>}
          {cartError && <p className="fk-cart-error" role="alert">{cartError}</p>}
          {!cartLoading && cartItems.length === 0 && <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--fk-text-muted)' }}>Your cart is currently empty.</div>}
          {cartItems.map((item) => (
            <div key={cartItemKey(item)} className="fk-drawer-item">
              <img src={item.image || '/assets/cat_men_hi.jpg'} alt={item.product_name} className="fk-drawer-item-img" />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '13.5px', fontWeight: '700', color: 'var(--fk-text-primary)' }}>{item.product_name}</div>
                <div style={{ fontSize: '12.5px', color: 'var(--fk-text-muted)' }}>{item.variant_name} · SKU {item.sku}</div>
                <div style={{ fontSize: '13.5px', fontWeight: '700', color: 'var(--fk-price-coral)', marginTop: '2px' }}>{currency(item.unit_price)} · line {currency(item.line_total)}</div>
                <div className="fk-cart-quantity" aria-label={`Quantity ${item.quantity}`}>
                  <button type="button" aria-label={`Decrease ${item.product_name} quantity`} disabled={busyVariant === item.variant_id} onClick={() => mutate(item.variant_id, () => item.quantity === 1 ? removeFromCart(item.variant_id) : updateQuantity(item.variant_id, item.quantity - 1))}><Minus size={14} /></button>
                  <span>{item.quantity}</span>
                  <button type="button" aria-label={`Increase ${item.product_name} quantity`} disabled={busyVariant === item.variant_id || item.quantity >= item.available_stock} onClick={() => mutate(item.variant_id, () => updateQuantity(item.variant_id, item.quantity + 1))}><Plus size={14} /></button>
                </div>
              </div>
              <button type="button" aria-label={`Remove ${item.product_name}`} disabled={busyVariant === item.variant_id} style={{ color: '#9E9E9E', cursor: 'pointer', background: 'none', border: 'none' }} onClick={() => mutate(item.variant_id, () => removeFromCart(item.variant_id))}><Trash2 size={16} /></button>
            </div>
          ))}
        </div>
        {cartItems.length > 0 && (
          <div className="fk-drawer-footer">
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '14px', fontSize: '15px', fontWeight: '700' }}><span>Subtotal:</span><span>{currency(subtotal)}</span></div>
            <button type="button" className="fk-auth-btn" style={{ width: '100%', margin: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }} onClick={() => { setIsCartOpen(false); onNavigate?.('checkout'); }}>Proceed to Checkout <ArrowRight size={16} /></button>
          </div>
        )}
      </div>
    </div>
  );
}
