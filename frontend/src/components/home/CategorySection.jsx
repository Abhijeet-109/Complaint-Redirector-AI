import React from 'react';
import { CATEGORIES } from '../../data/categories';

export function CategorySection({ onSelectCategory }) {
  return (
    <section className="fk-categories-section">
      <h2 className="fk-section-heading">Shop by category</h2>
      <div className="fk-categories-grid">
        {CATEGORIES.map((cat) => (
          <div
            key={cat.id}
            id={`fk-category-${cat.id}`}
            className="fk-category-card"
            onClick={() => onSelectCategory && onSelectCategory(cat.name)}
          >
            <div className="fk-category-image-wrapper">
              <img
                src={cat.image}
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
