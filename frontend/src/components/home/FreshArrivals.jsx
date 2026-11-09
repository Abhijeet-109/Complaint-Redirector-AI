import React from 'react';
import { ProductGrid } from '../products/ProductGrid';

export function FreshArrivals({ onSelectProduct, products = [], loading = false, error = '' }) {

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

      <ProductGrid products={products} loading={loading} error={error} onSelectProduct={onSelectProduct} />
    </section>
  );
}

export default FreshArrivals;
