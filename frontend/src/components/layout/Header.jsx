import React, { useState, useRef, useEffect } from 'react';
import { Search, ShoppingCart, Package, Heart, LogOut, LogIn, ChevronDown, MessageSquare, UserRound, Headphones } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useCart } from '../../context/CartContext';
import { productService } from '../../services/productService';

export function Header({ onOpenAuth, onSelectProduct, onNavigate }) {
  const { user, logout, isAuthenticated } = useAuth();
  const { cartCount, setIsCartOpen, setIsWishlistOpen } = useCart();

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState('');
  const requestSequence = useRef(0);

  const searchRef = useRef(null);
  const userMenuRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (searchRef.current && !searchRef.current.contains(e.target)) {
        setIsSearchOpen(false);
      }
      if (userMenuRef.current && !userMenuRef.current.contains(e.target)) {
        setIsUserMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSearchChange = (e) => {
    const query = e.target.value;
    setSearchQuery(query);
    if (query.trim().length > 0) {
      setSearchResults([]);
      setSearchError('');
      setSearchLoading(true);
      setIsSearchOpen(true);
    } else {
      setSearchResults([]);
      setIsSearchOpen(false);
      setSearchLoading(false);
    }
  };

  useEffect(() => {
    const term = searchQuery.trim();
    if (!term) return undefined;
    const sequence = ++requestSequence.current;
    const timer = setTimeout(() => {
      productService.search(term, 8)
        .then((results) => { if (sequence === requestSequence.current) setSearchResults(results); })
        .catch((error) => { if (sequence === requestSequence.current) setSearchError(error.message || 'Search is unavailable.'); })
        .finally(() => { if (sequence === requestSequence.current) setSearchLoading(false); });
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleNavigate = (page, value) => {
    if (onNavigate) {
      onNavigate(page, value);
    } else if (page === 'login' || page === 'register') {
      if (onOpenAuth) onOpenAuth(page);
    }
  };

  const handleOrdersClick = () => {
    if (isAuthenticated) {
      handleNavigate('account', 'orders');
    } else {
      handleNavigate('login');
    }
  };

  return (
    <header className="fk-header">
      {/* Brand Logo with Shopping Cart Icon before FLATKART */}
      <div
        className="fk-header-brand"
        onClick={() => {
          if (onNavigate) onNavigate('home');
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            if (onNavigate) onNavigate('home');
          }
        }}
        style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}
      >
        <ShoppingCart size={22} strokeWidth={2.4} color="#FFFFFF" />
        <span>FLATKART</span>
      </div>

      {/* Search Bar */}
      <div className="fk-header-search-container" ref={searchRef}>
        <div className="fk-header-search-box">
          <input
            type="text"
            className="fk-header-search-input"
            placeholder="Search for products, brands and more"
            value={searchQuery}
            onChange={handleSearchChange}
            onFocus={() => searchQuery.trim() && setIsSearchOpen(true)}
            aria-label="Search products"
          />
          <div className="fk-header-search-icon">
            <Search size={18} strokeWidth={2.2} />
          </div>
        </div>

        {/* Live Search Suggestions Dropdown */}
        {isSearchOpen && searchQuery.trim() && (
          <div className="fk-search-results-dropdown">
            {searchLoading && <div className="fk-search-result-message">Searching products…</div>}
            {searchError && <div className="fk-search-result-message" role="alert">{searchError}</div>}
            {!searchLoading && !searchError && searchResults.length === 0 && <div className="fk-search-result-message">No matching products found.</div>}
            {searchResults.map((product) => (
              <div
                key={product.id}
                className="fk-search-result-item"
                onClick={() => {
                  setIsSearchOpen(false);
                  if (onSelectProduct) onSelectProduct(product);
                }}
              >
                <img src={product.images?.[0]?.url || '/assets/cat_men_hi.jpg'} alt={product.name} className="fk-search-result-thumb" />
                <div>
                  <div style={{ fontSize: '13px', fontWeight: '700', color: 'var(--fk-text-primary)' }}>
                    {product.brand} - {product.name}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--fk-text-muted)' }}>
                    {product.variants?.[0]?.name || product.category?.name} &bull; <span style={{ fontWeight: '600', color: 'var(--fk-price-coral)' }}>{product.variants?.[0] ? `₹${Number(product.variants[0].price).toLocaleString('en-IN')}` : ''}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Right Navigation & Action Items */}
      <div className="fk-header-actions">
        {/* Conditional Account Area: Guest vs Authenticated */}
        {isAuthenticated && user ? (
          <div style={{ position: 'relative' }} ref={userMenuRef}>
            <button
              className="fk-header-user-btn"
              onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
              aria-expanded={isUserMenuOpen}
              aria-label="User Account Menu"
            >
              <span className="fk-header-user-greeting">
                Hello, {user.name ? user.name.split(' ')[0] : 'User'}
              </span>
              <span className="fk-header-user-name">
                My Account
              </span>
            </button>

            {isUserMenuOpen && (
              <div className="fk-user-dropdown">
                <div style={{ padding: '8px 16px 10px', borderBottom: '1px solid #ECE8DE' }}>
                  <div style={{ fontSize: '13.5px', fontWeight: '700', color: 'var(--fk-text-primary)' }}>
                    {user.name}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--fk-text-muted)' }}>
                    {user.email}
                  </div>
                  {user.role && (
                    <span
                      style={{
                        display: 'inline-block',
                        marginTop: '4px',
                        fontSize: '11px',
                        fontWeight: '700',
                        textTransform: 'uppercase',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        backgroundColor: 'var(--fk-navigation)',
                        color: 'var(--fk-olive)',
                      }}
                    >
                      {user.role}
                    </span>
                  )}
                </div>

                <button
                  className="fk-user-dropdown-item"
                  onClick={() => {
                    setIsUserMenuOpen(false);
                    if (user?.role === 'super_admin') {
                      handleNavigate('super-admin-dashboard');
                    } else if (user?.role === 'admin') {
                      handleNavigate('admin-dashboard');
                    } else if (user?.role === 'department_handler') {
                      handleNavigate('handler-dashboard');
                    } else {
                      handleNavigate('account', 'profile');
                    }
                  }}
                >
                  <UserRound size={16} />{' '}
                  {user?.role === 'super_admin'
                    ? 'Super Admin Portal'
                    : user?.role === 'admin'
                    ? 'Admin Portal'
                    : user?.role === 'department_handler'
                    ? 'Handler Dashboard'
                    : 'My Account'}
                </button>

                {user?.role === 'user' && <>
                  <button className="fk-user-dropdown-item" onClick={() => { setIsUserMenuOpen(false); handleOrdersClick(); }}><Package size={16} /> My Orders</button>
                  <button className="fk-user-dropdown-item" onClick={() => { setIsUserMenuOpen(false); handleNavigate('my-complaints'); }}><Headphones size={16} /> My Complaints</button>
                </>}

                <button
                  className="fk-user-dropdown-item"
                  onClick={() => {
                    setIsUserMenuOpen(false);
                    handleNavigate('my-conversations');
                  }}
                >
                  <MessageSquare size={16} /> My Conversations
                </button>

                <button
                  className="fk-user-dropdown-item"
                  onClick={() => {
                    setIsUserMenuOpen(false);
                    setIsWishlistOpen(true);
                  }}
                >
                  <Heart size={16} /> My Wishlist
                </button>

                <div className="fk-user-dropdown-divider" />

                <button
                  className="fk-user-dropdown-item"
                  onClick={() => {
                    setIsUserMenuOpen(false);
                    handleNavigate('login');
                  }}
                >
                  <LogIn size={16} /> Switch Account
                </button>

                <button
                  className="fk-user-dropdown-item"
                  style={{ color: '#D32F2F' }}
                  onClick={() => {
                    setIsUserMenuOpen(false);
                    logout();
                  }}
                >
                  <LogOut size={16} /> Sign Out
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="fk-header-guest-auth" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <button
              className="fk-header-nav-link"
              onClick={() => handleNavigate('login')}
              aria-label="Login to your account"
              style={{ fontWeight: '600' }}
            >
              Login
            </button>
            <button
              className="fk-header-nav-link"
              onClick={() => handleNavigate('register')}
              aria-label="Create a new account"
              style={{
                color: 'var(--fk-gold)',
                fontWeight: '700',
                padding: '4px 10px',
                borderRadius: '4px',
                border: '1px solid rgba(194, 161, 90, 0.45)',
                backgroundColor: 'rgba(194, 161, 90, 0.08)',
              }}
            >
              Register
            </button>
          </div>
        )}

        {/* Orders */}
        <button
          className="fk-header-nav-link"
          onClick={handleOrdersClick}
          aria-label="Orders and Complaints"
        >
          Orders
        </button>

        {/* Wishlist */}
        <button
          className="fk-header-nav-link wishlist-link"
          onClick={() => setIsWishlistOpen(true)}
          aria-label="Wishlist"
        >
          Wishlist
        </button>

        {/* Functional Cart Button */}
        <button
          className="fk-header-cart-btn"
          onClick={() => setIsCartOpen(true)}
          aria-label="Shopping Cart"
        >
          <div className="fk-cart-icon-wrapper">
            <ShoppingCart size={20} strokeWidth={2.2} />
            {cartCount > 0 && <span className="fk-cart-badge">{cartCount}</span>}
          </div>
          <span>Cart</span>
        </button>
      </div>
    </header>
  );
}

export default Header;
