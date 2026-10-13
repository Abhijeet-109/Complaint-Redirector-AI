import React from 'react';
import { FRESH_ARRIVALS } from '../../data/demoProducts';
import { useCart } from '../../context/CartContext';

export function FreshArrivals({ onSelectProduct }) {
  const { addToCart } = useCart();

  return (
    <section className="fk-featured-section">
      <div style={{ marginBottom: '13px' }}>
        <h2 className="fk-section-heading" style={{ marginBottom: '4px' }}>
          Fresh Arrivals
        </h2>
        <p style={{ fontSize: '13px', color: 'var(--fk-text-muted)' }}>
          New finds worth discovering
        </p>
      </div>

      <div className="fk-products-grid">
        {FRESH_ARRIVALS.map((product) => (
          <div
            key={product.id}
            className="fk-product-card"
            onClick={() => onSelectProduct && onSelectProduct(product)}
          >
            <div className="fk-product-img-box">
              <img
                src={product.image}
                alt={`${product.brand} ${product.name}`}
                className="fk-product-img"
                loading="lazy"
              />
            </div>
            <div className="fk-product-details">
              <div className="fk-product-brand">{product.brand}</div>
              <div className="fk-product-name">{product.name}</div>
              <div className="fk-product-subtext">{product.variant}</div>
              <div className={`fk-product-price ${product.priceColor}`}>
                {product.price}
              </div>
              <div className="fk-product-subtext">{product.subtext}</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export default FreshArrivals;
