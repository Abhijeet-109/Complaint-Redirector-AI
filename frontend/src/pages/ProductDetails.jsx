import React, { useEffect, useMemo, useState } from 'react';
import { Heart } from 'lucide-react';
import { Header } from '../components/layout/Header';
import { Footer } from '../components/layout/Footer';
import { productService } from '../services/productService';
import { useCart } from '../context/CartContext';

const currency = (value) => `₹${Number(value).toLocaleString('en-IN')}`;
const methodLabels = { cod: 'Cash on Delivery', upi: 'UPI', netbanking: 'Net Banking' };
const displaySku = (value) => String(value || '').replace(/^(?:SKU:\s*)+/i, '');

function ProductGallery({ product, selectedVariant }) {
  const images = useMemo(() => {
    const allImages = product.images || [];
    const variantImages = allImages.filter((image) => image.variant_id === selectedVariant?.id);
    return [...(variantImages.length ? variantImages : allImages.filter((image) => image.variant_id == null))]
      .sort((a, b) => a.display_order - b.display_order || a.id - b.id);
  }, [product.images, selectedVariant?.id]);
  const [activeId, setActiveId] = useState(images[0]?.id ?? null);
  const [failedIds, setFailedIds] = useState([]);
  const galleryKey = images.map((image) => image.id).join(':');
  useEffect(() => { setActiveId(images[0]?.id ?? null); setFailedIds([]); }, [product.id, selectedVariant?.id, galleryKey]);
  const activeImage = images.find((item) => item.id === activeId) || images[0];
  return <section className="fk-detail-gallery" aria-label="Product images">
    <div className="fk-detail-thumbnails" role="list" aria-label="Choose product image">
      {images.map((image, index) => <button type="button" role="listitem" key={image.id}
        className={`fk-detail-thumbnail ${image.id === activeImage?.id ? 'is-active' : ''}`}
        aria-label={`Show product image ${index + 1}`} aria-pressed={image.id === activeImage?.id}
        onMouseEnter={() => setActiveId(image.id)} onFocus={() => setActiveId(image.id)} onClick={() => setActiveId(image.id)}>
        {failedIds.includes(image.id) ? <span>Image unavailable</span> : <img src={image.url} alt={image.alt_text || `${product.name} ${index + 1}`} onError={() => setFailedIds((items) => [...items, image.id])} />}
      </button>)}
    </div>
    <div className="fk-detail-image-stage">
      {activeImage && !failedIds.includes(activeImage.id)
        ? <img src={activeImage.url} alt={activeImage.alt_text || product.name} onError={() => setFailedIds((items) => [...items, activeImage.id])} />
        : <div className="fk-detail-image-empty">{images.length ? 'Product image unavailable' : 'No product images available'}</div>}
    </div>
  </section>;
}

function PurchaseActions() {
  return <div className="fk-detail-purchase" aria-label="Purchase actions">
    <div className="fk-detail-purchase-buttons"><button type="button" disabled>Add to Cart</button><button type="button" disabled>Order Now</button></div>
    <p>Cart and checkout will be enabled in the next purchasing phase.</p>
  </div>;
}

function PolicySummary({ product }) {
  const returnText = product.is_returnable === null || product.is_returnable === undefined
    ? 'Return policy not specified' : product.is_returnable
      ? `Returnable${product.return_window_days ? ` within ${product.return_window_days} days` : ''}` : 'Not returnable';
  const refundText = product.is_refundable === null || product.is_refundable === undefined
    ? 'Refund policy not specified' : product.is_refundable ? 'Refunds supported' : 'Not refundable';
  return <>{returnText}. {refundText}.</>;
}

export function ProductDetails({ slug, onNavigate }) {
  const [product, setProduct] = useState(null);
  const [selectedVariant, setSelectedVariant] = useState(null);
  const [pin, setPin] = useState('');
  const [pinFeedback, setPinFeedback] = useState('');
  const [state, setState] = useState({ loading: true, error: '' });
  const { wishlistItems, toggleWishlist } = useCart();

  useEffect(() => {
    let active = true;
    setState({ loading: true, error: '' });
    setProduct(null);
    productService.get(slug)
      .then((result) => {
        if (!active) return;
        setProduct(result);
        const initial = result.variants?.find((variant) => variant.is_available && (variant.inventory?.available_stock ?? 0) > 0)
          || result.variants?.[0] || null;
        setSelectedVariant(initial);
      })
      .catch((error) => { if (active) setState({ loading: false, error: error.message || 'Product could not be loaded.' }); })
      .finally(() => { if (active) setState((current) => ({ ...current, loading: false })); });
    return () => { active = false; };
  }, [slug]);

  const currentVariant = product?.variants?.find((variant) => variant.id === selectedVariant?.id) || product?.variants?.[0] || null;
  const isWishlisted = product && wishlistItems.some((item) => item.id === product.id);
  const availableStock = currentVariant?.inventory?.available_stock;
  const isAvailable = Boolean(currentVariant?.is_available && availableStock > 0);
  const hasInventory = Number.isInteger(availableStock);
  const discount = currentVariant && Number(currentVariant.mrp) > Number(currentVariant.price) && Number(currentVariant.mrp) > 0
    ? Math.round(((Number(currentVariant.mrp) - Number(currentVariant.price)) / Number(currentVariant.mrp)) * 100) : 0;

  const checkPin = (event) => {
    event.preventDefault();
    if (!/^\d{6}$/.test(pin)) setPinFeedback('Enter a valid six-digit PIN code.');
    else setPinFeedback('Delivery availability will be confirmed at checkout.');
  };

  return <div className="fk-page-container">
    <Header onNavigate={onNavigate} onSelectProduct={(item) => onNavigate('product', item.slug)} />
    <main className="fk-product-detail-page">
      {state.loading ? <div role="status" className="fk-catalog-state">Loading product…</div>
        : state.error ? <section className="fk-product-not-found"><h1>Product unavailable</h1><p>{state.error}</p><button onClick={() => onNavigate('home')}>Back to Flatkart</button></section>
          : product && <>
            <nav className="fk-product-breadcrumb" aria-label="Breadcrumb"><button onClick={() => onNavigate('home')}>Home</button><span> / </span>{product.category?.name || 'Products'}<span> / </span>{product.name}</nav>
            <section className="fk-product-detail-layout">
              <ProductGallery product={product} selectedVariant={currentVariant} />
              <div className="fk-product-detail-info">
                <div className="fk-detail-scroll-content">
                  <div className="fk-detail-title-row"><div>{product.brand && <p className="fk-product-brand">{product.brand}</p>}<h1>{product.name}</h1></div>
                    <button type="button" className={`fk-detail-wishlist ${isWishlisted ? 'is-selected' : ''}`} aria-label={isWishlisted ? 'Remove from wishlist' : 'Add to wishlist'} aria-pressed={Boolean(isWishlisted)} onClick={() => toggleWishlist(product)}><Heart fill={isWishlisted ? 'currentColor' : 'none'} /></button>
                  </div>
                  <p className="fk-detail-rating">No ratings yet</p>
                  {currentVariant && <div className="fk-detail-pricing"><strong>{currency(currentVariant.price)}</strong>
                    {discount > 0 && <><del>{currency(currentVariant.mrp)}</del><span className="fk-detail-discount">{discount}% off</span></>}
                  </div>}
                  <p className={`fk-product-detail-stock ${isAvailable ? 'is-in-stock' : ''}`}>{!currentVariant ? 'Availability not available' : !currentVariant.is_available ? 'Currently unavailable' : !hasInventory ? 'Availability will be confirmed' : isAvailable ? `${availableStock} available` : 'Out of stock'}</p>
                  {currentVariant && <p className="fk-product-detail-sku">SKU: {displaySku(currentVariant.sku)}</p>}
                  {!!product.variants?.length && <fieldset className="fk-detail-variants"><legend>Options</legend><div>{product.variants.map((variant) => {
                    const available = variant.is_available && (variant.inventory?.available_stock ?? 0) > 0;
                    return <button type="button" key={variant.id} className={variant.id === currentVariant?.id ? 'is-selected' : ''}
                      aria-pressed={variant.id === currentVariant?.id} disabled={!available} onClick={() => setSelectedVariant(variant)}>
                      <span>{variant.name}</span><small>{currency(variant.price)}</small>
                    </button>;
                  })}</div></fieldset>}
                  {product.short_description && <p className="fk-detail-short-description">{product.short_description}</p>}
                  {!!product.highlights?.length && <section className="fk-detail-highlights"><h2>Key highlights</h2><ul>{product.highlights.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul></section>}
                  {!!Object.keys(product.specifications || {}).length && <section className="fk-detail-specifications"><h2>Specifications</h2><dl>{Object.entries(product.specifications).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{value}</dd></div>)}</dl></section>}
                  <div className="fk-detail-accordions">
                    {!!product.description && <details><summary>Product description</summary><p className="fk-detail-description-text">{product.description}</p></details>}
                    {!!Object.keys(product.specifications || {}).length && <details><summary>Technical specifications</summary><dl>{Object.entries(product.specifications).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{value}</dd></div>)}</dl></details>}
                    <details><summary>Return & refund policy</summary><p><PolicySummary product={product} /></p></details>
                  </div>
                  <section className="fk-detail-store-delivery" aria-label="Store and delivery information">
                    <h2>Store & delivery information</h2>
                    <p className="fk-detail-seller">Sold by <strong>Flatkart</strong></p>
                    <section className="fk-detail-payment"><h3>Accepted payment methods</h3>{product.payment_methods?.length
                      ? <p>{product.payment_methods.map((method) => methodLabels[method]).filter(Boolean).join(' · ')}</p>
                      : <p>Payment options will be confirmed at checkout.</p>}</section>
                    <form className="fk-detail-pin" onSubmit={checkPin} noValidate><label htmlFor="fk-delivery-pin">Check delivery availability</label><div><input id="fk-delivery-pin" inputMode="numeric" autoComplete="postal-code" maxLength="6" value={pin} onChange={(event) => { setPin(event.target.value.replace(/\D/g, '').slice(0, 6)); setPinFeedback(''); }} placeholder="6-digit PIN" /><button type="submit">Check</button></div>{pinFeedback && <p role="status">{pinFeedback}</p>}</form>
                  </section>
                </div>
                <PurchaseActions />
              </div>
            </section>
          </>}
    </main>
    <Footer onNavigate={onNavigate} />
  </div>;
}

export default ProductDetails;
