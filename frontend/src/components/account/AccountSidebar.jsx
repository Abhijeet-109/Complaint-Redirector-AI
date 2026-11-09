import React, { useEffect, useState } from 'react';
import {
  User,
  MapPin,
  Package,
  Heart,
  CreditCard,
  Headphones,
  MessageSquare,
  HelpCircle,
  LogOut,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { getSupportTickets } from '../../services/supportTicketCache';

export function AccountSidebar({
  activeItem = 'conversations',
  onNavigate,
  onOpenWishlist,
  onToggleChatbot,
  showDecor = false,
}) {
  const { logout, user, isAuthenticated } = useAuth();
  const [ticketCount, setTicketCount] = useState(null);

  useEffect(() => {
    let alive = true;
    if (!isAuthenticated || !user?.id) { setTicketCount(null); return () => { alive = false; }; }
    setTicketCount(null);
    getSupportTickets(user.id).then((tickets) => { if (alive) setTicketCount(tickets.length); }).catch(() => { if (alive) setTicketCount(null); });
    return () => { alive = false; };
  }, [isAuthenticated, user?.id]);

  const handleLogout = () => {
    logout();
    if (onNavigate) {
      onNavigate('home');
    }
  };

  const navItems = [
    {
      id: 'profile',
      label: 'Profile Information',
      icon: User,
      action: () => onNavigate?.('account', 'profile'),
    },
    {
      id: 'address',
      label: 'Address Book',
      icon: MapPin,
      action: () => onNavigate?.('account', 'address'),
    },
    {
      id: 'orders',
      label: 'My Orders',
      icon: Package,
      action: () => onNavigate?.('account', 'orders'),
    },
    {
      id: 'support-tickets',
      label: `My Support Tickets${ticketCount == null ? '' : ` (${ticketCount})`}`,
      icon: Headphones,
      action: () => onNavigate?.('account', 'support-tickets'),
    },
    {
      id: 'wishlist',
      label: 'Wishlist',
      icon: Heart,
      action: () => {
        if (onOpenWishlist) onOpenWishlist();
        else onNavigate?.('account', 'wishlist');
      },
    },
    {
      id: 'payments',
      label: 'Payment Methods',
      icon: CreditCard,
      action: () => onNavigate?.('account', 'payments'),
    },
    {
      id: 'complaints',
      label: 'My Complaints',
      icon: Headphones,
      action: () => {
        if (onNavigate) onNavigate('my-complaints');
      },
    },
    {
      id: 'conversations',
      label: 'My Conversations',
      icon: MessageSquare,
      action: () => {
        if (onNavigate) onNavigate('my-conversations');
      },
    },
    {
      id: 'help',
      label: 'Help & Support',
      icon: HelpCircle,
      action: () => {
        if (onToggleChatbot) onToggleChatbot();
        else onNavigate?.('my-conversations');
      },
    },
  ];

  return (
    <aside className="fk-account-sidebar">
      <h2 className="fk-account-sidebar-title">My Account</h2>

      <nav className="fk-account-nav-list" aria-label="Account navigation">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeItem === item.id;

          return (
            <button
              key={item.id}
              className={`fk-account-nav-btn ${isActive ? 'active' : ''}`}
              onClick={item.action}
              aria-current={isActive ? 'page' : undefined}
            >
              <Icon size={18} strokeWidth={isActive ? 2.2 : 1.8} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Logout button positioned towards bottom matching screenshot */}
      <div className="fk-account-sidebar-logout-wrapper">
        <button
          className="fk-account-nav-btn logout"
          onClick={handleLogout}
          aria-label="Logout"
        >
          <LogOut size={18} strokeWidth={1.8} />
          <span>Logout</span>
        </button>
      </div>

      {showDecor && (
        <div className="fk-sidebar-decor-wrapper">
          <img
            src="/assets/dashboard_sidebar_decor.jpg"
            alt="Flatkart Home Lifestyle"
            className="fk-sidebar-decor-img"
            loading="lazy"
          />
        </div>
      )}
    </aside>
  );
}

export default AccountSidebar;
