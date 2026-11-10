import React, { useEffect, useState, useCallback } from 'react';
import {
  Search, Truck, Plus, Pencil, Ban, CheckCircle, RefreshCw, X, AlertTriangle,
} from 'lucide-react';
import { adminService } from '../../services/adminService';

const BLANK_FORM = { pin_code: '', area: '', city: '', state: '', is_active: true };

export function ShipmentOptions() {
  const [rows, setRows] = useState([]);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'active' | 'inactive'
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [confirmBulkDeactivate, setConfirmBulkDeactivate] = useState(false);
  const [form, setForm] = useState(BLANK_FORM);
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);
  const [confirmDeactivateId, setConfirmDeactivateId] = useState(null);

  const showToast = (type, message) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchOptions = useCallback(async (term = query) => {
    setLoading(true);
    try {
      const data = await adminService.listShipmentOptions(term);
      setRows(Array.isArray(data) ? data : []);
    } catch (err) {
      showToast('error', err.message || 'Could not load shipment options.');
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    const timer = setTimeout(() => fetchOptions(query), 250);
    return () => clearTimeout(timer);
  }, [query, fetchOptions]);

  useEffect(() => {
    setSelectedIds(new Set());
  }, [statusFilter, query]);

  const filteredRows = rows.filter(r => {
    if (statusFilter === 'active') return r.is_active;
    if (statusFilter === 'inactive') return !r.is_active;
    return true;
  });

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredRows.length && filteredRows.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredRows.map(r => r.id)));
    }
  };

  const toggleRow = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleBulkActivate = async () => {
    const toActivate = filteredRows.filter(r => selectedIds.has(r.id) && !r.is_active);
    if (toActivate.length === 0) {
      showToast('error', 'None of the selected locations are inactive.');
      return;
    }
    setBulkBusy(true);
    let successCount = 0;
    let failCount = 0;
    for (const row of toActivate) {
      try {
        await adminService.activateShipmentOption(row.id, row);
        successCount++;
      } catch (err) {
        failCount++;
      }
    }
    setBulkBusy(false);
    setSelectedIds(new Set());
    showToast(successCount > 0 ? 'success' : 'error', `Activated ${successCount} location(s)${failCount ? `, ${failCount} failed` : ''}.`);
    await fetchOptions();
  };

  const handleBulkDeactivate = async () => {
    const toDeactivate = filteredRows.filter(r => selectedIds.has(r.id) && r.is_active);
    if (toDeactivate.length === 0) {
      showToast('error', 'None of the selected locations are active.');
      return;
    }
    setConfirmBulkDeactivate(true);
  };

  const confirmAndExecuteBulkDeactivate = async () => {
    const toDeactivate = filteredRows.filter(r => selectedIds.has(r.id) && r.is_active);
    setBulkBusy(true);
    setConfirmBulkDeactivate(false);
    let successCount = 0;
    let failCount = 0;
    for (const row of toDeactivate) {
      try {
        await adminService.deactivateShipmentOption(row.id);
        successCount++;
      } catch (err) {
        failCount++;
      }
    }
    setBulkBusy(false);
    setSelectedIds(new Set());
    showToast(successCount > 0 ? 'success' : 'error', `Deactivated ${successCount} location(s)${failCount ? `, ${failCount} failed` : ''}.`);
    await fetchOptions();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (editingId) {
        await adminService.updateShipmentOption(editingId, form);
        showToast('success', `Location (${form.pin_code}) updated successfully.`);
      } else {
        await adminService.createShipmentOption(form);
        showToast('success', `Location (${form.pin_code}) added successfully.`);
      }
      setForm(BLANK_FORM);
      setEditingId(null);
      await fetchOptions();
    } catch (err) {
      showToast('error', err.message || 'Shipment option could not be saved.');
    } finally {
      setBusy(false);
    }
  };

  const handleDeactivate = async (id) => {
    setBusy(true);
    try {
      await adminService.deactivateShipmentOption(id);
      showToast('success', 'Location deactivated.');
      setConfirmDeactivateId(null);
      await fetchOptions();
    } catch (err) {
      showToast('error', err.message || 'Could not deactivate location.');
    } finally {
      setBusy(false);
    }
  };

  const handleActivate = async (row) => {
    setBusy(true);
    try {
      await adminService.activateShipmentOption(row.id, row);
      showToast('success', `Location (${row.pin_code}) activated.`);
      await fetchOptions();
    } catch (err) {
      showToast('error', err.message || 'Could not activate location.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="sd-dashboard">
      {/* Toast Alert */}
      {toast && (
        <div className={`hd-toast ${toast.type}`}>
          <span>{toast.message}</span>
          <button className="hd-toast-close" onClick={() => setToast(null)}>✕</button>
        </div>
      )}

      {/* Header */}
      <div className="sd-page-header">
        <div>
          <h1 className="sd-page-title">Shipment Options</h1>
          <p className="sd-page-subtitle">Configure deliverable PIN codes and local serviceability coverage</p>
        </div>
        <button className="sd-refresh-btn" onClick={() => fetchOptions(query)} disabled={loading}>
          <RefreshCw size={15} className={loading ? 'sd-spinning' : ''} />
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {/* Add / Edit Form Card */}
      <div className="sd-card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <Truck size={18} color="#C2A15A" />
          <span style={{ fontSize: 14, fontWeight: 700, color: '#122D29' }}>
            {editingId ? 'Edit Serviceable Location' : 'Add New Serviceable Location'}
          </span>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: '#8B8578', display: 'block', marginBottom: 4 }}>
                PIN Code (6 digits) *
              </label>
              <input
                required
                type="text"
                pattern="[0-9]{6}"
                maxLength={6}
                inputMode="numeric"
                placeholder="e.g. 400001"
                value={form.pin_code}
                onChange={e => setForm({ ...form, pin_code: e.target.value.replace(/\D/g, '').slice(0, 6) })}
                style={{ width: '100%', height: 38, padding: '0 12px', borderRadius: 8, border: '1px solid #E5DFC8', fontSize: 13 }}
              />
            </div>

            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: '#8B8578', display: 'block', marginBottom: 4 }}>
                Area / Locality *
              </label>
              <input
                required
                type="text"
                maxLength={120}
                placeholder="e.g. Colaba / Bandra West"
                value={form.area}
                onChange={e => setForm({ ...form, area: e.target.value })}
                style={{ width: '100%', height: 38, padding: '0 12px', borderRadius: 8, border: '1px solid #E5DFC8', fontSize: 13 }}
              />
            </div>

            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: '#8B8578', display: 'block', marginBottom: 4 }}>
                City *
              </label>
              <input
                required
                type="text"
                maxLength={100}
                placeholder="e.g. Mumbai"
                value={form.city}
                onChange={e => setForm({ ...form, city: e.target.value })}
                style={{ width: '100%', height: 38, padding: '0 12px', borderRadius: 8, border: '1px solid #E5DFC8', fontSize: 13 }}
              />
            </div>

            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: '#8B8578', display: 'block', marginBottom: 4 }}>
                State *
              </label>
              <input
                required
                type="text"
                maxLength={100}
                placeholder="e.g. Maharashtra"
                value={form.state}
                onChange={e => setForm({ ...form, state: e.target.value })}
                style={{ width: '100%', height: 38, padding: '0 12px', borderRadius: 8, border: '1px solid #E5DFC8', fontSize: 13 }}
              />
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 16 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: '#122D29', fontWeight: 600 }}>
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={e => setForm({ ...form, is_active: e.target.checked })}
                style={{ accentColor: '#122D29', width: 16, height: 16 }}
              />
              Mark as Serviceable / Active
            </label>

            <div style={{ display: 'flex', gap: 10 }}>
              {editingId && (
                <button
                  type="button"
                  onClick={() => { setEditingId(null); setForm(BLANK_FORM); }}
                  style={{
                    padding: '8px 16px', borderRadius: 8, background: '#F5F0E8',
                    border: '1px solid #E5DFC8', fontSize: 13, fontWeight: 600, color: '#5C5A54',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
              )}
              <button
                type="submit"
                disabled={busy}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '8px 20px', borderRadius: 8, background: '#122D29',
                  color: '#FFFFFF', border: 'none', fontSize: 13, fontWeight: 600,
                  cursor: 'pointer', opacity: busy ? 0.7 : 1,
                }}
              >
                {editingId ? <Pencil size={15} /> : <Plus size={15} />}
                {busy ? 'Saving...' : editingId ? 'Update Location' : 'Add Location'}
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* Modern Filter Toolbar */}
      <div className="sd-card" style={{ marginBottom: 16, padding: '12px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 260, flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', flex: '1 1 240px', maxWidth: 360 }}>
              <Search size={16} color="#8B8578" style={{ position: 'absolute', left: 12, top: 11 }} />
              <input
                type="text"
                placeholder="Search PIN code, area, city or state..."
                value={query}
                onChange={e => setQuery(e.target.value)}
                style={{
                  width: '100%', height: 38, padding: '0 12px 0 36px',
                  borderRadius: 8, border: '1px solid #E5DFC8', fontSize: 13, background: '#FFFFFF',
                }}
              />
            </div>

            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              style={{
                height: 38, padding: '0 28px 0 12px', borderRadius: 8,
                border: '1px solid #E5DFC8', background: '#FFFFFF', fontSize: 13,
                color: '#122D29', fontWeight: 500, cursor: 'pointer',
              }}
            >
              <option value="all">All Statuses ({rows.length})</option>
              <option value="active">Active Only ({rows.filter(r => r.is_active).length})</option>
              <option value="inactive">Inactive Only ({rows.filter(r => !r.is_active).length})</option>
            </select>
          </div>

          {selectedIds.size > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#122D29', background: '#F5F0E8', padding: '4px 10px', borderRadius: 6, border: '1px solid #E5DFC8' }}>
                {selectedIds.size} selected
              </span>
              <button
                type="button"
                onClick={handleBulkActivate}
                disabled={bulkBusy}
                style={{
                  height: 34, padding: '0 12px', borderRadius: 6,
                  background: '#DCFCE7', border: '1px solid #BBF7D0',
                  color: '#15803D', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                }}
              >
                {bulkBusy ? 'Activating…' : 'Activate Selected'}
              </button>
              <button
                type="button"
                onClick={handleBulkDeactivate}
                disabled={bulkBusy}
                style={{
                  height: 34, padding: '0 12px', borderRadius: 6,
                  background: '#FEF2F2', border: '1px solid #FEE2E2',
                  color: '#991B1B', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                }}
              >
                {bulkBusy ? 'Deactivating…' : 'Deactivate Selected'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Table Card */}
      <div className="sd-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #F0EBDC', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#122D29' }}>
            Serviceable Locations ({filteredRows.length})
          </span>
          {statusFilter !== 'all' && (
            <span style={{ fontSize: 12, color: '#8B8578' }}>
              Filtered by: <strong>{statusFilter}</strong>
            </span>
          )}
        </div>

        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 48, gap: 10 }}>
            <div style={{ width: 24, height: 24, border: '2px solid #E5DFC8', borderTopColor: '#122D29', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
            <span style={{ color: '#8B8578', fontSize: 13 }}>Loading serviceable locations...</span>
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="sd-empty" style={{ padding: 48 }}>No shipment options match your filters.</div>
        ) : (
          <div style={{ overflowX: 'auto', maxWidth: '100%' }}>
            <table style={{ width: '100%', minWidth: '700px', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#FDFCFA', borderBottom: '1px solid #E5DFC8', color: 'rgba(18,45,41,0.6)', textTransform: 'uppercase', fontSize: 11, letterSpacing: '0.04em' }}>
                  <th style={{ width: 44, padding: '10px 14px' }}>
                    <input
                      type="checkbox"
                      checked={filteredRows.length > 0 && selectedIds.size === filteredRows.length}
                      onChange={toggleSelectAll}
                      style={{ cursor: 'pointer', accentColor: '#122D29' }}
                      aria-label="Select all locations"
                    />
                  </th>
                  <th style={{ padding: '10px 14px' }}>PIN Code</th>
                  <th style={{ padding: '10px 14px' }}>Area / Locality</th>
                  <th style={{ padding: '10px 14px' }}>City</th>
                  <th style={{ padding: '10px 14px' }}>State</th>
                  <th style={{ padding: '10px 14px' }}>Status</th>
                  <th style={{ padding: '10px 14px', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map(row => {
                  const isChecked = selectedIds.has(row.id);
                  return (
                    <tr
                      key={row.id}
                      style={{
                        borderBottom: '1px solid #F0EBDC',
                        background: isChecked ? '#FAF7F2' : 'transparent',
                        transition: 'background 0.15s ease',
                      }}
                    >
                      <td style={{ width: 44, padding: '10px 14px' }}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleRow(row.id)}
                          style={{ cursor: 'pointer', accentColor: '#122D29' }}
                          aria-label={`Select PIN ${row.pin_code}`}
                        />
                      </td>
                      <td style={{ padding: '10px 14px', fontWeight: 700, color: '#122D29', fontVariantNumeric: 'tabular-nums' }}>
                        {row.pin_code}
                      </td>
                      <td style={{ padding: '10px 14px', fontWeight: 600, color: '#1D1C17' }}>
                        {row.area}
                      </td>
                      <td style={{ padding: '10px 14px', color: '#5C5A54' }}>
                        {row.city}
                      </td>
                      <td style={{ padding: '10px 14px', color: '#5C5A54' }}>
                        {row.state}
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                          backgroundColor: row.is_active ? '#DCFCE7' : '#FEF2F2',
                          color: row.is_active ? '#15803D' : '#991B1B',
                          padding: '2px 8px', borderRadius: 9999, fontSize: 11, fontWeight: 600,
                        }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: row.is_active ? '#15803D' : '#991B1B' }} />
                          {row.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                          <button
                            type="button"
                            title="Edit"
                            onClick={() => {
                              setEditingId(row.id);
                              setForm({ pin_code: row.pin_code, area: row.area, city: row.city, state: row.state, is_active: row.is_active });
                              window.scrollTo({ top: 0, behavior: 'smooth' });
                            }}
                            style={{
                              background: '#F5F0E8', border: '1px solid #E5DFC8', borderRadius: 6,
                              padding: '4px 8px', color: '#122D29', cursor: 'pointer', display: 'flex', alignItems: 'center',
                            }}
                          >
                            <Pencil size={14} />
                          </button>

                          {row.is_active ? (
                            <button
                              type="button"
                              title="Deactivate"
                              onClick={() => setConfirmDeactivateId(row.id)}
                              style={{
                                background: '#FEF2F2', border: '1px solid #FEE2E2', borderRadius: 6,
                                padding: '4px 8px', color: '#991B1B', cursor: 'pointer', display: 'flex', alignItems: 'center',
                              }}
                            >
                              <Ban size={14} />
                            </button>
                          ) : (
                            <button
                              type="button"
                              title="Activate"
                              onClick={() => handleActivate(row)}
                              style={{
                                background: '#DCFCE7', border: '1px solid #BBF7D0', borderRadius: 6,
                                padding: '4px 8px', color: '#15803D', cursor: 'pointer', display: 'flex', alignItems: 'center',
                              }}
                            >
                              <CheckCircle size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Confirmation Modal for Bulk Deactivation */}
      {confirmBulkDeactivate && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(18,45,41,0.4)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
        }}>
          <div className="sd-card" style={{ maxWidth: 420, padding: 24, boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#B45309', marginBottom: 12 }}>
              <AlertTriangle size={20} />
              <span style={{ fontSize: 16, fontWeight: 700, color: '#122D29' }}>Bulk Deactivate Locations?</span>
            </div>
            <p style={{ fontSize: 13, color: '#5C5A54', lineHeight: 1.5, marginBottom: 20 }}>
              Are you sure you want to deactivate {filteredRows.filter(r => selectedIds.has(r.id) && r.is_active).length} active location(s)? Customers in these PIN codes will no longer be able to place orders until reactivated.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                onClick={() => setConfirmBulkDeactivate(false)}
                style={{ padding: '8px 16px', borderRadius: 8, background: '#F5F0E8', border: '1px solid #E5DFC8', fontSize: 13, fontWeight: 600, color: '#5C5A54', cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={confirmAndExecuteBulkDeactivate}
                style={{ padding: '8px 18px', borderRadius: 8, background: '#991B1B', border: 'none', fontSize: 13, fontWeight: 600, color: '#FFFFFF', cursor: 'pointer' }}
              >
                Yes, Deactivate Selected
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal for Deactivation */}
      {confirmDeactivateId && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(18,45,41,0.4)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
        }}>
          <div className="sd-card" style={{ maxWidth: 400, padding: 24, boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#B45309', marginBottom: 12 }}>
              <AlertTriangle size={20} />
              <span style={{ fontSize: 16, fontWeight: 700, color: '#122D29' }}>Deactivate Serviceability?</span>
            </div>
            <p style={{ fontSize: 13, color: '#5C5A54', lineHeight: 1.5, marginBottom: 20 }}>
              Customers in this PIN code will no longer be able to place orders for delivery until reactivated.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                onClick={() => setConfirmDeactivateId(null)}
                style={{ padding: '8px 16px', borderRadius: 8, background: '#F5F0E8', border: '1px solid #E5DFC8', fontSize: 13, fontWeight: 600, color: '#5C5A54', cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeactivate(confirmDeactivateId)}
                style={{ padding: '8px 18px', borderRadius: 8, background: '#991B1B', border: 'none', fontSize: 13, fontWeight: 600, color: '#FFFFFF', cursor: 'pointer' }}
              >
                Yes, Deactivate
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ShipmentOptions;
