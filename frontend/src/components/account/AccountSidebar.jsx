import React from 'react';
import {
  User,
  MapPin,
  Package,
  Heart,
  CreditCard,
  Headphones,
  HelpCircle,
  LogOut,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export function AccountSidebar({
  activeItem = 'complaints',
  onNavigate,
  onOpenOrders,
  onOpenWishlist,
  onToggleChatbot,
}) {
  const { logout } = useAuth();

  const handleLogout = () => {
    logout();
    if (onNavigate) {
      onNavigate('home');
    }
  };

  const menuItems = [
    {
      id: 'profile',
      label: 'Profile Information',
      icon: User,
      action: () => {},
    },
    {
      id: 'address',
      label: 'Address Book',
      icon: MapPin,
      action: () => {},
    },
    {
      id: 'orders',
      label: 'My Orders',
      icon: Package,
      action: () => {
        if (onOpenOrders) onOpenOrders();
      },
    },
    {
      id: 'wishlist',
      label: 'Wishlist',
      icon: Heart,
      action: () => {
        if (onOpenWishlist) onOpenWishlist();
      },
    },
    {
      id: 'payments',
      label: 'Payment Methods',
      icon: CreditCard,
      action: () => {},
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
      id: 'help',
      label: 'Help & Support',
      icon: HelpCircle,
      action: () => {
        if (onToggleChatbot) onToggleChatbot();
      },
    },
    {
      id: 'logout',
      label: 'logout',
      icon: LogOut,
      action: handleLogout,
      isLogout: true,
    },
  ];

  return (
    <aside className="fk-account-sidebar">
      <h2 className="fk-account-sidebar-title">My Account</h2>

      <nav className="fk-account-nav-list" aria-label="Account navigation">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeItem === item.id;

          return (
            <button
              key={item.id}
              className={`fk-account-nav-btn ${isActive ? 'active' : ''} ${item.isLogout ? 'logout' : ''}`}
              onClick={item.action}
              aria-current={isActive ? 'page' : undefined}
            >
              <Icon size={18} strokeWidth={isActive ? 2.4 : 1.9} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Decorative Lifestyle Visual at the bottom matching reference */}
      <div className="fk-sidebar-decor-wrapper">
        <img
          src="/assets/dashboard_sidebar_decor.jpg"
          alt="Flatkart Home Lifestyle"
          className="fk-sidebar-decor-img"
          loading="lazy"
        />
      </div>
    </aside>
  );
}

export default AccountSidebar;
