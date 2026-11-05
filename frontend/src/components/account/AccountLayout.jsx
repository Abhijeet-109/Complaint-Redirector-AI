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
 *     - scrollable={false}: completely non-scrolling wrapper (used by MyConversations where only chat messages scroll)
 *     - scrollable={true}: independently scrollable right pane (used by MyComplaints)
 * Fits strictly within 100dvh with ZERO document-level vertical scrolling.
 */
export function AccountLayout({
  activeItem = 'conversations',
  onNavigate,
  onOpenOrders,
  onOpenWishlist,
  onToggleChatbot,
  activeCategory = 'Home',
  onSelectCategory,
  scrollable = false,
  children,
}) {
  return (
    <div className="fk-account-layout">
      {/* 1. Website Header (Fixed height, flex-shrink: 0) */}
      <Header
        onNavigate={onNavigate}
        onOpenOrders={onOpenOrders}
      />

      {/* 2. Category Navigation (Fixed height, flex-shrink: 0) */}
      <CategoryNav
        activeCategory={activeCategory}
        onSelectCategory={
          onSelectCategory ||
          ((cat) => {
            if (cat.toLowerCase() === 'home' && onNavigate) onNavigate('home');
          })
        }
      />

      {/* 3. Viewport-Constrained Account Content Area (100dvh - 106px) */}
      <div className="fk-account-content-area">
        {/* Left Column: Fixed-width Account Sidebar (Stationary) */}
        <AccountSidebar
          activeItem={activeItem}
          onNavigate={onNavigate}
          onOpenOrders={onOpenOrders}
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
