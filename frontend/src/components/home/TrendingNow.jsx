import React from 'react';
import { ProductGrid } from '../products/ProductGrid';

export function TrendingNow({ onSelectProduct, products = [], loading = false, error = '' }) {

  return (
    <section className="fk-featured-section">
      <div style={{ marginBottom: '13px' }}>
        <h2 className="fk-section-heading" style={{ marginBottom: '4px' }}>
          Trending Now
        </h2>
        <p style={{ fontSize: '13px', color: 'var(--fk-text-muted)' }}>
          Discover the picks everyone is talking about
        </p>
      </div>

      <ProductGrid products={products} loading={loading} error={error} onSelectProduct={onSelectProduct} />
    </section>
  );
}

export default TrendingNow;
