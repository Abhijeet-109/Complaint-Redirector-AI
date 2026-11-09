import React, { useEffect, useMemo, useState } from 'react';
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
import { useAuth } from '../context/AuthContext';
import { isCustomerRole } from '../utils/roleAccess';
import { Footer } from '../components/layout/Footer';
import { getHomeCatalogue, getHomeCatalogueSnapshot } from '../services/productService';
import { ProductGrid } from '../components/products/ProductGrid';

const flattenCategories = (rows) => rows.flatMap((row) => [row, ...flattenCategories(row.children || [])]);
const categoryTreeIds = (category) => [category.id, ...(category.children || []).flatMap(categoryTreeIds)];

export function Home({ onNavigate }) {
  const { user } = useAuth();
  const [activeCategory, setActiveCategory] = useState('Home');
  const [isChatbotOpen, setIsChatbotOpen] = useState(false);
  const [catalogueSnapshot, setCatalogueSnapshot] = useState(getHomeCatalogueSnapshot);
  const [catalogue, setCatalogue] = useState(() => catalogueSnapshot?.products || []);
  const [categories, setCategories] = useState(() => catalogueSnapshot?.categories || []);
  const [catalogueLoading, setCatalogueLoading] = useState(() => !catalogueSnapshot);
  const [catalogueError, setCatalogueError] = useState('');
  const [selectedCategory, setSelectedCategory] = useState(null);

  useEffect(() => {
    let alive = true;
    getHomeCatalogue()
      .then((snapshot) => {
        if (!alive) return;
        setCatalogueSnapshot(snapshot);
        setCatalogue(snapshot.products);
        setCategories(snapshot.categories);
      })
      .catch((error) => { if (alive) setCatalogueError(error.message || 'Could not load the catalogue.'); })
      .finally(() => { if (alive) setCatalogueLoading(false); });
    return () => { alive = false; };
  }, []);

  const categoryRows = useMemo(() => flattenCategories(categories), [categories]);
  const featured = catalogue.slice(0, 4);
  const trending = catalogue.slice(4, 8);
  const fresh = catalogue.slice(-4).reverse();

  const handleSelectCategory = (catName) => {
    setActiveCategory(catName);
    if (catName === 'Home') {
      setSelectedCategory(null);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    const category = categoryRows.find((item) => item.name === catName);
    if (category) {
      setSelectedCategory(category);
      window.requestAnimationFrame(() => {
        document.getElementById('fk-category-products')?.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        });
      });
    }
  };

  const handleSelectProduct = (product) => onNavigate('product', product.slug);

  return (
    <div className="fk-page-container">
      {/* 1. Main Header */}
      <Header
        onNavigate={onNavigate}
        onSelectProduct={handleSelectProduct}
      />

      {/* 2. Secondary Navigation Bar */}
      <CategoryNav
        activeCategory={activeCategory}
        onSelectCategory={handleSelectCategory}
        items={['Home', ...categoryRows.map((category) => category.name)]}
        onNavigate={onNavigate}
      />

      {/* 3. Hero Carousel Banner */}
      <HeroBanner onExplore={handleSelectCategory} />

      {/* 4. Shop by Category (8 cards) */}
      <CategorySection onSelectCategory={handleSelectCategory} categories={categories} products={catalogue} />
      {selectedCategory && (
        <section id="fk-category-products" className="fk-featured-section">
          <h2 className="fk-section-heading">{selectedCategory.name}</h2>
          <ProductGrid
            products={catalogue.filter((product) => categoryTreeIds(selectedCategory).includes(product.category?.id))}
            loading={catalogueLoading}
            error={catalogueError}
            onSelectProduct={handleSelectProduct}
            emptyMessage="No active products in this category yet."
          />
        </section>
      )}

      {/* 5. Best of Flatkart (4 featured cards) */}
      <FeaturedProducts onSelectProduct={handleSelectProduct} products={featured} loading={catalogueLoading} error={catalogueError} />

      {/* 6. Section A: Trending Now */}
      <TrendingNow onSelectProduct={handleSelectProduct} products={trending} loading={catalogueLoading} error={catalogueError} />

      {/* 7. Section B: Shop by Lifestyle (Find Your Style) */}
      <LifestyleSection onSelectCategory={handleSelectCategory} categories={categoryRows} products={catalogue} />

      {/* 8. Section C: Fresh Arrivals */}
      <FreshArrivals onSelectProduct={handleSelectProduct} products={fresh} loading={catalogueLoading} error={catalogueError} />

      {/* 9. Section D: Featured Collection Editorial Banner */}
      <FeaturedCollectionBanner onExplore={handleSelectCategory} />

      {/* 10. Section E: Popular Brands (Brands to Know) */}
      <PopularBrands products={catalogue} onSelectBrand={(brand) => {
        const product = catalogue.find((item) => item.brand === brand);
        if (product) handleSelectProduct(product);
      }} />

      {/* 11. Section F: Why Flatkart (Trust and Support) */}
      <WhyFlatkart />

      <Footer onNavigate={onNavigate} />

      {/* 12. Floating Help / AI Assistant Widget */}
      {(!user || isCustomerRole(user.role)) && (
        <ChatbotWidget
          isOpen={isChatbotOpen}
          onToggle={() => setIsChatbotOpen(!isChatbotOpen)}
          onNavigate={onNavigate}
        />
      )}

      {/* Drawers & Modals */}
      <CartDrawer onNavigate={onNavigate} />
      <WishlistDrawer onNavigate={onNavigate} />
    </div>
  );
}

export default Home;
