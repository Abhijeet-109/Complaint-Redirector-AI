import React, { useState } from 'react';
import { Header } from '../components/layout/Header';
import { CategoryNav } from '../components/layout/CategoryNav';
import { HeroBanner } from '../components/home/HeroBanner';
import { CategorySection } from '../components/home/CategorySection';
import { FeaturedProducts } from '../components/home/FeaturedProducts';
import { ChatbotWidget } from '../components/chatbot/ChatbotWidget';
import { AuthModal } from '../components/common/AuthModal';
import { CartDrawer } from '../components/common/CartDrawer';
import { WishlistDrawer } from '../components/common/WishlistDrawer';
import { OrdersModal } from '../components/common/OrdersModal';

export function Home() {
  const [activeCategory, setActiveCategory] = useState('Home');
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [isOrdersOpen, setIsOrdersOpen] = useState(false);
  const [isChatbotOpen, setIsChatbotOpen] = useState(false);

  const handleSelectCategory = (catName) => {
    setActiveCategory(catName);
  };

  const handleSelectProduct = (product) => {
    // If user clicks a product, can open assistant or details
  };

  return (
    <div className="fk-page-container">
      {/* 1. Main Header */}
      <Header
        onOpenAuth={() => setIsAuthOpen(true)}
        onOpenOrders={() => setIsOrdersOpen(true)}
        onSelectProduct={handleSelectProduct}
      />

      {/* 2. Secondary Navigation Bar */}
      <CategoryNav
        activeCategory={activeCategory}
        onSelectCategory={handleSelectCategory}
      />

      {/* 3. Hero Banner */}
      <HeroBanner />

      {/* 4. Shop by Category (8 cards) */}
      <CategorySection onSelectCategory={handleSelectCategory} />

      {/* 5. Best of Flatkart (4 featured cards) */}
      <FeaturedProducts onSelectProduct={handleSelectProduct} />

      {/* 6. Floating Help Widget */}
      <ChatbotWidget
        isOpen={isChatbotOpen}
        onToggle={() => setIsChatbotOpen(!isChatbotOpen)}
      />

      {/* Modals & Drawers */}
      <AuthModal
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
      />

      <CartDrawer />
      <WishlistDrawer />

      <OrdersModal
        isOpen={isOrdersOpen}
        onClose={() => setIsOrdersOpen(false)}
        onOpenChatbot={() => setIsChatbotOpen(true)}
      />
    </div>
  );
}

export default Home;
