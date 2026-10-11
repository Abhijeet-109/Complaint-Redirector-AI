import React, { useState } from 'react';
import { Header } from '../components/layout/Header';
import { CategoryNav } from '../components/layout/CategoryNav';
import { HeroBanner } from '../components/home/HeroBanner';
import { CategorySection } from '../components/home/CategorySection';
import { FeaturedProducts } from '../components/home/FeaturedProducts';
import { TrendingNow } from '../components/home/TrendingNow';
import { LifestyleSection } from '../components/home/LifestyleSection';
import { FreshArrivals } from '../components/home/FreshArrivals';
import { FeaturedCollectionBanner } from '../components/home/FeaturedCollectionBanner';
import { PopularBrands } from '../components/home/PopularBrands';
import { WhyFlatkart } from '../components/home/WhyFlatkart';
import { ChatbotWidget } from '../components/chatbot/ChatbotWidget';
import { CartDrawer } from '../components/common/CartDrawer';
import { WishlistDrawer } from '../components/common/WishlistDrawer';
import { OrdersModal } from '../components/common/OrdersModal';

export function Home({ onNavigate }) {
  const [activeCategory, setActiveCategory] = useState('Home');
  const [isOrdersOpen, setIsOrdersOpen] = useState(false);
  const [isChatbotOpen, setIsChatbotOpen] = useState(false);

  const handleSelectCategory = (catName) => {
    setActiveCategory(catName);
    window.scrollTo({ top: 380, behavior: 'smooth' });
  };

  const handleSelectProduct = (product) => {
    // Can trigger assistant or drawer
  };

  return (
    <div className="fk-page-container">
      {/* 1. Main Header */}
      <Header
        onNavigate={onNavigate}
        onOpenOrders={() => setIsOrdersOpen(true)}
        onSelectProduct={handleSelectProduct}
      />

      {/* 2. Secondary Navigation Bar */}
      <CategoryNav
        activeCategory={activeCategory}
        onSelectCategory={handleSelectCategory}
      />

      {/* 3. Hero Carousel Banner */}
      <HeroBanner onExplore={handleSelectCategory} />

      {/* 4. Shop by Category (8 cards) */}
      <CategorySection onSelectCategory={handleSelectCategory} />

      {/* 5. Best of Flatkart (4 featured cards) */}
      <FeaturedProducts onSelectProduct={handleSelectProduct} />

      {/* 6. Section A: Trending Now */}
      <TrendingNow onSelectProduct={handleSelectProduct} />

      {/* 7. Section B: Shop by Lifestyle (Find Your Style) */}
      <LifestyleSection onSelectCategory={handleSelectCategory} />

      {/* 8. Section C: Fresh Arrivals */}
      <FreshArrivals onSelectProduct={handleSelectProduct} />

      {/* 9. Section D: Featured Collection Editorial Banner */}
      <FeaturedCollectionBanner onExplore={handleSelectCategory} />

      {/* 10. Section E: Popular Brands (Brands to Know) */}
      <PopularBrands onSelectBrand={(brand) => console.log('Brand selected:', brand)} />

      {/* 11. Section F: Why Flatkart (Trust and Support) */}
      <WhyFlatkart />

      {/* 12. Floating Help / AI Assistant Widget */}
      <ChatbotWidget
        isOpen={isChatbotOpen}
        onToggle={() => setIsChatbotOpen(!isChatbotOpen)}
        onNavigate={onNavigate}
      />

      {/* Drawers & Modals */}
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
