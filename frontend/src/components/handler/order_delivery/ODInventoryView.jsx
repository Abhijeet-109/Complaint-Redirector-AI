import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Search,
  RefreshCw,
  Boxes,
  Info,
  CheckCircle2,
  AlertTriangle,
  XCircle,
} from 'lucide-react';
import { handlerService } from '../../../services/handlerService';

function StockBadge({ status, available }) {
  if (available === 0 || status === 'out_of_stock') {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600, backgroundColor: '#FEE2E2', color: '#991B1B' }}>
        <XCircle size={11} /> Out of Stock
      </span>
    );
  }
  if (available <= 10) {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600, backgroundColor: '#FEF3C7', color: '#B45309' }}>
        <AlertTriangle size={11} /> Low Stock ({available})
      </span>
    );
  }
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600, backgroundColor: '#DCFCE7', color: '#15803D' }}>
      <CheckCircle2 size={11} /> In Stock
    </span>
  );
}

export function ODInventoryView() {
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState('variants'); // 'variants' | 'categories'

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [stockStatusFilter, setStockStatusFilter] = useState('all');
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const loadInventory = useCallback(async () => {
    try {
      setRefreshing(true);
      const [invRes, catRes] = await Promise.all([
        handlerService.getOrderDeliveryInventory({ limit: 100 }),
        handlerService.getOrderDeliveryInventoryCategories().catch(() => []),
      ]);
      setItems(invRes.items || []);
      setCategories(Array.isArray(catRes) ? catRes : []);
    } catch (err) {
      console.error('Failed to load inventory for O&D:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadInventory();
  }, [loadInventory]);

  const filteredItems = useMemo(() => {
    return items.filter((it) => {
      if (stockStatusFilter === 'in_stock' && it.available_stock === 0) return false;
      if (stockStatusFilter === 'out_of_stock' && it.available_stock > 0) return false;
      if (stockStatusFilter === 'low_stock' && (it.available_stock === 0 || it.available_stock > 10)) return false;

      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const matchesProd = (it.product_name || '').toLowerCase().includes(q);
        const matchesSku = (it.sku || '').toLowerCase().includes(q);
        const matchesVar = (it.variant_name || '').toLowerCase().includes(q);
        const matchesCat = (it.category || '').toLowerCase().includes(q);
        if (!matchesProd && !matchesSku && !matchesVar && !matchesCat) return false;
      }
      return true;
    });
  }, [items, stockStatusFilter, searchTerm]);

  const paginatedItems = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredItems.slice(start, start + pageSize);
  }, [filteredItems, page, pageSize]);

  const totalPages = Math.ceil(filteredItems.length / pageSize) || 1;

  // Stats
  const stats = useMemo(() => {
    let totalAvail = 0;
    let totalRes = 0;
    let totalAll = 0;
    items.forEach((it) => {
      totalAvail += (it.available_stock || 0);
      totalRes += (it.reserved_stock || 0);
      totalAll += (it.total_stock || 0);
    });
    return { totalAvail, totalRes, totalAll, totalVariants: items.length };
  }, [items]);

  return (
    <div style={{ padding: '0 4px 30px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: '#122D29', margin: 0, letterSpacing: '-0.02em' }}>
            Inventory Management
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#68726E' }}>
            Monitor variant-level available and reserved stock across the catalogue (Read-Only fulfilment visibility).
          </p>
        </div>
        <button
          type="button"
          onClick={loadInventory}
          disabled={refreshing}
          style={{
            background: '#FFFFFF',
            border: '1px solid #E8E4D8',
            borderRadius: 6,
            padding: '6px 12px',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 12,
            fontWeight: 600,
            color: '#183A34',
            cursor: refreshing ? 'not-allowed' : 'pointer',
          }}
        >
          <RefreshCw size={13} style={{ animation: refreshing ? 'spin 0.8s linear infinite' : 'none' }} />
          Refresh
        </button>
      </div>

      {/* Invariant Formula Callout Card */}
      <div
        style={{
          background: '#FAF7F2',
          border: '1px solid #E5DFC8',
          borderRadius: 8,
          padding: '12px 18px',
          marginBottom: 16,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Info size={17} color="#4A6741" />
          <span style={{ fontSize: 12.5, color: '#2B322F', fontWeight: 600 }}>
            Inventory Accounting Rule: <code>Available Stock + Reserved Stock = Total Stock</code>
          </span>
        </div>
        <div style={{ display: 'flex', gap: 18, fontSize: 12, color: '#5A6460' }}>
          <span>Total Variants: <strong>{stats.totalVariants}</strong></span>
          <span>Available Units: <strong>{stats.totalAvail.toLocaleString()}</strong></span>
          <span>Reserved Units: <strong>{stats.totalRes.toLocaleString()}</strong></span>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid #E8E4D8', marginBottom: 16 }}>
        <button
          type="button"
          onClick={() => setActiveTab('variants')}
          style={{
            border: 'none',
            borderBottom: activeTab === 'variants' ? '2px solid #183A34' : '2px solid transparent',
            background: 'none',
            color: activeTab === 'variants' ? '#183A34' : '#68726E',
            fontWeight: activeTab === 'variants' ? 700 : 500,
            fontSize: 13,
            padding: '10px 18px',
            cursor: 'pointer',
          }}
        >
          Product &amp; Variant Stock
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('categories')}
          style={{
            border: 'none',
            borderBottom: activeTab === 'categories' ? '2px solid #183A34' : '2px solid transparent',
            background: 'none',
            color: activeTab === 'categories' ? '#183A34' : '#68726E',
            fontWeight: activeTab === 'categories' ? 700 : 500,
            fontSize: 13,
            padding: '10px 18px',
            cursor: 'pointer',
          }}
        >
          Category-Level Aggregates
        </button>
      </div>

      {activeTab === 'variants' ? (
        <>
          {/* Toolbar */}
          <div
            style={{
              background: '#FFFFFF',
              border: '1px solid #E8E4D8',
              borderRadius: 8,
              padding: '14px 18px',
              marginBottom: 16,
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              flexWrap: 'wrap',
            }}
          >
            <div style={{ position: 'relative', flex: '1 1 240px', minWidth: 200 }}>
              <Search size={14} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: '#88928E' }} />
              <input
                type="text"
                placeholder="Search product name, variant, SKU..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setPage(1);
                }}
                style={{
                  width: '100%',
                  padding: '7px 10px 7px 32px',
                  border: '1px solid #E8E4D8',
                  borderRadius: 6,
                  fontSize: 12.5,
                  outline: 'none',
                  backgroundColor: '#FAF7F2',
                }}
              />
            </div>

            <select
              value={stockStatusFilter}
              onChange={(e) => {
                setStockStatusFilter(e.target.value);
                setPage(1);
              }}
              style={{
                padding: '6px 10px',
                border: '1px solid #E8E4D8',
                borderRadius: 6,
                fontSize: 12,
                background: '#FFFFFF',
                color: '#122D29',
              }}
            >
              <option value="all">All Stock Statuses</option>
              <option value="in_stock">In Stock</option>
              <option value="low_stock">Low Stock (≤ 10)</option>
              <option value="out_of_stock">Out of Stock</option>
            </select>
          </div>

          {/* Table */}
          <div style={{ background: '#FFFFFF', border: '1px solid #E8E4D8', borderRadius: 8, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, textAlign: 'left' }}>
                <thead>
                  <tr style={{ background: '#FAF7F2', borderBottom: '1px solid #E8E4D8', color: '#5A6460', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    <th style={{ padding: '10px 16px', fontWeight: 600 }}>Product</th>
                    <th style={{ padding: '10px 16px', fontWeight: 600 }}>Category</th>
                    <th style={{ padding: '10px 16px', fontWeight: 600 }}>Variant</th>
                    <th style={{ padding: '10px 16px', fontWeight: 600 }}>SKU</th>
                    <th style={{ padding: '10px 16px', fontWeight: 600, textAlign: 'right' }}>Available</th>
                    <th style={{ padding: '10px 16px', fontWeight: 600, textAlign: 'right' }}>Reserved</th>
                    <th style={{ padding: '10px 16px', fontWeight: 600, textAlign: 'right' }}>Total Stock</th>
                    <th style={{ padding: '10px 16px', fontWeight: 600 }}>Status</th>
                    <th style={{ padding: '10px 16px', fontWeight: 600 }}>Last Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedItems.map((it) => (
                    <tr
                      key={it.inventory_id || it.sku}
                      style={{ borderBottom: '1px solid #F0ECE1' }}
                      onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#FAF7F2'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                    >
                      <td style={{ padding: '12px 16px', fontWeight: 600, color: '#122D29' }}>
                        {it.product_name}
                      </td>
                      <td style={{ padding: '12px 16px', color: '#68726E' }}>
                        {it.category || 'General'}
                      </td>
                      <td style={{ padding: '12px 16px', color: '#3A423F' }}>
                        {it.variant_name || 'Standard'}
                      </td>
                      <td style={{ padding: '12px 16px', color: '#5A6460', fontFamily: 'monospace', fontSize: 11.5 }}>
                        {it.sku}
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, color: it.available_stock <= 5 ? '#991B1B' : '#122D29', fontVariantNumeric: 'tabular-nums' }}>
                        {it.available_stock}
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'right', color: '#7A8480', fontVariantNumeric: 'tabular-nums' }}>
                        {it.reserved_stock}
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, color: '#122D29', fontVariantNumeric: 'tabular-nums' }}>
                        {it.total_stock}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <StockBadge status={it.stock_status} available={it.available_stock} />
                      </td>
                      <td style={{ padding: '12px 16px', color: '#88928E', fontSize: 11.5, whiteSpace: 'nowrap' }}>
                        {it.updated_at ? new Date(it.updated_at).toLocaleDateString('en-IN') : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div style={{ padding: '12px 18px', background: '#FAF7F2', borderTop: '1px solid #E8E4D8', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 12, color: '#68726E' }}>
                Page {page} of {totalPages}
              </span>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(p - 1, 1))}
                  style={{
                    border: '1px solid #E8E4D8',
                    background: page <= 1 ? '#F0ECE1' : '#FFFFFF',
                    color: page <= 1 ? '#A0A8A4' : '#183A34',
                    padding: '4px 10px',
                    borderRadius: 5,
                    fontSize: 11,
                    cursor: page <= 1 ? 'not-allowed' : 'pointer',
                  }}
                >
                  Previous
                </button>
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
                  style={{
                    border: '1px solid #E8E4D8',
                    background: page >= totalPages ? '#F0ECE1' : '#FFFFFF',
                    color: page >= totalPages ? '#A0A8A4' : '#183A34',
                    padding: '4px 10px',
                    borderRadius: 5,
                    fontSize: 11,
                    cursor: page >= totalPages ? 'not-allowed' : 'pointer',
                  }}
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        </>
      ) : (
        /* Category-Level Aggregates */
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
          {categories.length === 0 ? (
            <div style={{ padding: 40, background: '#FFFFFF', border: '1px solid #E8E4D8', borderRadius: 8, textAlign: 'center', color: '#68726E' }}>
              No category aggregates available.
            </div>
          ) : (
            categories.map((cat, idx) => (
              <div key={idx} style={{ background: '#FFFFFF', border: '1px solid #E8E4D8', borderRadius: 8, padding: 18 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#122D29', marginBottom: 12 }}>
                  {cat.category_name || cat.name || 'Category'}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12.5 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#5A6460' }}>
                    <span>Available Stock</span>
                    <strong style={{ color: '#122D29' }}>{(cat.total_available || 0).toLocaleString()}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#5A6460' }}>
                    <span>Reserved Stock</span>
                    <strong style={{ color: '#7A8480' }}>{(cat.total_reserved || 0).toLocaleString()}</strong>
                  </div>
                  <div style={{ height: 1, backgroundColor: '#EFECE4', margin: '4px 0' }} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#122D29', fontWeight: 700 }}>
                    <span>Total Stock</span>
                    <span>{((cat.total_available || 0) + (cat.total_reserved || 0)).toLocaleString()}</span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default ODInventoryView;

