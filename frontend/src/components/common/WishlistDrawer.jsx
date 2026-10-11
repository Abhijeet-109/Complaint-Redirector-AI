import React from 'react';
import { X, ShoppingBag, Trash2 } from 'lucide-react';
import { useCart } from '../../context/CartContext';

export function WishlistDrawer() {
  const { wishlistItems, toggleWishlist, addToCart, isWishlistOpen, setIsWishlistOpen } = useCart();

  if (!isWishlistOpen) return null;

  return (
    <div className="fk-drawer-overlay" onClick={() => setIsWishlistOpen(false)}>
      <div className="fk-drawer" onClick={(e) => e.stopPropagation()}>
        <div className="fk-drawer-header">
          <h3 style={{ fontSize: '17px', fontWeight: '700' }}>
            My Wishlist ({wishlistItems.length})
          </h3>
          <button
            style={{ color: '#FFFFFF', background: 'none', border: 'none', cursor: 'pointer' }}
            onClick={() => setIsWishlistOpen(false)}
          >
            <X size={20} />
          </button>
        </div>

        <div className="fk-drawer-content">
          {wishlistItems.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--fk-text-muted)' }}>
              No items in your wishlist yet.
            </div>
          ) : (
            wishlistItems.map((item) => (
              <div key={item.id} className="fk-drawer-item">
                <img src={item.image} alt={item.name} className="fk-drawer-item-img" />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '13.5px', fontWeight: '700', color: 'var(--fk-text-primary)' }}>
                    {item.brand}
                  </div>
                  <div style={{ fontSize: '12.5px', color: 'var(--fk-text-muted)' }}>
                    {item.name}
                  </div>
                  <div style={{ fontSize: '13.5px', fontWeight: '700', color: 'var(--fk-price-coral)', marginTop: '2px' }}>
                    {item.price}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    className="fk-add-cart-btn"
                    style={{ fontSize: '11px', padding: '4px 8px' }}
                    onClick={() => {
                      addToCart(item);
                      toggleWishlist(item);
                    }}
                  >
                    Move to Cart
                  </button>
                  <button
                    style={{ color: '#9E9E9E', cursor: 'pointer', background: 'none', border: 'none' }}
                    onClick={() => toggleWishlist(item)}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
