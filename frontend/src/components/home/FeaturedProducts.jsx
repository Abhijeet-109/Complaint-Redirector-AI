import React from 'react';
import { FEATURED_PRODUCTS } from '../../data/demoProducts';
import { useCart } from '../../context/CartContext';

export function FeaturedProducts({ onSelectProduct }) {
  const { addToCart } = useCart();

  return (
    <section className="fk-featured-section">
      <h2 className="fk-section-heading">Best of Flatkart</h2>
      <div className="fk-products-grid">
        {FEATURED_PRODUCTS.map((product) => (
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
