import React, { useState, useRef, useEffect } from 'react';
import { Search, ShoppingCart, User, Heart, Package, LogOut, LogIn, ChevronDown } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useCart } from '../../context/CartContext';
import { FEATURED_PRODUCTS } from '../../data/demoProducts';

export function Header({ onOpenAuth, onOpenOrders, onSelectProduct }) {
  const { user, logout, isAuthenticated } = useAuth();
  const { cartCount, setIsCartOpen, setIsWishlistOpen } = useCart();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  
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
      const filtered = FEATURED_PRODUCTS.filter(
        (p) =>
          p.brand.toLowerCase().includes(query.toLowerCase()) ||
          p.name.toLowerCase().includes(query.toLowerCase()) ||
          p.variant.toLowerCase().includes(query.toLowerCase())
      );
      setSearchResults(filtered);
      setIsSearchOpen(true);
    } else {
      setSearchResults([]);
      setIsSearchOpen(false);
    }
  };

  return (
    <header className="fk-header">
      {/* Brand Logo */}
      <div className="fk-header-brand" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
        FLATKART
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
          />
          <div className="fk-header-search-icon">
            <Search size={18} strokeWidth={2.2} />
          </div>
        </div>

        {/* Live Search Suggestions Dropdown */}
        {isSearchOpen && searchResults.length > 0 && (
          <div className="fk-search-results-dropdown">
            {searchResults.map((product) => (
              <div
                key={product.id}
                className="fk-search-result-item"
                onClick={() => {
                  setIsSearchOpen(false);
                  if (onSelectProduct) onSelectProduct(product);
                }}
              >
                <img src={product.image} alt={product.name} className="fk-search-result-thumb" />
                <div>
                  <div style={{ fontSize: '13px', fontWeight: '700', color: 'var(--fk-text-primary)' }}>
                    {product.brand} - {product.name}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--fk-text-muted)' }}>
                    {product.variant} &bull; <span style={{ fontWeight: '600', color: 'var(--fk-price-coral)' }}>{product.price}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Right Navigation & Action Items */}
      <div className="fk-header-actions">
        {/* User / My Account dropdown */}
        <div style={{ position: 'relative' }} ref={userMenuRef}>
          <button
            className="fk-header-user-btn"
            onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
          >
            <span className="fk-header-user-greeting">
              Hello, {user?.name ? user.name.split(' ')[0] : 'Arjun'}
            </span>
            <span className="fk-header-user-name">
              My Account
            </span>
          </button>

          {isUserMenuOpen && (
            <div className="fk-user-dropdown">
              <div style={{ padding: '8px 16px 10px', borderBottom: '1px solid #ECE8DE' }}>
                <div style={{ fontSize: '13.5px', fontWeight: '700', color: 'var(--fk-text-primary)' }}>
                  {user?.name || 'Arjun'}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--fk-text-muted)' }}>
                  {user?.email || 'arjun@flatkart.com'}
                </div>
                {user?.role && (
                  <span style={{
                    display: 'inline-block',
                    marginTop: '4px',
                    fontSize: '11px',
                    fontWeight: '700',
                    textTransform: 'uppercase',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    backgroundColor: 'var(--fk-navigation)',
                    color: 'var(--fk-olive)',
                  }}>
                    {user.role}
                  </span>
                )}
              </div>

              <button
                className="fk-user-dropdown-item"
                onClick={() => {
                  setIsUserMenuOpen(false);
                  onOpenOrders();
                }}
              >
                <Package size={16} /> My Orders & Complaints
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

              {isAuthenticated ? (
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
              ) : (
                <button
                  className="fk-user-dropdown-item"
                  onClick={() => {
                    setIsUserMenuOpen(false);
                    onOpenAuth();
                  }}
                >
                  <LogIn size={16} /> Switch Account / Login
                </button>
              )}
            </div>
          )}
        </div>

        {/* Orders */}
        <button className="fk-header-nav-link" onClick={onOpenOrders}>
          Orders
        </button>

        {/* Wishlist */}
        <button
          className="fk-header-nav-link wishlist-link"
          onClick={() => setIsWishlistOpen(true)}
        >
          Wishlist
        </button>

        {/* Cart */}
        <button
          className="fk-header-cart-btn"
          onClick={() => setIsCartOpen(true)}
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
