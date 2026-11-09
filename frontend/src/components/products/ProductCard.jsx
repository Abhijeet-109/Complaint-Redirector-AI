import React, { useEffect, useState } from 'react';
import { getProductCardImage } from '../../utils/productImages';

const fallback = '/assets/cat_men_hi.jpg';

export function ProductCard({ product, onSelectProduct }) {
  const primaryImage = getProductCardImage(product);
  const [imageSrc, setImageSrc] = useState(primaryImage || fallback);
  useEffect(() => setImageSrc(primaryImage || fallback), [product.id, primaryImage]);
  const variant = product.variants?.[0];
  return (
    <button type="button" className="fk-product-card fk-live-product-card" onClick={() => onSelectProduct?.(product)}>
      <div className="fk-product-img-box">
        <img src={imageSrc} onError={() => {
          if (imageSrc !== fallback) setImageSrc(fallback);
        }} alt={product.name} className="fk-product-img" loading="lazy" decoding="async" />
      </div>
      <div className="fk-product-details">
        <div className="fk-product-brand">{product.brand || 'Flatkart'}</div>
        <div className="fk-product-name">{product.name}</div>
        <div className="fk-product-subtext">{variant?.name || product.category?.name || ''}</div>
        {variant && <div className="fk-product-price">₹{Number(variant.price).toLocaleString('en-IN')}</div>}
      </div>
    </button>
  );
}

export default ProductCard;
