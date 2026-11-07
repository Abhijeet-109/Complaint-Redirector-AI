import React from 'react';
const categoryFallbacks = { fashion: '/assets/cat_men_hi.jpg', men: '/assets/cat_men_hi.jpg', women: '/assets/cat_women_hi.jpg', accessories: '/assets/cat_women_hi.jpg', footwear: '/assets/cat_sports_hi.jpg', 'home-living': '/assets/cat_home_living_hi.jpg', beauty: '/assets/cat_beauty_hi.jpg', electronics: '/assets/cat_electronics_hi.jpg', stationery: '/assets/cat_books_hi.jpg' };
const flattenCategories = (rows) => rows.flatMap((row) => [row, ...flattenCategories(row.children || [])]);

export function CategorySection({ onSelectCategory, categories = [], products = [] }) {
  const allCategories = flattenCategories(categories).filter((cat) => cat.slug !== 'fashion');
  return (
    <section className="fk-categories-section">
      <h2 className="fk-section-heading">Shop by category</h2>
      <div className="fk-categories-grid">
        {allCategories.map((cat) => (
          <div
            key={cat.id}
            id={`fk-category-${cat.slug}`}
            className="fk-category-card"
            onClick={() => onSelectCategory && onSelectCategory(cat.name)}
          >
            <div className="fk-category-image-wrapper">
              <img
                src={products.find((product) => product.category?.id === cat.id)?.images?.[0]?.url || categoryFallbacks[cat.slug] || '/assets/cat_home_living_hi.jpg'}
                alt={cat.name}
                className="fk-category-image"
                loading="lazy"
              />
            </div>
            <div className="fk-category-label-strip">
              {cat.name}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
