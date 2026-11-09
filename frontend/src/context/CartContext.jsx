import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useAuth } from './AuthContext';
import { productService } from '../services/productService';
import { accountService } from '../services/accountService';
import { cartForOwner, cartQuantity, EMPTY_SERVER_CART } from '../utils/commerceState';

const CartContext = createContext(null);
const GUEST_WISHLIST_KEY = 'flatkart_guest_wishlist';

function loadWishlist() {
  try {
    const parsed = JSON.parse(localStorage.getItem(GUEST_WISHLIST_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

export function CartProvider({ children }) {
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const ownerId = isAuthenticated ? user?.id : null;
  const [serverCart, setServerCart] = useState({ ownerId: null, value: EMPTY_SERVER_CART });
  const [serverWishlist, setServerWishlist] = useState({ ownerId: null, value: [] });
  const [guestWishlist, setGuestWishlist] = useState(loadWishlist);
  const [wishlistError, setWishlistError] = useState('');
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isWishlistOpen, setIsWishlistOpen] = useState(false);
  const [cartLoading, setCartLoading] = useState(false);
  const [cartError, setCartError] = useState('');
  const requestVersion = useRef(0);

  const cart = cartForOwner(serverCart, ownerId);
  const cartItems = cart.items;
  const wishlistItems = ownerId === null ? guestWishlist : (serverWishlist.ownerId === ownerId ? serverWishlist.value : []);

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
    setServerWishlist({ ownerId: null, value: [] });
    if (!authLoading && ownerId) refreshCart();
    else { setCartLoading(false); setCartError(''); }
    return () => { requestVersion.current += 1; };
  }, [ownerId, authLoading, refreshCart]);

  useEffect(() => {
    localStorage.setItem(GUEST_WISHLIST_KEY, JSON.stringify(guestWishlist));
  }, [guestWishlist]);

  useEffect(() => {
    if (!ownerId || authLoading) return undefined;
    let active = true;
    const load = async () => {
      try {
        let saved = await accountService.wishlist();
        const guests = loadWishlist();
        if (guests.length) {
          await Promise.all(guests.filter((item) => item?.id).map((item) => accountService.addWishlist(item.id).catch(() => null)));
          localStorage.removeItem(GUEST_WISHLIST_KEY);
          saved = await accountService.wishlist();
        }
        if (active) { setServerWishlist({ ownerId, value: saved }); setGuestWishlist([]); setWishlistError(''); }
      } catch (error) {
        if (active) setWishlistError(error.message || 'Could not load your wishlist.');
      }
    };
    load();
    return () => { active = false; };
  }, [ownerId, authLoading]);

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

  const toggleWishlist = async (product) => {
    setWishlistError('');
    if (!ownerId) {
      setGuestWishlist((prev) => prev.some((item) => item.id === product.id)
        ? prev.filter((item) => item.id !== product.id) : [...prev, product]);
      return;
    }
    try {
      const exists = serverWishlist.ownerId === ownerId && serverWishlist.value.some((item) => item.id === product.id);
      if (exists) await accountService.removeWishlist(product.id);
      else await accountService.addWishlist(product.id);
      const value = await accountService.wishlist();
      setServerWishlist({ ownerId, value });
    } catch (error) {
      setWishlistError(error.message || 'Could not update your wishlist.');
    }
  };

  return (
    <CartContext.Provider value={{
      cart, cartItems, cartCount: cartQuantity(cart), subtotal: cart.subtotal,
      paymentMethods: cart.payment_methods, cartLoading, cartError, setCartError,
      refreshCart, addToCart, updateQuantity, removeFromCart,
      wishlistItems, wishlistError, toggleWishlist, isCartOpen, setIsCartOpen,
      isWishlistOpen, setIsWishlistOpen,
    }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  return useContext(CartContext);
}
