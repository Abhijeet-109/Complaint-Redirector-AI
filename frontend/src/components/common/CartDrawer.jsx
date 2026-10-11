import React from 'react';
import { X, Trash2, ArrowRight } from 'lucide-react';
import { useCart } from '../../context/CartContext';

export function CartDrawer() {
  const { cartItems, removeFromCart, isCartOpen, setIsCartOpen } = useCart();

  if (!isCartOpen) return null;

  const total = cartItems.reduce((sum, item) => sum + item.rawPrice * item.quantity, 0);

  return (
    <div className="fk-drawer-overlay" onClick={() => setIsCartOpen(false)}>
      <div className="fk-drawer" onClick={(e) => e.stopPropagation()}>
        <div className="fk-drawer-header">
          <h3 style={{ fontSize: '17px', fontWeight: '700' }}>
            Shopping Cart ({cartItems.reduce((acc, i) => acc + i.quantity, 0)})
          </h3>
          <button
            style={{ color: '#FFFFFF', background: 'none', border: 'none', cursor: 'pointer' }}
            onClick={() => setIsCartOpen(false)}
          >
            <X size={20} />
          </button>
        </div>

        <div className="fk-drawer-content">
          {cartItems.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--fk-text-muted)' }}>
              Your cart is currently empty.
            </div>
          ) : (
            cartItems.map((item) => (
              <div key={item.id} className="fk-drawer-item">
                <img src={item.image} alt={item.name} className="fk-drawer-item-img" />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '13.5px', fontWeight: '700', color: 'var(--fk-text-primary)' }}>
                    {item.brand}
                  </div>
                  <div style={{ fontSize: '12.5px', color: 'var(--fk-text-muted)' }}>
                    {item.name} ({item.variant})
                  </div>
                  <div style={{ fontSize: '13.5px', fontWeight: '700', color: 'var(--fk-price-coral)', marginTop: '2px' }}>
                    {item.price} &times; {item.quantity}
                  </div>
                </div>
                <button
                  style={{ color: '#9E9E9E', cursor: 'pointer', background: 'none', border: 'none' }}
                  onClick={() => removeFromCart(item.id)}
                  title="Remove item"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))
          )}
        </div>

        {cartItems.length > 0 && (
          <div className="fk-drawer-footer">
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '14px', fontSize: '15px', fontWeight: '700' }}>
              <span>Subtotal:</span>
              <span>₹{total.toLocaleString('en-IN')}</span>
            </div>
            <button
              className="fk-auth-btn"
              style={{ width: '100%', margin: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
              onClick={() => {
                alert('Order placed successfully! Check "Orders" to view details and issue tracking.');
                setIsCartOpen(false);
              }}
            >
              Proceed to Checkout <ArrowRight size={16} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
