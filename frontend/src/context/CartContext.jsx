import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useAuth } from './AuthContext';
import { productService } from '../services/productService';
import { cartForOwner, cartQuantity, EMPTY_SERVER_CART } from '../utils/commerceState';

const CartContext = createContext(null);
const LEGACY_WISHLIST_KEY = 'flatkart_wishlist';

function loadWishlist() {
  try {
    const parsed = JSON.parse(localStorage.getItem(LEGACY_WISHLIST_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

export function CartProvider({ children }) {
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const ownerId = isAuthenticated ? user?.id : null;
  const [serverCart, setServerCart] = useState({ ownerId: null, value: EMPTY_SERVER_CART });
  const [wishlistItems, setWishlistItems] = useState(loadWishlist);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isWishlistOpen, setIsWishlistOpen] = useState(false);
  const [cartLoading, setCartLoading] = useState(false);
  const [cartError, setCartError] = useState('');
  const requestVersion = useRef(0);

  const cart = cartForOwner(serverCart, ownerId);
  const cartItems = cart.items;

  const refreshCart = useCallback(async () => {
    const version = ++requestVersion.current;
    if (!ownerId || authLoading) {
      setServerCart({ ownerId: null, value: EMPTY_SERVER_CART });
      setCartLoading(false);
      return EMPTY_SERVER_CART;
    }
    setCartLoading(true);
    setCartError('');
    try {
      const result = await productService.getCart();
      if (version === requestVersion.current) setServerCart({ ownerId, value: result });
      return result;
    } catch (error) {
      if (version === requestVersion.current) {
        setServerCart({ ownerId, value: EMPTY_SERVER_CART });
        setCartError(error.message || 'Could not load your cart.');
      }
      return EMPTY_SERVER_CART;
    } finally {
      if (version === requestVersion.current) setCartLoading(false);
    }
  }, [ownerId, authLoading]);

  useEffect(() => {
    setServerCart({ ownerId: null, value: EMPTY_SERVER_CART });
    if (!authLoading && ownerId) refreshCart();
    else { setCartLoading(false); setCartError(''); }
    return () => { requestVersion.current += 1; };
  }, [ownerId, authLoading, refreshCart]);

  useEffect(() => {
    localStorage.setItem(LEGACY_WISHLIST_KEY, JSON.stringify(wishlistItems));
  }, [wishlistItems]);

  const addToCart = async (product, variant) => {
    if (!ownerId) throw new Error('Sign in to add items to your cart.');
    if (!variant?.id) throw new Error('Choose an available product option first.');
    const result = await productService.addCartItem(product.id, variant.id, 1);
    setServerCart({ ownerId, value: result });
    setCartError('');
    setIsCartOpen(true);
    return result;
  };

  const updateQuantity = async (variantId, quantity) => {
    const result = await productService.updateCartItem(variantId, quantity);
    setServerCart({ ownerId, value: result });
    return result;
  };

  const removeFromCart = async (variantId) => {
    const result = await productService.removeCartItem(variantId);
    setServerCart({ ownerId, value: result });
    return result;
  };

  const toggleWishlist = (product) => {
    setWishlistItems((prev) => prev.some((item) => item.id === product.id)
      ? prev.filter((item) => item.id !== product.id)
      : [...prev, product]);
  };

  return (
    <CartContext.Provider value={{
      cart, cartItems, cartCount: cartQuantity(cart), subtotal: cart.subtotal,
      paymentMethods: cart.payment_methods, cartLoading, cartError, setCartError,
      refreshCart, addToCart, updateQuantity, removeFromCart,
      wishlistItems, toggleWishlist, isCartOpen, setIsCartOpen,
      isWishlistOpen, setIsWishlistOpen,
    }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  return useContext(CartContext);
}
