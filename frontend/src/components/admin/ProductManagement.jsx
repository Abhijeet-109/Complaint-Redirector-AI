import React, { useEffect, useMemo, useState } from 'react';
import { productService } from '../../services/productService';

const blankVariant = () => ({ sku: '', name: '', price: '', mrp: '', total_stock: 0, is_available: true });
const blankProduct = () => ({ name: '', brand: '', description: '', short_description: '', category_id: '', slug: '', slugTouched: false,
  is_active: true, highlights: [], specifications: {}, is_returnable: false, return_window_days: '', is_refundable: false,
  payment_methods: [], variants: [blankVariant()], images: [], specificationRows: [], pendingDeleteIds: [] });
const flatten = (rows) => rows.flatMap((row) => [row, ...flatten(row.children || [])]);
const slugify = (value) => value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const numeric = (value) => Number(value || 0);

function EditorSection({ title, description, children }) {
  return <section className="fk-editor-card"><div className="fk-editor-card-heading"><h2>{title}</h2>{description && <p>{description}</p>}</div>{children}</section>;
}

export function ProductManagement() {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [form, setForm] = useState(null);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState('');
  const flatCategories = useMemo(() => flatten(categories), [categories]);

  const load = async () => {
    const [items, categoryTree] = await Promise.all([productService.adminProducts(), productService.categoriesAdmin()]);
    setProducts(items);
    setCategories(categoryTree);
    setLoadError('');
  };
  useEffect(() => { load().catch((error) => setLoadError(error.message || 'Catalogue could not be loaded.')); }, []);

  const toForm = (product) => ({
    id: product.id, name: product.name || '', brand: product.brand || '', description: product.description || '',
    short_description: product.short_description || '', category_id: product.category?.id || '', slug: product.slug || '', slugTouched: true,
    is_active: product.is_active, highlights: product.highlights || [], specifications: product.specifications || {},
    is_returnable: product.is_returnable ?? null, return_window_days: product.return_window_days ?? '',
    is_refundable: product.is_refundable ?? null, payment_methods: product.payment_methods || [],
    specificationRows: Object.entries(product.specifications || {}).map(([key, value]) => ({ key, value })),
    pendingDeleteIds: [],
    variants: product.variants.map((variant) => ({ id: variant.id, sku: variant.sku, name: variant.name, price: variant.price,
      mrp: variant.mrp ?? variant.price, total_stock: variant.inventory?.total_stock ?? 0, is_available: variant.is_available,
      reserved_stock: variant.inventory?.reserved_stock ?? 0 })),
    images: [...(product.images || [])].sort((a, b) => a.display_order - b.display_order).map((image) => ({ ...image, status: 'saved' })),
  });

  const edit = (product) => { setMessage(''); setForm(product ? toForm(product) : blankProduct()); };
  const change = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const changeVariant = (index, key, value) => setForm((current) => ({ ...current,
    variants: current.variants.map((variant, idx) => idx === index ? { ...variant, [key]: value } : variant) }));
  const setSpecification = (index, part, value) => setForm((current) => ({ ...current,
    specificationRows: current.specificationRows.map((row, rowIndex) => rowIndex === index ? { ...row, [part]: value } : row) }));
  const addSpecification = () => setForm((current) => ({ ...current, specificationRows: [...current.specificationRows, { key: '', value: '' }] }));
  const removeSpecification = (index) => setForm((current) => ({ ...current,
    specificationRows: current.specificationRows.filter((_, rowIndex) => rowIndex !== index) }));

  const addFiles = (event) => {
    const selected = Array.from(event.target.files || []);
    event.target.value = '';
    const remaining = 8 - (form.images?.length || 0);
    if (selected.length > remaining) {
      setMessage(`Only ${Math.max(remaining, 0)} more image${remaining === 1 ? '' : 's'} can be added. The product gallery limit is 8.`);
      return;
    }
    const additions = selected.map((file) => ({ file, url: URL.createObjectURL(file), status: 'queued', progress: 0, error: '' }));
    change('images', [...(form.images || []), ...additions]);
    setMessage('');
  };

  const updateGallery = (images) => setForm((current) => ({ ...current, images }));
  const moveImage = async (index, delta) => {
    const target = index + delta;
    if (target < 0 || target >= form.images.length) return;
    const images = [...form.images];
    [images[index], images[target]] = [images[target], images[index]];
    updateGallery(images);
    const imageIds = images.filter((image) => image.status === 'saved').map((image) => image.id);
    if (form.id) {
      try { await productService.orderImages(form.id, imageIds); }
      catch (error) { setMessage(error.message || 'Image order could not be saved.'); }
    }
  };
  const removeImage = async (index) => {
    const image = form.images[index];
    if (image.url && image.file) URL.revokeObjectURL(image.url);
    const images = form.images.filter((_, rowIndex) => rowIndex !== index).map((entry, rowIndex) => entry.status === 'saved'
      ? { ...entry, display_order: rowIndex } : entry);
    setForm((current) => ({ ...current, images,
      pendingDeleteIds: image.status === 'saved' ? [...current.pendingDeleteIds, image.id] : current.pendingDeleteIds }));
  };

  const save = async (event) => {
    event.preventDefault();
    const rows = form.specificationRows;
    const keys = rows.map(({ key }) => key.trim().toLocaleLowerCase());
    if (rows.some(({ key, value }) => !key.trim() || !String(value).trim()) || new Set(keys).size !== keys.length) {
      setMessage('Enter a unique name and value for every specification.');
      return;
    }
    if (form.variants.some((variant) => numeric(variant.mrp || variant.price) < numeric(variant.price))) {
      setMessage('Each MRP must be greater than or equal to its selling price.');
      return;
    }
    if (form.is_returnable && numeric(form.return_window_days) < 1) {
      setMessage('Enter a positive return window for a returnable product.');
      return;
    }
    setBusy(true); setMessage('');
    try {
      const payload = {
        name: form.name.trim(), brand: form.brand.trim() || null, description: form.description,
        short_description: form.short_description.trim() || null, category_id: form.category_id ? Number(form.category_id) : null,
        slug: form.slug.trim() || null, is_active: form.is_active,
        highlights: form.highlights.map((line) => line.trim()).filter(Boolean),
        specifications: Object.fromEntries(rows.map(({ key, value }) => [key.trim(), String(value).trim()])),
        is_returnable: form.is_returnable, return_window_days: form.is_returnable ? Number(form.return_window_days) : null,
        is_refundable: form.is_refundable, payment_methods: form.payment_methods,
        variants: form.variants.map((variant) => ({ id: variant.id, name: variant.name.trim(), sku: variant.sku.trim(),
          price: Number(variant.price), mrp: Number(variant.mrp || variant.price), total_stock: Number(variant.total_stock), is_available: variant.is_available })),
      };
      const saved = form.id ? await productService.updateProduct(form.id, payload) : await productService.createProduct(payload);
      let images = [...(form.images || [])];
      let pendingDeleteIds = [...(form.pendingDeleteIds || [])];
      setForm({ ...toForm(saved), images, pendingDeleteIds });
      for (const imageId of pendingDeleteIds) {
        await productService.deleteImage(saved.id, imageId);
        pendingDeleteIds = pendingDeleteIds.filter((id) => id !== imageId);
        setForm((current) => ({ ...current, pendingDeleteIds }));
      }
      const savedIds = images.filter((image) => image.status === 'saved').map((image) => image.id);
      if (savedIds.length) await productService.orderImages(saved.id, savedIds);
      let failed = false;
      for (let index = 0; index < images.length; index += 1) {
        const entry = images[index];
        if (!entry.file || entry.status === 'uploaded') continue;
        images[index] = { ...entry, status: 'uploading', progress: 0, error: '' };
        updateGallery([...images]);
        try {
          const uploaded = await productService.uploadImage(saved.id, entry.file, (progress) => {
            images[index] = { ...images[index], progress };
            updateGallery([...images]);
          });
          if (entry.url) URL.revokeObjectURL(entry.url);
          images[index] = { id: uploaded.image_id, url: uploaded.url, display_order: uploaded.display_order, status: 'saved' };
        } catch (error) {
          failed = true;
          images[index] = { ...entry, status: 'failed', error: error.message || 'Upload failed.' };
        }
        updateGallery([...images]);
      }
      const finalIds = images.filter((image) => image.status === 'saved').map((image) => image.id);
      if (finalIds.length) await productService.orderImages(saved.id, finalIds);
      const refreshed = await productService.adminProduct(saved.id);
      const nextForm = toForm(refreshed);
      const failedQueue = images.filter((image) => image.status === 'failed' || image.status === 'queued');
      if (failed || failedQueue.length) {
        setForm({ ...nextForm, images: [...nextForm.images, ...failedQueue], pendingDeleteIds });
        setMessage('Product details saved; some images failed to upload. Retry the failed images below.');
      } else {
        await load();
        setForm(null);
        setMessage('Product saved.');
      }
    } catch (error) { setMessage(error.message || 'Product details could not be saved.'); }
    finally { setBusy(false); }
  };

  const toggleArchive = async (product) => {
    try { await productService.archiveProduct(product.id, !product.is_active); await load(); }
    catch (error) { setMessage(error.message || 'Could not update product status.'); }
  };
  const visibleProducts = products.filter((product) =>
    (!search || `${product.name} ${product.brand || ''}`.toLowerCase().includes(search.toLowerCase()))
    && (!categoryFilter || String(product.category?.id) === categoryFilter));

  return <section className="fk-catalog-admin">
    {!form ? <>
      <header className="fk-catalog-admin-heading"><div><h1>Manage Products</h1><p>Catalogue details, variants, availability and on-hand stock.</p></div><button onClick={() => edit(null)}>Add Product</button></header>
      {message && <p className="fk-catalog-admin-message" role="status">{message}</p>}
      {loadError && <p className="fk-catalog-admin-message" role="alert">{loadError}</p>}
      <div className="fk-catalog-admin-filters"><input aria-label="Search products or brands" placeholder="Search products or brands" value={search} onChange={(event) => setSearch(event.target.value)} />
        <select aria-label="Filter by category" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}><option value="">All categories</option>{flatCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></div>
      <div className="fk-catalog-table-wrap"><table className="fk-catalog-table"><thead><tr><th>Product</th><th>Brand / Category</th><th>Variants</th><th>Price</th><th>Stock</th><th>Status</th><th>Actions</th></tr></thead><tbody>
        {visibleProducts.map((product) => { const stock = product.variants.reduce((sum, variant) => sum + (variant.inventory?.available_stock || 0), 0); return <tr key={product.id}>
          <td className="fk-admin-product-name">{product.images?.[0]?.url && <img src={product.images[0].url} alt="" />}<strong>{product.name}</strong></td><td>{product.brand || '—'}<small>{product.category?.name || 'Uncategorised'}</small></td><td>{product.variants.length}<small>{product.variants[0]?.sku || ''}</small></td>
          <td>{product.variants[0] ? `₹${Number(product.variants[0].price).toLocaleString('en-IN')}` : '—'}</td><td>{stock}</td><td>{product.is_active ? 'Active' : 'Archived'}</td>
          <td><button onClick={() => edit(product)}>Edit</button> <button onClick={() => toggleArchive(product)}>{product.is_active ? 'Archive' : 'Restore'}</button></td>
        </tr>; })}
        {!visibleProducts.length && <tr><td colSpan="7">{loadError ? 'Catalogue is unavailable.' : 'No matching products.'}</td></tr>}
      </tbody></table></div>
    </> : <form className="fk-product-editor" onSubmit={save}>
      <header className="fk-product-editor-header"><div><button type="button" className="fk-editor-back" onClick={() => setForm(null)}>← Products</button><h1>{form.name || 'New product'}</h1><p>{form.id ? `Editing product #${form.id}` : 'Create a catalogue product'}</p></div><div className="fk-editor-header-actions"><span className={`fk-editor-status ${form.is_active ? 'is-active' : ''}`}>{form.is_active ? 'Active' : 'Archived'}</span><button type="button" onClick={() => setForm(null)}>Cancel</button><button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save product'}</button></div></header>
      {message && <p className="fk-catalog-admin-message" role="status">{message}</p>}
      <div className="fk-product-editor-grid"><div className="fk-product-editor-main">
        <EditorSection title="Basic information" description="Core product details shown in the Flatkart catalogue.">
          <div className="fk-editor-fields"><label className="fk-editor-span">Product title *<input required maxLength="200" value={form.name} onChange={(event) => {
            const name = event.target.value;
            setForm((current) => ({ ...current, name, slug: current.slugTouched ? current.slug : slugify(name) }));
          }} /></label>
            <label>Brand<input maxLength="120" value={form.brand} onChange={(event) => change('brand', event.target.value)} /></label>
            <label>Category<select value={form.category_id} onChange={(event) => change('category_id', event.target.value)}><option value="">No category</option>{flatCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
            <label className="fk-editor-span">Slug<input value={form.slug} onChange={(event) => setForm((current) => ({ ...current, slug: event.target.value, slugTouched: true }))} /></label>
            <label className="fk-editor-span">Short summary <small>{form.short_description.length}/250</small><textarea maxLength="250" rows="2" value={form.short_description} onChange={(event) => change('short_description', event.target.value)} /></label>
            <label className="fk-editor-span">Full description<textarea rows="6" value={form.description} onChange={(event) => change('description', event.target.value)} /></label>
            <label className="fk-editor-toggle"><input type="checkbox" checked={form.is_active} onChange={(event) => change('is_active', event.target.checked)} /> Active on storefront</label>
          </div>
        </EditorSection>

        <EditorSection title="Product gallery" description={`${form.images.length} of 8 images. The first image is the cover.`}>
          <label className="fk-gallery-picker">Add product images<input type="file" multiple accept="image/jpeg,image/png,image/webp" onChange={addFiles} disabled={form.images.length >= 8} /></label>
          <div className="fk-editor-gallery">{form.images.map((image, index) => <article className="fk-editor-image-card" key={image.id || `${image.file?.name}-${index}`}>
            <div className="fk-editor-image-stage"><img src={image.url} alt={image.alt_text || image.file?.name || ''} />{index === 0 && <span className="fk-editor-cover">Primary / Cover</span>}</div>
            <div className="fk-editor-image-meta"><span>Image {index + 1}</span><span>{image.status === 'saved' ? 'Uploaded' : image.status === 'uploading' ? `Uploading ${image.progress || 0}%` : image.status === 'failed' ? 'Upload failed' : 'Ready to upload'}</span></div>
            {image.status === 'failed' && <p className="fk-editor-image-error">{image.error}</p>}
            <div className="fk-editor-image-actions">{image.status === 'failed' && <button type="button" disabled={busy} onClick={() => updateGallery(form.images.map((entry, row) => row === index ? { ...entry, status: 'queued', error: '' } : entry))}>Retry on save</button>}<button type="button" disabled={index === 0 || busy} onClick={() => moveImage(index, -1)}>Move up</button><button type="button" disabled={index === form.images.length - 1 || busy} onClick={() => moveImage(index, 1)}>Move down</button><button type="button" disabled={busy} onClick={() => removeImage(index)}>Remove</button></div>
          </article>)}
          {!form.images.length && <p className="fk-editor-empty">No product images added.</p>}</div>
        </EditorSection>

        <EditorSection title="Key highlights" description="Add concise product points; blank entries are ignored.">
          <div className="fk-editor-repeat-list">{form.highlights.map((highlight, index) => <div className="fk-editor-repeat-row" key={index}><input aria-label={`Highlight ${index + 1}`} value={highlight} onChange={(event) => change('highlights', form.highlights.map((line, row) => row === index ? event.target.value : line))} /><button type="button" onClick={() => change('highlights', form.highlights.filter((_, row) => row !== index))}>Remove</button></div>)}</div>
          <button className="fk-editor-secondary" type="button" onClick={() => change('highlights', [...form.highlights, ''])}>Add highlight</button>
        </EditorSection>

        <EditorSection title="Technical specifications" description="Define any category-neutral name and value for this product.">
          <div className="fk-editor-specs">{form.specificationRows.map(({ key, value }, index) => <div className="fk-editor-spec-row" key={index}>
            <label>Specification name<input value={key} onChange={(event) => setSpecification(index, 'key', event.target.value)} /></label><label>Value<input value={value} onChange={(event) => setSpecification(index, 'value', event.target.value)} /></label><button type="button" onClick={() => removeSpecification(index)}>Remove</button>
          </div>)}</div><button className="fk-editor-secondary" type="button" onClick={addSpecification}>Add specification</button>
        </EditorSection>

        <EditorSection title="Product variants & inventory" description="Each variant is one purchasable SKU. Reserved stock remains protected.">
          <div className="fk-editor-variants">{form.variants.map((variant, index) => <div className="fk-editor-variant" key={variant.id || index}>
            <div className="fk-editor-variant-title"><strong>Variant {index + 1}</strong>{variant.id && <small>{variant.reserved_stock} reserved</small>}</div>
            <div className="fk-editor-fields"><label>Variant name<input required value={variant.name} onChange={(event) => changeVariant(index, 'name', event.target.value)} /></label><label>SKU<input required maxLength="80" value={variant.sku} onChange={(event) => changeVariant(index, 'sku', event.target.value)} /></label>
              <label>Selling price<input type="number" min="0" step="0.01" required value={variant.price} onChange={(event) => changeVariant(index, 'price', event.target.value)} /></label><label>MRP<input type="number" min={variant.price || 0} step="0.01" required value={variant.mrp} onChange={(event) => changeVariant(index, 'mrp', event.target.value)} /></label>
              <label>Total stock<input type="number" min={variant.reserved_stock || 0} step="1" required value={variant.total_stock} onChange={(event) => changeVariant(index, 'total_stock', event.target.value)} /></label><label className="fk-editor-toggle"><input type="checkbox" checked={variant.is_available} onChange={(event) => changeVariant(index, 'is_available', event.target.checked)} /> Available</label>
            </div><button className="fk-editor-remove" type="button" disabled={form.variants.length === 1} onClick={() => change('variants', form.variants.filter((_, row) => row !== index))}>Remove variant</button>
          </div>)}</div><button className="fk-editor-secondary" type="button" onClick={() => change('variants', [...form.variants, blankVariant()])}>Add variant</button>
        </EditorSection>
      </div>
      <aside className="fk-product-editor-aside">
        <EditorSection title="Policies & returns"><label className="fk-editor-toggle"><input type="checkbox" checked={form.is_returnable === true} onChange={(event) => setForm((current) => ({ ...current, is_returnable: event.target.checked, return_window_days: event.target.checked ? current.return_window_days : '' }))} /> Returnable</label>
          <label className="fk-editor-aside-field">Return window (days)<input type="number" min="1" disabled={!form.is_returnable} value={form.return_window_days} onChange={(event) => change('return_window_days', event.target.value)} /></label>
          <label className="fk-editor-toggle"><input type="checkbox" checked={form.is_refundable === true} onChange={(event) => change('is_refundable', event.target.checked)} /> Refundable</label>
          {(form.is_returnable === null || form.is_refundable === null) && <p className="fk-editor-note">Existing policy is not specified. Select a setting to define it.</p>}
        </EditorSection>
        <EditorSection title="Accepted payment methods"><div className="fk-editor-checks">{[['cod', 'Cash on Delivery'], ['upi', 'UPI'], ['netbanking', 'Net Banking']].map(([value, label]) => <label key={value}><input type="checkbox" checked={form.payment_methods.includes(value)} onChange={(event) => change('payment_methods', event.target.checked ? [...form.payment_methods, value] : form.payment_methods.filter((item) => item !== value))} /> {label}</label>)}</div></EditorSection>
        <EditorSection title="Store identity"><div className="fk-editor-seller">Sold by Flatkart</div></EditorSection>
        <div className="fk-editor-save-card"><p>Changes are saved to the product catalogue.</p><button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save product'}</button><button type="button" onClick={() => setForm(null)}>Cancel</button></div>
      </aside></div>
      <div className="fk-editor-bottom-actions"><span>{form.id ? 'Editing product details' : 'New product'}</span><div><button type="button" onClick={() => setForm(null)}>Cancel</button><button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save product'}</button></div></div>
    </form>}
  </section>;
}

export default ProductManagement;
