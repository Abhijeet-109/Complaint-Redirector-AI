import React, { useEffect, useState } from 'react';
import { Search, Truck, Plus, Pencil, Ban } from 'lucide-react';
import { adminService } from '../../services/adminService';

const blank = { pin_code: '', area: '', city: '', state: '', is_active: true };

export function ShipmentOptions() {
  const [rows, setRows] = useState([]);
  const [query, setQuery] = useState('');
  const [form, setForm] = useState(blank);
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const refresh = async (term = query) => { setLoading(true); try { setRows(await adminService.listShipmentOptions(term)); setError(''); } catch (cause) { setError(cause.message || 'Could not load shipment options.'); } finally { setLoading(false); } };
  useEffect(() => { const timer = setTimeout(() => refresh(query), 250); return () => clearTimeout(timer); }, [query]);
  const save = async (event) => {
    event.preventDefault(); setBusy(true); setError('');
    try { if (editingId) await adminService.updateShipmentOption(editingId, form); else await adminService.createShipmentOption(form); setForm(blank); setEditingId(null); await refresh(); }
    catch (cause) { setError(cause.message || 'Shipment option could not be saved.'); }
    finally { setBusy(false); }
  };
  return <main style={{ padding: 26 }}>
    <header className="ad-header-row"><div><h1 className="ad-page-heading">Shipment Options</h1><p className="ad-page-subtext">Manage delivery serviceability by PIN code and area.</p></div><div className="ad-live-pill"><Truck size={15} /> Serviceability</div></header>
    {error && <p className="hd-error-state" role="alert">{error}</p>}
    <form onSubmit={save} className="ad-panel" style={{ padding: 18, marginBottom: 20 }}>
      <h2 className="ad-section-title">{editingId ? 'Edit location' : 'Add serviceable location'}</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(155px,1fr))', gap: 12 }}>
        {[['pin_code','PIN code'],['area','Area / locality'],['city','City'],['state','State']].map(([key,label]) => <label key={key} style={{ display: 'grid', gap: 5 }}>{label}<input required value={form[key]} maxLength={key === 'pin_code' ? 6 : key === 'area' ? 120 : 100} pattern={key === 'pin_code' ? '[0-9]{6}' : undefined} inputMode={key === 'pin_code' ? 'numeric' : undefined} onChange={(event) => setForm({ ...form, [key]: key === 'pin_code' ? event.target.value.replace(/\D/g, '').slice(0, 6) : event.target.value })} /></label>)}
        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}><input type="checkbox" checked={form.is_active} onChange={(event) => setForm({ ...form, is_active: event.target.checked })} /> Active</label>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}><button type="submit" className="ad-btn-primary" disabled={busy}>{editingId ? <Pencil size={15} /> : <Plus size={15} />}{busy ? 'Saving…' : editingId ? 'Update location' : 'Add location'}</button>{editingId && <button type="button" className="ad-btn-secondary" onClick={() => { setEditingId(null); setForm(blank); }}>Cancel</button>}</div>
    </form>
    <label style={{ display: 'flex', gap: 8, maxWidth: 440, marginBottom: 14 }}><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search PIN code, area, city or state" /></label>
    {loading ? <p role="status">Loading serviceable locations…</p> : rows.length === 0 ? <p>No shipment options match this search.</p> : <div className="ad-table-panel" style={{ overflowX: 'auto' }}><table className="ad-data-table"><thead><tr><th>PIN code</th><th>Area / locality</th><th>City</th><th>State</th><th>Status</th><th>Actions</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td>{row.pin_code}</td><td>{row.area}</td><td>{row.city}</td><td>{row.state}</td><td>{row.is_active ? 'Active' : 'Inactive'}</td><td><button type="button" className="ad-table-btn" title="Edit" onClick={() => { setEditingId(row.id); setForm({ ...row }); }}><Pencil size={15} /></button>{row.is_active && <button type="button" className="ad-table-btn" title="Deactivate" onClick={async () => { try { await adminService.deactivateShipmentOption(row.id); await refresh(); } catch (cause) { setError(cause.message || 'Could not deactivate location.'); } }}><Ban size={15} /></button>}</td></tr>)}</tbody></table></div>}
  </main>;
}

export default ShipmentOptions;
