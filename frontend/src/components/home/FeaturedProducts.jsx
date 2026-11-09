import React from 'react';
import { ProductGrid } from '../products/ProductGrid';

export function FeaturedProducts({ onSelectProduct, products = [], loading = false, error = '' }) {

  return (
    <section className="fk-featured-section">
      <h2 className="fk-section-heading">Best of Flatkart</h2>
      <ProductGrid products={products} loading={loading} error={error} onSelectProduct={onSelectProduct} />
    </section>
  );
}
