import React from 'react';
import { Header } from '../layout/Header';
import { CategoryNav } from '../layout/CategoryNav';
import { AccountSidebar } from './AccountSidebar';

/**
 * Universal Account Layout Component
 * Provides a viewport-constrained, independent two-column architecture:
 * - Header & Category Navigation pinned at top (stationary)
 * - Stationary Account Sidebar (220px) on left (no page-level movement)
 * - Main content area on right:
 *     - scrollable={false}: non-scrolling wrapper (MyConversations chat messages scroll internally)
 *     - scrollable={true}: scrollable right pane with visually hidden scrollbar
 * Fits strictly within 100dvh with ZERO document-level vertical scrolling.
 */
export function AccountLayout({
  activeItem = 'conversations',
  onNavigate,
  onOpenWishlist,
  onToggleChatbot,
  activeCategory = 'Home',
  onSelectCategory,
  scrollable = false,
  extraNavAction,
  children,
}) {
  return (
    <div className="fk-account-layout">
      {/* 1. Website Header (Original dark green navbar) */}
      <Header
        onNavigate={onNavigate}
      />

      {/* 2. Secondary Navigation (Home, Back to orders, Filter, Pincode) */}
      <CategoryNav
        activeCategory={activeCategory}
        onNavigate={onNavigate}
        extraRightAction={extraNavAction}
        onSelectCategory={
          onSelectCategory ||
          ((cat) => {
            if (cat.toLowerCase() === 'home' && onNavigate) onNavigate('home');
          })
        }
      />

      {/* 3. Viewport-Constrained Account Content Area */}
      <div className="fk-account-content-area">
        {/* Left Column: Fixed-width Account Sidebar (Stationary) */}
        <AccountSidebar
          activeItem={activeItem}
          onNavigate={onNavigate}
          onOpenWishlist={onOpenWishlist}
          onToggleChatbot={onToggleChatbot}
        />

        {/* Right Column: Main Content Area */}
        <main className={`fk-account-main-area ${scrollable ? 'is-scrollable' : 'no-scroll'}`}>
          {children}
        </main>
      </div>
    </div>
  );
}

export default AccountLayout;
