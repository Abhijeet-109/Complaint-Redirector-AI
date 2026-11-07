import React from 'react';
import { ProductCard } from './ProductCard';

export function ProductGrid({ products = [], onSelectProduct, loading = false, error = '', emptyMessage = 'No products found.' }) {
  if (loading) return <div role="status" className="fk-catalog-state">Loading products…</div>;
  if (error) return <div role="alert" className="fk-catalog-state">{error}</div>;
  if (!products.length) return <div className="fk-catalog-state">{emptyMessage}</div>;
  return <div className="fk-products-grid">{products.map((product) => <ProductCard key={product.id} product={product} onSelectProduct={onSelectProduct} />)}</div>;
}

export default ProductGrid;
