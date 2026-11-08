import React, { useEffect, useMemo, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { productService } from '../../services/productService';
import { CenterToast } from '../common/CenterToast';

const flatten = (rows) => rows.flatMap((row) => [row, ...flatten(row.children || [])]);

/* ── Bulk confirmation dialog ─────────────────────────────────────────────── */
function BulkConfirmDialog({ op, count, onConfirm, onCancel, busy }) {
  const isDelete = op === 'delete';
  const label = op === 'archive' ? 'Archive' : op === 'restore' ? 'Restore' : 'Permanently Delete';
  return (
    <div className="fk-catalog-form-backdrop" onClick={() => { if (!busy) onCancel(); }}>
      <div className="ad-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="fk-cat-bulk-title">
        <div className="ad-modal-header">
          <span className="ad-modal-title" id="fk-cat-bulk-title">{label} {count} categor{count !== 1 ? 'ies' : 'y'}?</span>
          <button className="ad-modal-close" aria-label="Close" disabled={busy} onClick={onCancel}>&#10005;</button>
        </div>
        <div className="ad-modal-body">
          <p style={{ fontSize: '13.5px', lineHeight: '1.55', color: 'var(--fk-text-primary)' }}>
            {op === 'archive' && `This will archive ${count} categor${count !== 1 ? 'ies' : 'y'}. They will be hidden from the storefront but can be restored.`}
            {op === 'restore' && `This will restore ${count} categor${count !== 1 ? 'ies' : 'y'} and make them active.`}
            {op === 'delete' && `This will permanently delete ${count} categor${count !== 1 ? 'ies' : 'y'}. This action cannot be undone.`}
          </p>
          {isDelete && (
            <p style={{ fontSize: '13px', color: '#8a3228', background: '#fdf2f0', border: '1px solid #f3d3d0', borderRadius: '6px', padding: '10px 12px', margin: '8px 0 0' }}>
              Categories with assigned products or child categories cannot be deleted and will be skipped. Reassign them first.
            </p>
          )}
        </div>
        <div className="ad-modal-footer">
          <button type="button" className="ad-btn-secondary" disabled={busy} onClick={onCancel}>Cancel</button>
          <button type="button" className={isDelete ? 'ad-btn-danger' : 'ad-btn-primary'} disabled={busy}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }} onClick={onConfirm}>
            {busy ? 'Processing…' : `${label} ${count} categor${count !== 1 ? 'ies' : 'y'}`}
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
  const cls = hasFailures ? 'fk-bulk-result--warn' : 'fk-bulk-result--ok';
  return (
    <div className={`fk-bulk-result ${cls}`}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px' }}>
        <div>
          {result.successes > 0 && <div>{result.successes} categor{result.successes !== 1 ? 'ies' : 'y'} {result.opLabel} successfully.</div>}
          {result.failures.map((f, i) => <div key={i} style={{ marginTop: '4px' }}><strong>{f.name}</strong>: {f.reason}</div>)}
        </div>
        <button type="button" onClick={onDismiss} style={{ border: 0, background: 'none', cursor: 'pointer', color: 'inherit', fontSize: '14px', lineHeight: 1 }}>&#10005;</button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════ */
export function CategoryManagement() {
  const [tree, setTree] = useState([]);
  const [form, setForm] = useState(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [toast, setToast] = useState({ visible: false, message: '' });

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [parentFilter, setParentFilter] = useState('');

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkOp, setBulkOp] = useState(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkResult, setBulkResult] = useState(null);

  const categories = useMemo(() => flatten(tree), [tree]);

  const load = async () => setTree(await productService.categoriesAdmin());
  useEffect(() => { load().catch((error) => setMessage(error.message || 'Categories could not be loaded.')); }, []);

  // Clear selection when filters change
  useEffect(() => { setSelectedIds(new Set()); setBulkResult(null); }, [search, statusFilter, parentFilter]);

  const rootCategories = useMemo(() => categories.filter((c) => c.parent_id == null), [categories]);

  const visibleCategories = useMemo(() => categories.filter((c) => {
    const term = search.toLowerCase();
    if (search && !c.name.toLowerCase().includes(term) && !c.slug.toLowerCase().includes(term)) return false;
    if (statusFilter === 'active' && !c.is_active) return false;
    if (statusFilter === 'archived' && c.is_active) return false;
    if (parentFilter === '__none__' && c.parent_id != null) return false;
    if (parentFilter && parentFilter !== '__none__' && String(c.parent_id) !== parentFilter) return false;
    return true;
  }), [categories, search, statusFilter, parentFilter]);

  const visibleIds = useMemo(() => new Set(visibleCategories.map((c) => c.id)), [visibleCategories]);
  const allSelected = visibleCategories.length > 0 && visibleCategories.every((c) => selectedIds.has(c.id));
  const someSelected = selectedIds.size > 0;

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(visibleCategories.map((c) => c.id)));
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

  const selectedCategories = useMemo(
    () => categories.filter((c) => selectedIds.has(c.id) && visibleIds.has(c.id)),
    [categories, selectedIds, visibleIds],
  );
  const hasActive = selectedCategories.some((c) => c.is_active);
  const hasArchived = selectedCategories.some((c) => !c.is_active);

  const executeBulk = async () => {
    if (!bulkOp || selectedCategories.length === 0) return;
    setBulkBusy(true);
    const successes = [];
    const failures = [];
    const opLabel = bulkOp === 'archive' ? 'archived' : bulkOp === 'restore' ? 'restored' : 'deleted';

    for (const category of selectedCategories) {
      try {
        if (bulkOp === 'archive') await productService.archiveCategory(category.id, false);
        else if (bulkOp === 'restore') await productService.archiveCategory(category.id, true);
        else if (bulkOp === 'delete') await productService.deleteCategory(category.id);
        successes.push(category.id);
      } catch (err) {
        failures.push({ name: category.name, reason: err.message || 'Operation failed.' });
      }
    }

    await load();
    setBulkBusy(false);
    setBulkOp(null);

    const failedNames = new Set(failures.map((f) => f.name));
    const failedIds = new Set(selectedCategories.filter((c) => failedNames.has(c.name)).map((c) => c.id));
    setSelectedIds(failedIds);

    if (successes.length > 0 || failures.length > 0) {
      setBulkResult({ successes: successes.length, failures, opLabel });
    }
  };

  /* ── Editor helpers ──────────────────────────────────────────────────────── */
  const edit = (category) => setForm(category
    ? { id: category.id, name: category.name, slug: category.slug, parent_id: category.parent_id ?? '', display_order: category.display_order, is_active: category.is_active }
    : { name: '', slug: '', parent_id: '', display_order: 0, is_active: true });

  const save = async (event) => {
    event.preventDefault(); setBusy(true); setMessage('');
    try {
      const payload = { ...form, parent_id: form.parent_id ? Number(form.parent_id) : null, display_order: Number(form.display_order) };
      if (form.id) await productService.updateCategory(form.id, payload);
      else await productService.createCategory(payload);
      await load(); setForm(null); setMessage('Category saved.');
    } catch (error) { setMessage(error.message || 'Could not save category.'); }
    finally { setBusy(false); }
  };

  const toggle = async (category) => {
    try { await productService.archiveCategory(category.id, !category.is_active); await load(); }
    catch (error) { setMessage(error.message || 'Reassign products and child categories before archiving.'); }
  };

  const handleDeleteCategory = async () => {
    if (!deleteTarget) return;
    const category = deleteTarget.category;
    const name = category.name;
    setDeleteBusy(true);
    try {
      await productService.deleteCategory(category.id);
      await load();
      setDeleteTarget(null);
      setToast({ visible: true, message: `Category ${name} was deleted.` });
    } catch (error) {
      setMessage(error.message || 'Category could not be deleted.');
    } finally {
      setDeleteBusy(false);
    }
  };

  /* ── Render ──────────────────────────────────────────────────────────────── */
  return <section className="fk-catalog-admin">
    <header className="fk-catalog-admin-heading">
      <div><h1>Manage Categories</h1><p>Organize the active category tree and display order.</p></div>
      <button onClick={() => edit(null)}>Add Category</button>
    </header>
    {message && <p className="fk-catalog-admin-message" role="status">{message}</p>}
    <BulkResultBar result={bulkResult} onDismiss={() => setBulkResult(null)} />

    {/* Filters toolbar */}
    <div className="fk-catalog-admin-filters">
      <input aria-label="Search categories" placeholder="Search by name or slug" value={search} onChange={(e) => setSearch(e.target.value)} />
      <select aria-label="Filter by status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
        <option value="">All statuses</option>
        <option value="active">Active</option>
        <option value="archived">Archived</option>
      </select>
      <select aria-label="Filter by parent" value={parentFilter} onChange={(e) => setParentFilter(e.target.value)}>
        <option value="">All parents</option>
        <option value="__none__">No parent (root)</option>
        {rootCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
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
                aria-label="Select all visible categories"
                checked={allSelected}
                ref={(el) => { if (el) el.indeterminate = someSelected && !allSelected; }}
                onChange={toggleSelectAll}
              />
            </th>
            <th>Name</th><th>Slug</th><th>Parent</th><th>Display order</th><th>Status</th><th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {visibleCategories.map((category) => {
            const checked = selectedIds.has(category.id);
            return (
              <tr key={category.id} className={checked ? 'is-selected' : ''}>
                <td className="fk-col-check">
                  <input type="checkbox" aria-label={`Select ${category.name}`} checked={checked} onChange={() => toggleRow(category.id)} />
                </td>
                <td>{category.name}</td>
                <td>{category.slug}</td>
                <td>{categories.find((c) => c.id === category.parent_id)?.name || '—'}</td>
                <td>{category.display_order}</td>
                <td>{category.is_active ? 'Active' : 'Archived'}</td>
                <td>
                  <button onClick={() => edit(category)}>Edit</button>{' '}
                  <button onClick={() => toggle(category)}>{category.is_active ? 'Archive' : 'Restore'}</button>{' '}
                  <button title="Permanently delete category" aria-label={`Permanently delete ${category.name}`}
                    onClick={() => { setMessage(''); setDeleteTarget({ category }); }}
                    style={{ color: '#C03E33', borderColor: '#f3d3d0' }}><Trash2 size={14} /></button>
                </td>
              </tr>
            );
          })}
          {!visibleCategories.length && <tr><td colSpan="7">No matching categories.</td></tr>}
        </tbody>
      </table>
    </div>

    {/* Edit / Add form */}
    {form && <div className="fk-catalog-form-backdrop"><form className="fk-catalog-form fk-category-form" onSubmit={save}>
      <div className="fk-catalog-form-heading"><h2>{form.id ? 'Edit Category' : 'Add Category'}</h2><button type="button" onClick={() => setForm(null)}>Cancel</button></div>
      <label>Name<input required maxLength="120" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
      <label>Slug<input value={form.slug} onChange={(event) => setForm({ ...form, slug: event.target.value })} /></label>
      <label>Parent category<select value={form.parent_id} onChange={(event) => setForm({ ...form, parent_id: event.target.value })}><option value="">No parent</option>{categories.filter((item) => item.id !== form.id).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label>Display order<input type="number" value={form.display_order} onChange={(event) => setForm({ ...form, display_order: event.target.value })} /></label>
      <label className="fk-catalog-check"><input type="checkbox" checked={form.is_active} onChange={(event) => setForm({ ...form, is_active: event.target.checked })} /> Active</label>
      <div className="fk-catalog-form-actions"><button type="button" onClick={() => setForm(null)}>Cancel</button><button disabled={busy}>{busy ? 'Saving…' : 'Save category'}</button></div>
    </form></div>}

    {/* Single delete dialog */}
    {deleteTarget && <div className="fk-catalog-form-backdrop" onClick={() => { if (!deleteBusy) setDeleteTarget(null); }}>
      <div className="ad-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="fk-cat-delete-title">
        <div className="ad-modal-header"><span className="ad-modal-title" id="fk-cat-delete-title">Permanently delete category?</span><button className="ad-modal-close" aria-label="Close" disabled={deleteBusy} onClick={() => setDeleteTarget(null)}>&#10005;</button></div>
        <div className="ad-modal-body">
          <p style={{ fontSize: '13.5px', lineHeight: '1.55', color: 'var(--fk-text-primary)' }}>You are about to permanently delete the category <strong>{deleteTarget.category.name}</strong>. This action cannot be undone.</p>
          <p style={{ fontSize: '13px', color: '#8a3228', background: '#fdf2f0', border: '1px solid #f3d3d0', borderRadius: '6px', padding: '10px 12px', margin: '8px 0 0' }}>Only empty leaf categories can be deleted. Categories with products or child categories are blocked — reassign them first.</p>
          {message && <p role="alert" style={{ fontSize: '13px', color: '#a63227', marginTop: '8px' }}>{message}</p>}
        </div>
        <div className="ad-modal-footer">
          <button type="button" className="ad-btn-secondary" disabled={deleteBusy} onClick={() => { setMessage(''); setDeleteTarget(null); }}>Cancel</button>
          <button type="button" className="ad-btn-danger" disabled={deleteBusy} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }} onClick={handleDeleteCategory}>
            <Trash2 size={14} />{deleteBusy ? 'Deleting…' : 'Delete permanently'}
          </button>
        </div>
      </div>
    </div>}

    {/* Bulk confirm dialog */}
    {bulkOp && <BulkConfirmDialog op={bulkOp} count={selectedCategories.length} busy={bulkBusy} onCancel={() => setBulkOp(null)} onConfirm={executeBulk} />}

    <CenterToast visible={toast.visible} message={toast.message} type="success" onDismiss={() => setToast((t) => ({ ...t, visible: false }))} />
  </section>;
}

export default CategoryManagement;
