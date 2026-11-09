import React from 'react';

export function ProductFilters({ search, onSearch, categories = [], category, onCategory }) {
  return <div className="fk-product-filters">
    <input aria-label="Search products" placeholder="Search products" value={search} onChange={(event) => onSearch(event.target.value)} />
    <select aria-label="Filter by category" value={category} onChange={(event) => onCategory(event.target.value)}>
      <option value="">All categories</option>
      {categories.map((item) => <option key={item.id} value={item.slug}>{item.name}</option>)}
    </select>
  </div>;
}

export default ProductFilters;
