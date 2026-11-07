import React, { useEffect, useMemo, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { productService } from '../../services/productService';
import { CenterToast } from '../common/CenterToast';

const flatten = (rows) => rows.flatMap((row) => [row, ...flatten(row.children || [])]);

export function CategoryManagement() {
  const [tree, setTree] = useState([]);
  const [form, setForm] = useState(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [toast, setToast] = useState({ visible: false, message: '' });
  const categories = useMemo(() => flatten(tree), [tree]);
  const load = async () => setTree(await productService.categoriesAdmin());
  useEffect(() => { load().catch((error) => setMessage(error.message)); }, []);
  const edit = (category) => setForm(category ? { id: category.id, name: category.name, slug: category.slug,
    parent_id: category.parent_id ?? '', display_order: category.display_order, is_active: category.is_active } :
    { name: '', slug: '', parent_id: '', display_order: 0, is_active: true });
  const save = async (event) => {
    event.preventDefault(); setBusy(true); setMessage('');
    try {
      const payload = { ...form, parent_id: form.parent_id ? Number(form.parent_id) : null, display_order: Number(form.display_order) };
      if (form.id) await productService.updateCategory(form.id, payload); else await productService.createCategory(payload);
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

  return <section className="fk-catalog-admin">
    <header className="fk-catalog-admin-heading"><div><h1>Manage Categories</h1><p>Organize the active category tree and display order.</p></div><button onClick={() => edit(null)}>Add Category</button></header>
    {message && <p className="fk-catalog-admin-message" role="status">{message}</p>}
    <div className="fk-catalog-table-wrap"><table className="fk-catalog-table"><thead><tr><th>Name</th><th>Slug</th><th>Parent</th><th>Display order</th><th>Status</th><th>Actions</th></tr></thead><tbody>
      {categories.map((category) => <tr key={category.id}><td>{category.name}</td><td>{category.slug}</td><td>{categories.find((item) => item.id === category.parent_id)?.name || '—'}</td><td>{category.display_order}</td><td>{category.is_active ? 'Active' : 'Archived'}</td><td><button onClick={() => edit(category)}>Edit</button> <button onClick={() => toggle(category)}>{category.is_active ? 'Archive' : 'Restore'}</button> <button title="Permanently delete category" aria-label={`Permanently delete ${category.name}`} onClick={() => { setMessage(''); setDeleteTarget({ category }); }} style={{ color: '#C03E33', borderColor: '#f3d3d0' }}><Trash2 size={14} /></button></td></tr>)}
      {!categories.length && <tr><td colSpan="6">No categories available.</td></tr>}
    </tbody></table></div>
    {form && <div className="fk-catalog-form-backdrop"><form className="fk-catalog-form fk-category-form" onSubmit={save}>
      <div className="fk-catalog-form-heading"><h2>{form.id ? 'Edit Category' : 'Add Category'}</h2><button type="button" onClick={() => setForm(null)}>Cancel</button></div>
      <label>Name<input required maxLength="120" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
      <label>Slug<input value={form.slug} onChange={(event) => setForm({ ...form, slug: event.target.value })} /></label>
      <label>Parent category<select value={form.parent_id} onChange={(event) => setForm({ ...form, parent_id: event.target.value })}><option value="">No parent</option>{categories.filter((item) => item.id !== form.id).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label>Display order<input type="number" value={form.display_order} onChange={(event) => setForm({ ...form, display_order: event.target.value })} /></label>
      <label className="fk-catalog-check"><input type="checkbox" checked={form.is_active} onChange={(event) => setForm({ ...form, is_active: event.target.checked })} /> Active</label>
      <div className="fk-catalog-form-actions"><button type="button" onClick={() => setForm(null)}>Cancel</button><button disabled={busy}>{busy ? 'Saving…' : 'Save category'}</button></div>
    </form></div>}
    {deleteTarget && <div className="fk-catalog-form-backdrop" onClick={() => { if (!deleteBusy) setDeleteTarget(null); }}>
      <div className="ad-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="fk-cat-delete-title">
        <div className="ad-modal-header"><span className="ad-modal-title" id="fk-cat-delete-title">Permanently delete category?</span><button className="ad-modal-close" aria-label="Close" disabled={deleteBusy} onClick={() => setDeleteTarget(null)}>&#10005;</button></div>
        <div className="ad-modal-body">
          <p style={{ fontSize: '13.5px', lineHeight: '1.55', color: 'var(--fk-text-primary)' }}>You are about to permanently delete the category <strong>{deleteTarget.category.name}</strong>. This action cannot be undone.</p>
          <p style={{ fontSize: '13px', color: '#8a3228', background: '#fdf2f0', border: '1px solid #f3d3d0', borderRadius: '6px', padding: '10px 12px', margin: '8px 0 0' }}>Only empty leaf categories can be deleted. Categories with products or child categories are blocked — reassign them first.</p>
          {message && <p role="alert" style={{ fontSize: '13px', color: '#a63227', marginTop: '8px' }}>{message}</p>}
        </div>
        <div className="ad-modal-footer"><button type="button" className="ad-btn-secondary" disabled={deleteBusy} onClick={() => { setMessage(''); setDeleteTarget(null); }}>Cancel</button><button type="button" className="ad-btn-danger" disabled={deleteBusy} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }} onClick={handleDeleteCategory}><Trash2 size={14} />{deleteBusy ? 'Deleting…' : 'Delete permanently'}</button></div>
      </div>
    </div>}
    <CenterToast visible={toast.visible} message={toast.message} type="success" onDismiss={() => setToast((t) => ({ ...t, visible: false }))} />
  </section>;
}

export default CategoryManagement;
