import React, { useEffect, useMemo, useState } from 'react';
import { productService } from '../../services/productService';

const flatten = (rows) => rows.flatMap((row) => [row, ...flatten(row.children || [])]);

export function CategoryManagement() {
  const [tree, setTree] = useState([]);
  const [form, setForm] = useState(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
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
  return <section className="fk-catalog-admin">
    <header className="fk-catalog-admin-heading"><div><h1>Manage Categories</h1><p>Organize the active category tree and display order.</p></div><button onClick={() => edit(null)}>Add Category</button></header>
    {message && <p className="fk-catalog-admin-message" role="status">{message}</p>}
    <div className="fk-catalog-table-wrap"><table className="fk-catalog-table"><thead><tr><th>Name</th><th>Slug</th><th>Parent</th><th>Display order</th><th>Status</th><th>Actions</th></tr></thead><tbody>
      {categories.map((category) => <tr key={category.id}><td>{category.name}</td><td>{category.slug}</td><td>{categories.find((item) => item.id === category.parent_id)?.name || '—'}</td><td>{category.display_order}</td><td>{category.is_active ? 'Active' : 'Archived'}</td><td><button onClick={() => edit(category)}>Edit</button> <button onClick={() => toggle(category)}>{category.is_active ? 'Archive' : 'Restore'}</button></td></tr>)}
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
  </section>;
}

export default CategoryManagement;
