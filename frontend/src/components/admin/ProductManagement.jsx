import React, { useEffect, useMemo, useState } from 'react';
import { productService } from '../../services/productService';

const blankVariant = () => ({ sku: '', name: '', price: '', total_stock: 0, is_available: true });
const blankProduct = () => ({ name: '', brand: '', description: '', category_id: '', slug: '', is_active: true, variants: [blankVariant()] });
const flatten = (rows) => rows.flatMap((row) => [row, ...flatten(row.children || [])]);

export function ProductManagement() {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [form, setForm] = useState(null);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [imageFile, setImageFile] = useState(null);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const flatCategories = useMemo(() => flatten(categories), [categories]);

  const load = async () => {
    const [items, categoryTree] = await Promise.all([productService.adminProducts(), productService.categoriesAdmin()]);
    setProducts(items);
    setCategories(categoryTree);
  };
  useEffect(() => { load().catch((error) => setMessage(error.message)); }, []);

  const edit = (product) => {
    setMessage(''); setImageFile(null); setProgress(0);
    setForm(product ? {
      id: product.id, name: product.name, brand: product.brand || '', description: product.description || '',
      category_id: product.category?.id || '', slug: product.slug, is_active: product.is_active,
      variants: product.variants.map((variant) => ({ id: variant.id, sku: variant.sku, name: variant.name,
        price: variant.price, total_stock: variant.inventory?.total_stock ?? 0, is_available: variant.is_available })),
    } : blankProduct());
  };
  const changeVariant = (index, key, value) => setForm((current) => ({ ...current, variants: current.variants.map((variant, idx) => idx === index ? { ...variant, [key]: value } : variant) }));
  const save = async (event) => {
    event.preventDefault(); setBusy(true); setMessage('');
    try {
      const payload = { ...form, category_id: form.category_id ? Number(form.category_id) : null,
        variants: form.variants.map((variant) => ({ ...variant, price: Number(variant.price), total_stock: Number(variant.total_stock) })) };
      const saved = form.id ? await productService.updateProduct(form.id, payload) : await productService.createProduct(payload);
      setForm({ id: saved.id, name: saved.name, brand: saved.brand || '', description: saved.description || '',
        category_id: saved.category?.id || '', slug: saved.slug, is_active: saved.is_active,
        variants: saved.variants.map((variant) => ({ id: variant.id, sku: variant.sku, name: variant.name,
          price: variant.price, total_stock: variant.inventory?.total_stock ?? 0, is_available: variant.is_available })) });
      if (imageFile) await productService.uploadImage(saved.id, imageFile, setProgress);
      await load(); setForm(null); setMessage('Product saved.');
    } catch (error) { setMessage(error.message || 'Could not save product.'); }
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
    <header className="fk-catalog-admin-heading"><div><h1>Manage Products</h1><p>Catalogue details, variants, availability and on-hand stock.</p></div><button onClick={() => edit(null)}>Add Product</button></header>
    {message && <p className="fk-catalog-admin-message" role="status">{message}</p>}
    <div className="fk-catalog-admin-filters"><input placeholder="Search products or brands" value={search} onChange={(event) => setSearch(event.target.value)} />
      <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}><option value="">All categories</option>{flatCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></div>
    <div className="fk-catalog-table-wrap"><table className="fk-catalog-table"><thead><tr><th>Product</th><th>Brand / Category</th><th>Variants</th><th>Price</th><th>Stock</th><th>Status</th><th>Actions</th></tr></thead><tbody>
      {visibleProducts.map((product) => { const stock = product.variants.reduce((sum, variant) => sum + (variant.inventory?.available_stock || 0), 0); return <tr key={product.id}>
        <td className="fk-admin-product-name"><img src={product.images?.[0]?.url || '/assets/cat_men_hi.jpg'} alt="" /><strong>{product.name}</strong></td><td>{product.brand || '—'}<small>{product.category?.name || 'Uncategorised'}</small></td><td>{product.variants.length}<small>{product.variants[0]?.sku || ''}</small></td>
        <td>{product.variants[0] ? `₹${Number(product.variants[0].price).toLocaleString('en-IN')}` : '—'}</td><td>{stock}</td><td>{product.is_active ? 'Active' : 'Archived'}</td>
        <td><button onClick={() => edit(product)}>Edit</button> <button onClick={() => toggleArchive(product)}>{product.is_active ? 'Archive' : 'Restore'}</button></td>
      </tr>; })}
      {!visibleProducts.length && <tr><td colSpan="7">No matching products.</td></tr>}
    </tbody></table></div>
    {form && <div className="fk-catalog-form-backdrop"><form className="fk-catalog-form" onSubmit={save}>
      <div className="fk-catalog-form-heading"><h2>{form.id ? 'Edit Product' : 'Add Product'}</h2><button type="button" onClick={() => setForm(null)}>Cancel</button></div>
      <div className="fk-catalog-form-grid">
        <label>Product name<input required maxLength="200" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
        <label>Brand<input maxLength="120" value={form.brand} onChange={(event) => setForm({ ...form, brand: event.target.value })} /></label>
        <label>Slug<input value={form.slug} onChange={(event) => setForm({ ...form, slug: event.target.value })} /></label>
        <label>Category<select value={form.category_id} onChange={(event) => setForm({ ...form, category_id: event.target.value })}><option value="">No category</option>{flatCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
        <label className="fk-catalog-form-wide">Description<textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label>
        <label>Product image<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setImageFile(event.target.files?.[0] || null)} /></label>
        <label className="fk-catalog-check"><input type="checkbox" checked={form.is_active} onChange={(event) => setForm({ ...form, is_active: event.target.checked })} /> Active</label>
      </div>
      <h3>Variants</h3>
      {form.variants.map((variant, index) => <div className="fk-catalog-variant-row" key={variant.id || index}>
        <label>Variant name<input required value={variant.name} onChange={(event) => changeVariant(index, 'name', event.target.value)} /></label>
        <label>SKU<input required value={variant.sku} onChange={(event) => changeVariant(index, 'sku', event.target.value)} /></label>
        <label>Price<input type="number" min="0" step="0.01" required value={variant.price} onChange={(event) => changeVariant(index, 'price', event.target.value)} /></label>
        <label>Total stock<input type="number" min="0" step="1" required value={variant.total_stock} onChange={(event) => changeVariant(index, 'total_stock', event.target.value)} /></label>
        <label className="fk-catalog-check"><input type="checkbox" checked={variant.is_available} onChange={(event) => changeVariant(index, 'is_available', event.target.checked)} /> Available</label>
        <button type="button" onClick={() => setForm((current) => ({ ...current, variants: current.variants.filter((_, idx) => idx !== index) }))} disabled={form.variants.length === 1}>Remove</button>
      </div>)}
      <button type="button" onClick={() => setForm((current) => ({ ...current, variants: [...current.variants, blankVariant()] }))}>Add variant</button>
      {imageFile && <p>Image upload: {progress}%</p>}
      <div className="fk-catalog-form-actions"><button type="button" onClick={() => setForm(null)}>Cancel</button><button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save product'}</button></div>
    </form></div>}
  </section>;
}

export default ProductManagement;
