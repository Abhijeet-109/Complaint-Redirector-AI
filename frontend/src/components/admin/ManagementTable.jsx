import React, { useState, useMemo } from 'react';
import { Search, Plus, Edit2, Trash2, X, AlertTriangle } from 'lucide-react';

export function ManagementTable({
  title,
  subtitle,
  items = [],
  departments = [],
  type = 'user', // 'user' | 'department' | 'handler' | 'admin'
  onCreate,
  onUpdate,
  onDelete,
  canCreate = true,
  canEdit = true,
  canDelete = true,
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [deleteConfirmItem, setDeleteConfirmItem] = useState(null);

  // Form fields
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    department_id: '',
  });
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Filter items by search query
  const filteredItems = useMemo(() => {
    if (!searchTerm.trim()) return items;
    const q = searchTerm.toLowerCase();
    return items.filter((item) => {
      const name = (item.name || '').toLowerCase();
      const email = (item.email || '').toLowerCase();
      const idStr = String(item.id || '');
      return name.includes(q) || email.includes(q) || idStr.includes(q);
    });
  }, [items, searchTerm]);

  // Open create modal
  const openCreateModal = () => {
    setEditingItem(null);
    setFormData({
      name: '',
      email: '',
      password: '',
      department_id: departments.length > 0 ? departments[0].id : '',
    });
    setFormError('');
    setIsModalOpen(true);
  };

  // Open edit modal
  const openEditModal = (item) => {
    setEditingItem(item);
    setFormData({
      name: item.name || '',
      email: item.email || '',
      password: '',
      department_id: item.department_id || (departments.length > 0 ? departments[0].id : ''),
    });
    setFormError('');
    setIsModalOpen(true);
  };

  // Submit form
  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');
    setSubmitting(true);

    try {
      if (editingItem) {
        // Update operation
        const payload = { name: formData.name, email: formData.email };
        if (formData.password.trim()) {
          payload.password = formData.password.trim();
        }
        if (type === 'handler') {
          payload.department_id = parseInt(formData.department_id, 10);
        }
        await onUpdate(editingItem.id, payload);
      } else {
        // Create operation
        const payload = { name: formData.name, email: formData.email };
        if (type === 'department') {
          await onCreate(payload);
        } else {
          payload.password = formData.password;
          if (type === 'user') payload.role = 'user';
          if (type === 'handler') {
            payload.role = 'department_handler';
            payload.department_id = parseInt(formData.department_id, 10);
          }
          if (type === 'admin') payload.role = 'admin';
          await onCreate(payload);
        }
      }
      setIsModalOpen(false);
    } catch (err) {
      setFormError(err.message || 'Operation failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // Confirm delete
  const handleDelete = async () => {
    if (!deleteConfirmItem) return;
    setSubmitting(true);
    try {
      await onDelete(deleteConfirmItem.id);
      setDeleteConfirmItem(null);
    } catch (err) {
      alert(err.message || 'Failed to delete record.');
    } finally {
      setSubmitting(false);
    }
  };

  // Department name helper
  const getDeptName = (deptId) => {
    if (!deptId) return 'None';
    const d = departments.find((dept) => dept.id === deptId);
    return d ? d.name : `Dept #${deptId}`;
  };

  return (
    <div className="ad-table-panel">
      {/* Table Toolbar */}
      <div className="ad-table-toolbar">
        <div className="ad-search-box">
          <Search className="ad-search-icon" size={16} />
          <input
            type="text"
            placeholder={`Search ${title.toLowerCase()}...`}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        {canCreate && (
          <button
            className="ad-btn-primary"
            onClick={openCreateModal}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <Plus size={16} />
            <span>Add {type === 'department' ? 'Department' : 'Account'}</span>
          </button>
        )}
      </div>

      {/* Table Content */}
      {filteredItems.length === 0 ? (
        <div style={{ padding: '36px 20px', textAlign: 'center', color: '#637073', fontSize: '13.5px' }}>
          No records found.
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="ad-data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Name</th>
                <th>Email</th>
                {type === 'handler' && <th>Department</th>}
                {type === 'user' && <th>Role</th>}
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map((item) => (
                <tr key={item.id}>
                  <td style={{ fontFamily: 'monospace', fontWeight: '700' }}>#{item.id}</td>
                  <td style={{ fontWeight: '700' }}>{item.name}</td>
                  <td>{item.email}</td>
                  {type === 'handler' && (
                    <td>
                      <span className="ad-live-pill" style={{ fontSize: '11px', padding: '3px 8px' }}>
                        {getDeptName(item.department_id)}
                      </span>
                    </td>
                  )}
                  {type === 'user' && (
                    <td>
                      <span style={{ textTransform: 'capitalize', fontSize: '12px', fontWeight: '600' }}>
                        {item.role || 'user'}
                      </span>
                    </td>
                  )}
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      {canEdit && (
                        <button
                          className="ad-table-btn"
                          onClick={() => openEditModal(item)}
                          title="Edit"
                          style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
                        >
                          <Edit2 size={14} />
                          <span>Edit</span>
                        </button>
                      )}
                      {canDelete && (
                        <button
                          className="ad-table-btn"
                          onClick={() => setDeleteConfirmItem(item)}
                          title="Delete"
                          style={{ color: '#C03E33', display: 'flex', alignItems: 'center', gap: '4px' }}
                        >
                          <Trash2 size={14} />
                          <span>Delete</span>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create / Edit Modal */}
      {isModalOpen && (
        <div className="ad-modal-backdrop" onClick={() => setIsModalOpen(false)}>
          <div className="ad-modal" onClick={(e) => e.stopPropagation()}>
            <div className="ad-modal-header">
              <div className="ad-modal-title">
                {editingItem ? `Edit ${editingItem.name}` : `Create New ${type}`}
              </div>
              <button className="ad-modal-close" onClick={() => setIsModalOpen(false)}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="ad-modal-body">
                {formError && (
                  <div style={{ background: '#FCEBEA', border: '1px solid #F5C5C2', color: '#C03E33', padding: '10px 14px', borderRadius: '8px', fontSize: '13px' }}>
                    {formError}
                  </div>
                )}

                <div className="ad-form-field">
                  <label className="ad-form-label">Name</label>
                  <input
                    type="text"
                    className="ad-form-input"
                    required
                    placeholder="Enter full name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  />
                </div>

                <div className="ad-form-field">
                  <label className="ad-form-label">Email Address</label>
                  <input
                    type="email"
                    className="ad-form-input"
                    required
                    placeholder="Enter email address"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  />
                </div>

                {type !== 'department' && (
                  <div className="ad-form-field">
                    <label className="ad-form-label">
                      Password {editingItem ? '(Leave blank to keep unchanged)' : ''}
                    </label>
                    <input
                      type="password"
                      className="ad-form-input"
                      required={!editingItem}
                      placeholder={editingItem ? '••••••••' : 'Create secure password'}
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    />
                  </div>
                )}

                {type === 'handler' && (
                  <div className="ad-form-field">
                    <label className="ad-form-label">Assigned Department</label>
                    <select
                      className="ad-form-select"
                      required
                      value={formData.department_id}
                      onChange={(e) => setFormData({ ...formData, department_id: e.target.value })}
                    >
                      {departments.map((dept) => (
                        <option key={dept.id} value={dept.id}>
                          {dept.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <div className="ad-modal-footer">
                <button
                  type="button"
                  className="ad-btn-secondary"
                  disabled={submitting}
                  onClick={() => setIsModalOpen(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="ad-btn-primary" disabled={submitting}>
                  {submitting ? 'Saving...' : editingItem ? 'Save Changes' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmItem && (
        <div className="ad-modal-backdrop" onClick={() => setDeleteConfirmItem(null)}>
          <div className="ad-modal" onClick={(e) => e.stopPropagation()}>
            <div className="ad-modal-header">
              <div className="ad-modal-title" style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#C03E33' }}>
                <AlertTriangle size={20} />
                <span>Confirm Deletion</span>
              </div>
              <button className="ad-modal-close" onClick={() => setDeleteConfirmItem(null)}>
                <X size={18} />
              </button>
            </div>

            <div className="ad-modal-body">
              <p style={{ fontSize: '14px', lineHeight: '1.5', color: 'var(--fk-text-primary)' }}>
                Are you sure you want to delete <strong>{deleteConfirmItem.name}</strong> (#{deleteConfirmItem.id})?
                This action cannot be undone.
              </p>
            </div>

            <div className="ad-modal-footer">
              <button
                type="button"
                className="ad-btn-secondary"
                disabled={submitting}
                onClick={() => setDeleteConfirmItem(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="ad-btn-danger"
                disabled={submitting}
                onClick={handleDelete}
              >
                {submitting ? 'Deleting...' : 'Delete Record'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ManagementTable;
