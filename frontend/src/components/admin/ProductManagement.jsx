import React, { useEffect, useMemo, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { productService } from '../../services/productService';
import { CenterToast } from '../common/CenterToast';

const nextClientKey = () => globalThis.crypto?.randomUUID?.() || `variant-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const blankVariant = () => ({ clientKey: nextClientKey(), sku: '', name: '', price: '', mrp: '', total_stock: 0, is_available: true, images: [] });
const blankProduct = () => ({ name: '', brand: '', description: '', short_description: '', category_id: '', slug: '', slugTouched: false,
  is_active: true, highlights: [], specifications: {}, is_returnable: false, return_window_days: '', is_refundable: false,
  payment_methods: [], variant_image_mode: 'per_variant', initial_variant_image_mode: 'per_variant',
  variants: [blankVariant()], images: [], specificationRows: [], pendingDeleteImages: [] });
const flatten = (rows) => rows.flatMap((row) => [row, ...flatten(row.children || [])]);
const slugify = (value) => value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const numeric = (value) => Number(value || 0);
const displaySku = (value) => String(value || '').replace(/^(?:SKU:\s*)+/i, '');

function EditorSection({ title, description, children }) {
  return <section className="fk-editor-card"><div className="fk-editor-card-heading"><h2>{title}</h2>{description && <p>{description}</p>}</div>{children}</section>;
}

function ImageGalleryEditor({ title, gallery, busy, uploadEnabled = true, onAdd, onMove, onRemove, onRetry }) {
  return <div className="fk-variant-gallery">
    <div className="fk-variant-gallery-heading"><strong>{title}</strong><span>{gallery.length}/8 images in this gallery</span></div>
    {uploadEnabled && <label className="fk-gallery-picker">Add images<input type="file" multiple accept="image/jpeg,image/png,image/webp" onChange={onAdd} disabled={gallery.length >= 8 || busy} /></label>}
    <div className="fk-editor-gallery">{gallery.map((image, index) => <article className="fk-editor-image-card" key={image.id || `${image.file?.name}-${index}`}>
      <div className="fk-editor-image-stage"><img src={image.url} alt={image.alt_text || image.file?.name || ''} />{index === 0 && <span className="fk-editor-cover">Primary / Cover</span>}</div>
      <div className="fk-editor-image-meta"><span>Image {index + 1}</span><span>{image.status === 'saved' ? 'Uploaded' : image.status === 'uploading' ? `Uploading ${image.progress || 0}%` : image.status === 'failed' ? 'Upload failed' : 'Ready to upload'}</span></div>
      {image.status === 'failed' && <p className="fk-editor-image-error">{image.error}</p>}
      <div className="fk-editor-image-actions">{image.status === 'failed' && <button type="button" disabled={busy} onClick={() => onRetry(index)}>Retry on save</button>}<button type="button" disabled={index === 0 || busy} onClick={() => onMove(index, -1)}>Move up</button><button type="button" disabled={index === gallery.length - 1 || busy} onClick={() => onMove(index, 1)}>Move down</button><button type="button" disabled={busy} onClick={() => onRemove(index)}>Remove</button></div>
    </article>)}{!gallery.length && <p className="fk-editor-empty">No images in this gallery.</p>}</div>
  </div>;
}

/* ── Bulk confirmation dialog ─────────────────────────────────────────────── */
function BulkConfirmDialog({ op, count, onConfirm, onCancel, busy }) {
  const isDelete = op === 'delete';
  const label = op === 'archive' ? 'Archive' : op === 'restore' ? 'Restore' : 'Permanently Delete';
  return (
    <div className="fk-catalog-form-backdrop" onClick={() => { if (!busy) onCancel(); }}>
      <div className="ad-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="fk-bulk-confirm-title">
        <div className="ad-modal-header">
          <span className="ad-modal-title" id="fk-bulk-confirm-title">{label} {count} product{count !== 1 ? 's' : ''}?</span>
          <button className="ad-modal-close" aria-label="Close" disabled={busy} onClick={onCancel}>&#10005;</button>
        </div>
        <div className="ad-modal-body">
          <p style={{ fontSize: '13.5px', lineHeight: '1.55', color: 'var(--fk-text-primary)' }}>
            {op === 'archive' && `This will archive ${count} product${count !== 1 ? 's' : ''}. They will be hidden from the storefront but can be restored.`}
            {op === 'restore' && `This will restore ${count} product${count !== 1 ? 's' : ''} and make them active on the storefront.`}
            {op === 'delete' && `This will permanently delete ${count} product${count !== 1 ? 's' : ''}. This action cannot be undone.`}
          </p>
          {isDelete && (
            <p style={{ fontSize: '13px', color: '#8a3228', background: '#fdf2f0', border: '1px solid #f3d3d0', borderRadius: '6px', padding: '10px 12px', margin: '8px 0 0' }}>
              Products referenced by cart or order history cannot be deleted and will be skipped. Archive them instead.
            </p>
          )}
        </div>
        <div className="ad-modal-footer">
          <button type="button" className="ad-btn-secondary" disabled={busy} onClick={onCancel}>Cancel</button>
          <button type="button" className={isDelete ? 'ad-btn-danger' : 'ad-btn-primary'} disabled={busy}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }} onClick={onConfirm}>
            {busy ? 'Processing…' : `${label} ${count} product${count !== 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Bulk result bar ──────────────────────────────────────────────────────── */
function BulkResultBar({ result, onDismiss }) {
  if (!result) return null;
  const hasFailures = result.failures.length > 0;
  return (
    <div className={`fk-bulk-result ${hasFailures && result.successes === 0 ? 'fk-bulk-result--warn' : result.successes > 0 && hasFailures ? 'fk-bulk-result--warn' : 'fk-bulk-result--ok'}`}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px' }}>
        <div>
          {result.successes > 0 && <div>{result.successes} product{result.successes !== 1 ? 's' : ''} {result.opLabel} successfully.</div>}
          {result.failures.map((f, i) => <div key={i} style={{ marginTop: '4px' }}><strong>{f.name}</strong>: {f.reason}</div>)}
        </div>
        <button type="button" onClick={onDismiss} style={{ border: 0, background: 'none', cursor: 'pointer', color: 'inherit', fontSize: '14px', lineHeight: 1 }}>&#10005;</button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════ */
export function ProductManagement() {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [form, setForm] = useState(null);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [toast, setToast] = useState({ visible: false, message: '', type: 'success' });

  // Bulk selection state
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkOp, setBulkOp] = useState(null); // 'archive' | 'restore' | 'delete'
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkResult, setBulkResult] = useState(null);

  const flatCategories = useMemo(() => flatten(categories), [categories]);

  const load = async () => {
    const [items, categoryTree] = await Promise.all([productService.adminProducts(), productService.categoriesAdmin()]);
    setProducts(items);
    setCategories(categoryTree);
    setLoadError('');
  };
  useEffect(() => { load().catch((error) => setLoadError(error.message || 'Catalogue could not be loaded.')); }, []);

  // Clear selection whenever filters change
  useEffect(() => { setSelectedIds(new Set()); setBulkResult(null); }, [search, categoryFilter, statusFilter]);

  const visibleProducts = useMemo(() => products.filter((p) => {
    if (search && !`${p.name} ${p.brand || ''}`.toLowerCase().includes(search.toLowerCase())) return false;
    if (categoryFilter && String(p.category?.id) !== categoryFilter) return false;
    if (statusFilter === 'active' && !p.is_active) return false;
    if (statusFilter === 'archived' && p.is_active) return false;
    return true;
  }), [products, search, categoryFilter, statusFilter]);

  const visibleIds = useMemo(() => new Set(visibleProducts.map((p) => p.id)), [visibleProducts]);
  const allSelected = visibleProducts.length > 0 && visibleProducts.every((p) => selectedIds.has(p.id));
  const someSelected = selectedIds.size > 0;

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(visibleProducts.map((p) => p.id)));
    }
  };

  const toggleRow = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const clearSelection = () => { setSelectedIds(new Set()); setBulkResult(null); };

  const selectedProducts = useMemo(() => products.filter((p) => selectedIds.has(p.id) && visibleIds.has(p.id)), [products, selectedIds, visibleIds]);
  const hasActive = selectedProducts.some((p) => p.is_active);
  const hasArchived = selectedProducts.some((p) => !p.is_active);

  const executeBulk = async () => {
    if (!bulkOp || selectedProducts.length === 0) return;
    setBulkBusy(true);
    const successes = [];
    const failures = [];
    const opLabel = bulkOp === 'archive' ? 'archived' : bulkOp === 'restore' ? 'restored' : 'deleted';

    for (const product of selectedProducts) {
      try {
        if (bulkOp === 'archive') await productService.archiveProduct(product.id, false);
        else if (bulkOp === 'restore') await productService.archiveProduct(product.id, true);
        else if (bulkOp === 'delete') await productService.deleteProduct(product.id);
        successes.push(product.id);
      } catch (err) {
        failures.push({ name: product.name, reason: err.message || 'Operation failed.' });
      }
    }

    await load();
    setBulkBusy(false);
    setBulkOp(null);

    // Retain failed IDs in selection, clear succeeded ones
    const failedNames = new Set(failures.map((f) => f.name));
    const failedIds = new Set(selectedProducts.filter((p) => failedNames.has(p.name)).map((p) => p.id));
    setSelectedIds(failedIds);

    if (successes.length > 0 || failures.length > 0) {
      setBulkResult({ successes: successes.length, failures, opLabel });
    }
  };

  /* ── editor helpers (unchanged) ─────────────────────────────────────────── */
  const toForm = (product) => {
    const images = [...(product.images || [])].sort((a, b) => a.display_order - b.display_order || a.id - b.id)
      .map((image) => ({ ...image, status: 'saved' }));
    return {
      id: product.id, name: product.name || '', brand: product.brand || '', description: product.description || '',
      short_description: product.short_description || '', category_id: product.category?.id || '', slug: product.slug || '', slugTouched: true,
      is_active: product.is_active, highlights: product.highlights || [], specifications: product.specifications || {},
      is_returnable: product.is_returnable ?? null, return_window_days: product.return_window_days ?? '',
      is_refundable: product.is_refundable ?? null, payment_methods: product.payment_methods || [],
      variant_image_mode: product.variant_image_mode || 'per_variant',
      initial_variant_image_mode: product.variant_image_mode || 'per_variant',
      specificationRows: Object.entries(product.specifications || {}).map(([key, value]) => ({ key, value })),
      pendingDeleteImages: [],
      variants: [...product.variants].sort((a, b) => a.id - b.id).map((variant) => ({ clientKey: String(variant.id), id: variant.id, sku: variant.sku, name: variant.name, price: variant.price,
        mrp: variant.mrp ?? variant.price, total_stock: variant.inventory?.total_stock ?? 0, is_available: variant.is_available,
        reserved_stock: variant.inventory?.reserved_stock ?? 0, images: images.filter((image) => image.variant_id === variant.id) })),
      images: images.filter((image) => image.variant_id == null),
    };
  };

  const edit = (product) => { setMessage(''); setForm(product ? toForm(product) : blankProduct()); };
  const change = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const changeVariant = (index, key, value) => setForm((current) => ({ ...current,
    variants: current.variants.map((variant, idx) => idx === index ? { ...variant, [key]: value } : variant) }));
  const setSpecification = (index, part, value) => setForm((current) => ({ ...current,
    specificationRows: current.specificationRows.map((row, rowIndex) => rowIndex === index ? { ...row, [part]: value } : row) }));
  const addSpecification = () => setForm((current) => ({ ...current, specificationRows: [...current.specificationRows, { key: '', value: '' }] }));
  const removeSpecification = (index) => setForm((current) => ({ ...current,
    specificationRows: current.specificationRows.filter((_, rowIndex) => rowIndex !== index) }));
  const galleryFor = (groupKey, value = form) => groupKey === 'shared'
    ? value.images : value.variants.find((variant) => variant.clientKey === groupKey)?.images || [];
  const updateGallery = (groupKey, images) => setForm((current) => groupKey === 'shared'
    ? { ...current, images }
    : { ...current, variants: current.variants.map((variant) => variant.clientKey === groupKey ? { ...variant, images } : variant) });
  const addFiles = (groupKey, event) => {
    const selected = Array.from(event.target.files || []);
    event.target.value = '';
    const remaining = 8 - galleryFor(groupKey).length;
    if (selected.length > remaining) { setMessage(`Only ${Math.max(remaining, 0)} more image${remaining === 1 ? '' : 's'} can be added to this gallery.`); return; }
    const additions = selected.map((file) => ({ file, url: URL.createObjectURL(file), status: 'queued', progress: 0, error: '' }));
    updateGallery(groupKey, [...galleryFor(groupKey), ...additions]);
    setMessage('');
  };
  const moveImage = async (groupKey, index, delta) => {
    const gallery = galleryFor(groupKey);
    const target = index + delta;
    if (target < 0 || target >= gallery.length) return;
    const images = [...gallery];
    [images[index], images[target]] = [images[target], images[index]];
    updateGallery(groupKey, images);
    const variant = groupKey === 'shared' ? null : form.variants.find((item) => item.clientKey === groupKey);
    const hasPendingDeletion = form.pendingDeleteImages.some((image) => image.variant_id === (variant?.id ?? null));
    const imageIds = images.filter((image) => image.status === 'saved').map((image) => image.id);
    if (form.id && !hasPendingDeletion && (groupKey === 'shared' || variant?.id) && imageIds.length) {
      try { await productService.orderImages(form.id, imageIds, variant?.id ?? null); }
      catch (error) { setMessage(error.message || 'Image order could not be saved.'); }
    }
  };
  const removeImage = (groupKey, index) => {
    const gallery = galleryFor(groupKey);
    const image = gallery[index];
    if (image.url && image.file) URL.revokeObjectURL(image.url);
    const images = gallery.filter((_, rowIndex) => rowIndex !== index);
    const variant = groupKey === 'shared' ? null : form.variants.find((item) => item.clientKey === groupKey);
    updateGallery(groupKey, images);
    if (image.status === 'saved') setForm((current) => ({ ...current,
      pendingDeleteImages: [...current.pendingDeleteImages, { id: image.id, variant_id: variant?.id ?? null }] }));
  };
  const retryImage = (groupKey, index) => updateGallery(groupKey, galleryFor(groupKey).map((image, row) =>
    row === index ? { ...image, status: 'queued', error: '' } : image));
  const cancelEdit = () => {
    if (form) [...form.images, ...form.variants.flatMap((variant) => variant.images)]
      .filter((image) => image.file && image.url).forEach((image) => URL.revokeObjectURL(image.url));
    setForm(null);
  };

  const save = async (event) => {
    event.preventDefault();
    const rows = form.specificationRows;
    const keys = rows.map(({ key }) => key.trim().toLocaleLowerCase());
    if (rows.some(({ key, value }) => !key.trim() || !String(value).trim()) || new Set(keys).size !== keys.length) {
      setMessage('Enter a unique name and value for every specification.'); return;
    }
    if (form.variants.some((variant) => numeric(variant.mrp || variant.price) < numeric(variant.price))) {
      setMessage('Each MRP must be greater than or equal to its selling price.'); return;
    }
    const submittedSkus = form.variants.map((variant) => variant.sku.trim().toLocaleLowerCase());
    if (new Set(submittedSkus).size !== submittedSkus.length) { setMessage('Each variant must have a unique SKU.'); return; }
    if (form.is_returnable && numeric(form.return_window_days) < 1) { setMessage('Enter a positive return window for a returnable product.'); return; }
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
        variant_image_mode: form.variant_image_mode,
        variants: form.variants.map((variant) => ({ id: variant.id ?? null, name: variant.name.trim(), sku: variant.sku.trim(),
          price: Number(variant.price), mrp: Number(variant.mrp || variant.price), total_stock: Number(variant.total_stock), is_available: variant.is_available })),
      };
      const saved = form.id ? await productService.updateProduct(form.id, payload) : await productService.createProduct(payload);
      let working = toForm(saved);
      const variantsBySku = new Map(saved.variants.map((variant) => [variant.sku, variant]));
      const removedImageIds = new Set((form.pendingDeleteImages || []).map((image) => image.id));
      working.images = form.images.filter((image) => !removedImageIds.has(image.id)).map((image) => ({ ...image, variant_id: null }));
      working.variants = working.variants.map((savedVariant) => {
        const original = form.variants.find((variant) => variant.sku.trim() === savedVariant.sku);
        const groupImages = (original?.images || []).filter((image) => !removedImageIds.has(image.id)).map((image) => ({ ...image, variant_id: savedVariant.id }));
        return { ...savedVariant, images: groupImages };
      });
      for (const variant of form.variants) {
        const savedVariant = variantsBySku.get(variant.sku.trim());
        if (!savedVariant) continue;
        const target = working.variants.find((item) => item.id === savedVariant.id);
        if (target) target.images = target.images.map((image) => image.file ? { ...image, variantSku: savedVariant.sku } : image);
      }
      let pendingDeleteImages = [...(form.pendingDeleteImages || [])];
      working.pendingDeleteImages = pendingDeleteImages;
      setForm(working);
      for (const pendingImage of [...pendingDeleteImages]) {
        await productService.deleteImage(saved.id, pendingImage.id);
        pendingDeleteImages = pendingDeleteImages.filter((image) => image.id !== pendingImage.id);
        working.pendingDeleteImages = pendingDeleteImages;
        setForm({ ...working });
      }
      const setWorkingGallery = (clientKey, images) => {
        if (clientKey === 'shared') working.images = images;
        else working.variants = working.variants.map((variant) => variant.clientKey === clientKey ? { ...variant, images } : variant);
        setForm({ ...working, variants: [...working.variants] });
      };
      const groups = [{ clientKey: 'shared', variantId: null, images: working.images },
        ...working.variants.filter((variant) => variant.id).map((variant) => ({ clientKey: variant.clientKey, variantId: variant.id, images: variant.images }))];
      for (const group of groups) {
        const orderedIds = group.images.filter((image) => image.status === 'saved').map((image) => image.id);
        if (orderedIds.length) await productService.orderImages(saved.id, orderedIds, group.variantId);
      }
      for (const group of groups) {
        let gallery = [...(group.clientKey === 'shared' ? working.images : working.variants.find((variant) => variant.clientKey === group.clientKey)?.images || [])];
        for (let index = 0; index < gallery.length; index += 1) {
          const entry = gallery[index];
          if (!entry.file || entry.status === 'saved') continue;
          gallery[index] = { ...entry, status: 'uploading', progress: 0, error: '' };
          setWorkingGallery(group.clientKey, [...gallery]);
          try {
            const uploaded = await productService.uploadImage(saved.id, entry.file, (progress) => {
              gallery[index] = { ...gallery[index], progress };
              setWorkingGallery(group.clientKey, [...gallery]);
            }, group.variantId);
            if (entry.url) URL.revokeObjectURL(entry.url);
            gallery[index] = { id: uploaded.image_id, url: uploaded.url, display_order: uploaded.display_order, variant_id: group.variantId, status: 'saved' };
          } catch (error) {
            gallery[index] = { ...entry, status: 'failed', error: error.message || 'Upload failed.' };
          }
          setWorkingGallery(group.clientKey, [...gallery]);
        }
      }
      for (const group of groups) {
        const gallery = group.clientKey === 'shared' ? working.images : working.variants.find((variant) => variant.clientKey === group.clientKey)?.images || [];
        const finalIds = gallery.filter((image) => image.status === 'saved').map((image) => image.id);
        if (finalIds.length) await productService.orderImages(saved.id, finalIds, group.variantId);
      }
      const refreshed = await productService.adminProduct(saved.id);
      const nextForm = toForm(refreshed);
      const failedShared = working.images.filter((image) => image.file && (image.status === 'failed' || image.status === 'queued'));
      nextForm.images.push(...failedShared);
      for (const variant of working.variants) {
        const failedVariantImages = variant.images.filter((image) => image.file && (image.status === 'failed' || image.status === 'queued'));
        if (!failedVariantImages.length) continue;
        const target = nextForm.variants.find((item) => item.sku === variant.sku);
        if (target) target.images.push(...failedVariantImages.map((image) => ({ ...image, variantSku: variant.sku })));
      }
      const hasFailures = [...nextForm.images, ...nextForm.variants.flatMap((variant) => variant.images)]
        .some((image) => image.file && (image.status === 'failed' || image.status === 'queued'));
      if (hasFailures) {
        setForm({ ...nextForm, pendingDeleteImages });
        if (!form.id) {
          setToast({ visible: true, message: 'Product record created but some images need retry. Retry the failed images below.', type: 'warning' });
        } else {
          setMessage('Product details saved; some images failed to upload. Retry the failed images below.');
        }
      } else {
        const isNewProduct = !form.id;
        const toastName = saved.name;
        const toastCategory = saved.category?.name || 'Uncategorised';
        const toastSku = displaySku(saved.variants?.[0]?.sku || '');
        await load();
        setForm(null);
        if (isNewProduct) {
          setToast({ visible: true, message: `${toastName} has been added to inventory · Category: ${toastCategory} · SKU: ${toastSku}`, type: 'success' });
        } else {
          setMessage('Product saved.');
        }
      }
    } catch (error) { setMessage(error.message || 'Product details could not be saved.'); }
    finally { setBusy(false); }
  };

  const toggleArchive = async (product) => {
    try { await productService.archiveProduct(product.id, !product.is_active); await load(); }
    catch (error) { setMessage(error.message || 'Could not update product status.'); }
  };

  const handleDeleteProduct = async () => {
    if (!deleteTarget) return;
    const product = deleteTarget.product;
    const name = product.name;
    const categoryName = product.category?.name || 'Uncategorised';
    const sku = displaySku(product.variants?.[0]?.sku || '');
    setDeleteBusy(true);
    try {
      await productService.deleteProduct(product.id);
      await load();
      setDeleteTarget(null);
      setToast({ visible: true, message: `${name} was deleted from inventory · Category: ${categoryName} · SKU: ${sku}`, type: 'success' });
    } catch (error) {
      setMessage(error.message || 'Product could not be deleted.');
    } finally {
      setDeleteBusy(false);
    }
  };

  /* ── Render ──────────────────────────────────────────────────────────────── */
  return <section className="fk-catalog-admin">
    {!form ? <>
      <header className="fk-catalog-admin-heading">
        <div><h1>Manage Products</h1><p>Catalogue details, variants, availability and on-hand stock.</p></div>
        <button onClick={() => edit(null)}>Add Product</button>
      </header>
      {message && <p className="fk-catalog-admin-message" role="status">{message}</p>}
      {loadError && <p className="fk-catalog-admin-message" role="alert">{loadError}</p>}
      <BulkResultBar result={bulkResult} onDismiss={() => setBulkResult(null)} />

      {/* Filters toolbar */}
      <div className="fk-catalog-admin-filters">
        <input aria-label="Search products or brands" placeholder="Search products or brands" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select aria-label="Filter by category" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
          <option value="">All categories</option>
          {flatCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select aria-label="Filter by status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="archived">Archived</option>
        </select>
      </div>

      {/* Bulk selection bar */}
      {someSelected && (
        <div className="fk-bulk-toolbar">
          <span className="fk-bulk-toolbar-count">{selectedIds.size} selected</span>
          <button type="button" className="fk-bulk-toolbar-clear" onClick={clearSelection}>Clear selection</button>
          <div className="fk-bulk-toolbar-sep" />
          {hasActive && (
            <button type="button" className="fk-bulk-btn" onClick={() => setBulkOp('archive')}>Archive selected</button>
          )}
          {hasArchived && (
            <button type="button" className="fk-bulk-btn" onClick={() => setBulkOp('restore')}>Restore selected</button>
          )}
          <button type="button" className="fk-bulk-btn fk-bulk-btn--danger" onClick={() => setBulkOp('delete')}>
            <Trash2 size={13} /> Delete selected
          </button>
        </div>
      )}

      <div className="fk-catalog-table-wrap">
        <table className="fk-catalog-table">
          <thead>
            <tr>
              <th className="fk-col-check">
                <input
                  type="checkbox"
                  aria-label="Select all visible products"
                  checked={allSelected}
                  ref={(el) => { if (el) el.indeterminate = someSelected && !allSelected; }}
                  onChange={toggleSelectAll}
                />
              </th>
              <th>Product</th><th>Brand / Category</th><th>Variants</th><th>Price</th><th>Stock</th><th>Status</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {visibleProducts.map((product) => {
              const stock = product.variants.reduce((sum, v) => sum + (v.inventory?.available_stock || 0), 0);
              const checked = selectedIds.has(product.id);
              return <tr key={product.id} className={checked ? 'is-selected' : ''}>
                <td className="fk-col-check">
                  <input type="checkbox" aria-label={`Select ${product.name}`} checked={checked} onChange={() => toggleRow(product.id)} />
                </td>
                <td className="fk-admin-product-name">{product.images?.[0]?.url && <img src={product.images[0].url} alt="" />}<strong>{product.name}</strong></td>
                <td>{product.brand || '—'}<small>{product.category?.name || 'Uncategorised'}</small></td>
                <td>{product.variants.length}<small>{product.variants[0]?.sku || ''}</small></td>
                <td>{product.variants[0] ? `₹${Number(product.variants[0].price).toLocaleString('en-IN')}` : '—'}</td>
                <td>{stock}</td>
                <td>{product.is_active ? 'Active' : 'Archived'}</td>
                <td>
                  <button onClick={() => edit(product)}>Edit</button>{' '}
                  <button onClick={() => toggleArchive(product)}>{product.is_active ? 'Archive' : 'Restore'}</button>{' '}
                  <button title="Permanently delete product" aria-label={`Permanently delete ${product.name}`}
                    onClick={() => { setMessage(''); setDeleteTarget({ product }); }}
                    style={{ color: '#C03E33', borderColor: '#f3d3d0' }}><Trash2 size={14} /></button>
                </td>
              </tr>;
            })}
            {!visibleProducts.length && <tr><td colSpan="8">{loadError ? 'Catalogue is unavailable.' : 'No matching products.'}</td></tr>}
          </tbody>
        </table>
      </div>
    </> : <form className="fk-product-editor" onSubmit={save}>
      <header className="fk-product-editor-header"><div><button type="button" className="fk-editor-back" onClick={cancelEdit}>← Products</button><h1>{form.name || 'New product'}</h1><p>{form.id ? `Editing product #${form.id}` : 'Create a catalogue product'}</p></div><div className="fk-editor-header-actions"><span className={`fk-editor-status ${form.is_active ? 'is-active' : ''}`}>{form.is_active ? 'Active' : 'Archived'}</span><button type="button" onClick={cancelEdit}>Cancel</button><button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save product'}</button></div></header>
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
        <EditorSection title="Product gallery" description="Choose how product images are selected when customers switch variants.">
          <fieldset className="fk-editor-gallery-mode" disabled={busy}>
            <legend>Product Image Behaviour</legend>
            <label className="fk-editor-gallery-mode-option">
              <input type="radio" name="variant_image_mode" value="shared" checked={form.variant_image_mode === 'shared'}
                onChange={() => change('variant_image_mode', 'shared')} />
              <span><strong>Shared Gallery</strong><small>The same images appear for every variant. Use this for sizes, capacities, pack quantities or volumes when the product looks the same. Upload images in the shared/default gallery below.</small></span>
            </label>
            <label className="fk-editor-gallery-mode-option">
              <input type="radio" name="variant_image_mode" value="per_variant" checked={form.variant_image_mode === 'per_variant'}
                onChange={() => change('variant_image_mode', 'per_variant')} />
              <span><strong>Separate Gallery Per Variant</strong><small>Each variant can have its own images for different colours, designs, finishes or models. A variant without its own images uses the shared/default gallery only for the first variant.</small></span>
            </label>
          </fieldset>
          {form.variant_image_mode !== form.initial_variant_image_mode && form.variants.some((variant) => variant.images.length > 0) &&
            <p className="fk-editor-note" role="alert">This product already has variant-specific images. Changing to Shared Gallery keeps those image records attached to their variants, but the storefront will not display them while Shared Gallery is selected. Changing to Separate Gallery Per Variant makes each variant gallery visible again. No images or associations will be changed automatically.</p>}
          <p className="fk-editor-note">The shared/default gallery has {form.images.length}/8 images and is shown for every variant in Shared Gallery mode.</p>
          <ImageGalleryEditor title="Shared / default gallery" gallery={form.images} busy={busy}
            onAdd={(event) => addFiles('shared', event)} onMove={(index, delta) => moveImage('shared', index, delta)}
            onRemove={(index) => removeImage('shared', index)} onRetry={(index) => retryImage('shared', index)} />
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
          <div className="fk-editor-variants">{form.variants.map((variant, index) => <div className="fk-editor-variant" key={variant.clientKey}>
            <div className="fk-editor-variant-title"><strong>Variant {index + 1} — {variant.name || 'Unnamed variant'}</strong>{variant.id && <small>{variant.reserved_stock} reserved</small>}</div>
            <div className="fk-editor-fields"><label>Variant name<input required value={variant.name} onChange={(event) => changeVariant(index, 'name', event.target.value)} /></label><label>SKU<input required maxLength="80" value={variant.sku} onChange={(event) => changeVariant(index, 'sku', event.target.value)} /></label>
              <label>Selling price<input type="number" min="0" step="0.01" required value={variant.price} onChange={(event) => changeVariant(index, 'price', event.target.value)} /></label><label>MRP<input type="number" min={variant.price || 0} step="0.01" required value={variant.mrp} onChange={(event) => changeVariant(index, 'mrp', event.target.value)} /></label>
              <label>Total stock<input type="number" min={variant.reserved_stock || 0} step="1" required value={variant.total_stock} onChange={(event) => changeVariant(index, 'total_stock', event.target.value)} /></label><label className="fk-editor-toggle"><input type="checkbox" checked={variant.is_available} onChange={(event) => changeVariant(index, 'is_available', event.target.checked)} /> Available</label>
            </div>
            {form.variant_image_mode === 'shared'
              ? variant.images.length
                ? <><p className="fk-editor-note">{variant.images.length} existing variant-specific image{variant.images.length === 1 ? '' : 's'} remain attached to this variant. They are hidden from the storefront in Shared Gallery mode; switch to Separate Gallery Per Variant to display them.</p>
                    <ImageGalleryEditor title={`Existing images for ${variant.name || `variant ${index + 1}`}`} gallery={variant.images} busy={busy} uploadEnabled={false}
                      onAdd={(event) => addFiles(variant.clientKey, event)} onMove={(imageIndex, delta) => moveImage(variant.clientKey, imageIndex, delta)}
                      onRemove={(imageIndex) => removeImage(variant.clientKey, imageIndex)} onRetry={(imageIndex) => retryImage(variant.clientKey, imageIndex)} /></>
                : <p className="fk-editor-note">Individual image uploads are disabled in Shared Gallery mode to avoid duplicate uploads.</p>
              : <><p className="fk-editor-note">{variant.images.length ? 'This variant displays its own gallery.' : index === 0 ? 'No variant images yet; the first variant uses the shared/default gallery until its own images are added.' : 'No images are assigned to this variant yet.'}</p>
                  <ImageGalleryEditor title={`Images for ${variant.name || `variant ${index + 1}`}`} gallery={variant.images} busy={busy}
                    onAdd={(event) => addFiles(variant.clientKey, event)} onMove={(imageIndex, delta) => moveImage(variant.clientKey, imageIndex, delta)}
                    onRemove={(imageIndex) => removeImage(variant.clientKey, imageIndex)} onRetry={(imageIndex) => retryImage(variant.clientKey, imageIndex)} /></>}
            <button className="fk-editor-remove" type="button" disabled={form.variants.length === 1} onClick={() => {
              variant.images.filter((image) => image.file && image.url).forEach((image) => URL.revokeObjectURL(image.url));
              change('variants', form.variants.filter((_, row) => row !== index));
            }}>Remove variant</button>
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
      <div className="fk-editor-bottom-actions"><span>{form.id ? 'Editing product details' : 'New product'}</span><div><button type="button" onClick={cancelEdit}>Cancel</button><button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save product'}</button></div></div>
    </form>}

    {/* Single-product delete dialog */}
    {deleteTarget && <div className="fk-catalog-form-backdrop" onClick={() => { if (!deleteBusy) setDeleteTarget(null); }}>
      <div className="ad-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="fk-prod-delete-title">
        <div className="ad-modal-header"><span className="ad-modal-title" id="fk-prod-delete-title">Permanently delete product?</span><button className="ad-modal-close" aria-label="Close" disabled={deleteBusy} onClick={() => setDeleteTarget(null)}>&#10005;</button></div>
        <div className="ad-modal-body">
          <p style={{ fontSize: '13.5px', lineHeight: '1.55', color: 'var(--fk-text-primary)' }}>You are about to permanently delete <strong>{deleteTarget.product.name}</strong>. This action cannot be undone.</p>
          <p style={{ fontSize: '13px', color: '#8a3228', background: '#fdf2f0', border: '1px solid #f3d3d0', borderRadius: '6px', padding: '10px 12px', margin: '8px 0 0' }}>Permanent deletion removes the product and all its images from the catalogue. If this product has order or cart history, deletion is blocked — archive it instead.</p>
          {message && <p role="alert" style={{ fontSize: '13px', color: '#a63227', marginTop: '8px' }}>{message}</p>}
        </div>
        <div className="ad-modal-footer"><button type="button" className="ad-btn-secondary" disabled={deleteBusy} onClick={() => { setMessage(''); setDeleteTarget(null); }}>Cancel</button><button type="button" className="ad-btn-danger" disabled={deleteBusy} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }} onClick={handleDeleteProduct}><Trash2 size={14} />{deleteBusy ? 'Deleting…' : 'Delete permanently'}</button></div>
      </div>
    </div>}

    {/* Bulk confirm dialog */}
    {bulkOp && <BulkConfirmDialog op={bulkOp} count={selectedProducts.length} busy={bulkBusy} onCancel={() => setBulkOp(null)} onConfirm={executeBulk} />}

    <CenterToast visible={toast.visible} message={toast.message} type={toast.type} onDismiss={() => setToast((t) => ({ ...t, visible: false }))} />
  </section>;
}

export default ProductManagement;
