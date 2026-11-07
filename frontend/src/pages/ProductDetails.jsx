import React, { useEffect, useState } from 'react';
import { Header } from '../components/layout/Header';
import { Footer } from '../components/layout/Footer';
import { productService } from '../services/productService';

export function ProductDetails({ slug, onNavigate }) {
  const [product, setProduct] = useState(null);
  const [selectedVariant, setSelectedVariant] = useState(null);
  const [image, setImage] = useState('');
  const [state, setState] = useState({ loading: true, error: '' });

  useEffect(() => {
    let active = true;
    setState({ loading: true, error: '' });
    productService.get(slug)
      .then((result) => {
        if (!active) return;
        setProduct(result);
        setSelectedVariant(result.variants?.[0] || null);
        setImage(result.images?.[0]?.url || '/assets/cat_men_hi.jpg');
      })
      .catch((error) => { if (active) setState({ loading: false, error: error.message || 'Product could not be loaded.' }); })
      .finally(() => { if (active) setState((current) => ({ ...current, loading: false })); });
    return () => { active = false; };
  }, [slug]);

  return <div className="fk-page-container">
    <Header onNavigate={onNavigate} onSelectProduct={(item) => onNavigate('product', item.slug)} />
    <main className="fk-product-detail-page">
      {state.loading ? <div role="status" className="fk-catalog-state">Loading product…</div>
        : state.error ? <section className="fk-product-not-found"><h1>Product unavailable</h1><p>{state.error}</p><button onClick={() => onNavigate('home')}>Back to Flatkart</button></section>
          : product && <>
            <nav className="fk-product-breadcrumb"><button onClick={() => onNavigate('home')}>Home</button><span> / </span>{product.category?.name || 'Products'}<span> / </span>{product.name}</nav>
            <section className="fk-product-detail-layout">
              <div className="fk-product-detail-image"><img src={image} onError={() => setImage('/assets/cat_men_hi.jpg')} alt={product.name} /></div>
              <div className="fk-product-detail-info">
                <p className="fk-product-brand">{product.brand}</p>
                <h1>{product.name}</h1>
                {selectedVariant && <>
                  <p className="fk-product-detail-price">₹{Number(selectedVariant.price).toLocaleString('en-IN')}</p>
                  <p className="fk-product-detail-stock">{selectedVariant.is_available && (selectedVariant.inventory?.available_stock ?? 0) > 0 ? 'In stock' : 'Currently unavailable'}</p>
                </>}
                {product.variants?.length > 1 && <label className="fk-product-variant-select">Choose option
                  <select value={selectedVariant?.id || ''} onChange={(event) => setSelectedVariant(product.variants.find((item) => String(item.id) === event.target.value))}>
                    {product.variants.map((variant) => <option key={variant.id} value={variant.id}>{variant.name} · {variant.sku}</option>)}
                  </select>
                </label>}
                <p className="fk-product-detail-description">{product.description || 'Product details will be available soon.'}</p>
                {selectedVariant && <p className="fk-product-detail-sku">SKU: {selectedVariant.sku}</p>}
              </div>
            </section>
          </>}
    </main>
    <Footer onNavigate={onNavigate} />
  </div>;
}

export default ProductDetails;
