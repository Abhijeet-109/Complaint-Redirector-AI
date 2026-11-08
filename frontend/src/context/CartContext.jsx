import React, { createContext, useContext, useState, useEffect } from 'react';

const CartContext = createContext(null);

const LEGACY_CART_KEY = 'flatkart_cart';
const LEGACY_WISHLIST_KEY = 'flatkart_wishlist';
const CART_CLEAN_FLAG = 'flatkart_cart_cleaned_v1';

function loadCleanCart() {
  if (!localStorage.getItem(CART_CLEAN_FLAG)) {
    localStorage.removeItem(LEGACY_CART_KEY);
    localStorage.removeItem(LEGACY_WISHLIST_KEY);
    localStorage.setItem(CART_CLEAN_FLAG, '1');
  }
  return [];
}

export function CartProvider({ children }) {
  const [cartItems, setCartItems] = useState(loadCleanCart);
  const [wishlistItems, setWishlistItems] = useState([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isWishlistOpen, setIsWishlistOpen] = useState(false);

  useEffect(() => {
    localStorage.setItem(LEGACY_CART_KEY, JSON.stringify(cartItems));
  }, [cartItems]);

  useEffect(() => {
    localStorage.setItem(LEGACY_WISHLIST_KEY, JSON.stringify(wishlistItems));
  }, [wishlistItems]);

  const addToCart = (product) => {
    setCartItems((prev) => {
      const existing = prev.find((item) => item.id === product.id);
      if (existing) {
        return prev.map((item) =>
          item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [...prev, { ...product, quantity: 1 }];
    });
    setIsCartOpen(true);
  };

  const removeFromCart = (productId) => {
    setCartItems((prev) => prev.filter((item) => item.id !== productId));
  };

  const toggleWishlist = (product) => {
    setWishlistItems((prev) => {
      const exists = prev.some((item) => item.id === product.id);
      if (exists) {
        return prev.filter((item) => item.id !== product.id);
      }
      return [...prev, product];
    });
  };

  const cartCount = cartItems.reduce((acc, item) => acc + item.quantity, 0);

  return (
    <CartContext.Provider
      value={{
        cartItems,
        wishlistItems,
        cartCount,
        addToCart,
        removeFromCart,
        toggleWishlist,
        isCartOpen,
        setIsCartOpen,
        isWishlistOpen,
        setIsWishlistOpen,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  return useContext(CartContext);
}
