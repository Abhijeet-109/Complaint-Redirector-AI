import React, { useState, useEffect, useCallback } from 'react';
import {
  Package, Search, Filter, RefreshCw, AlertTriangle, CheckCircle2,
  Layers, ChevronRight, ArrowUpDown, Box,
} from 'lucide-react';
import { adminService } from '../../services/adminService';

export function InventoryManagement() {
  const [activeTab, setActiveTab] = useState('products'); // 'products' | 'categories'
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [toast, setToast] = useState(null);

  // Filters for product-level inventory
  const [search, setSearch] = useState('');
  const [stockStatus, setStockStatus] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');

  const showToast = (type, message) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  // Fetch product inventory
  const fetchInventory = useCallback(async (isLoadMore = false, newOffset = 0) => {
    if (isLoadMore) setLoadingMore(true);
    else setLoading(true);

    try {
      const params = { limit: 30, offset: newOffset };
      if (search.trim()) params.search = search.trim();
      if (stockStatus) params.stock_status = stockStatus;
      if (selectedCategory) params.category_id = selectedCategory;

      const res = await adminService.getInventory(params);
      if (isLoadMore) {
        setItems(prev => [...prev, ...(res.items || [])]);
      } else {
        setItems(res.items || []);
        setTotal(res.total || 0);
      }
      setHasMore(res.has_more || false);
      setOffset(newOffset);
    } catch (err) {
      showToast('error', err.message || 'Failed to load inventory');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [search, stockStatus, selectedCategory]);

  // Fetch category stock summary
  const fetchCategorySummary = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminService.getCategoryStock();
      setCategories(Array.isArray(res) ? res : []);
    } catch (err) {
      showToast('error', err.message || 'Failed to load category inventory');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'products') {
      const timer = setTimeout(() => {
        fetchInventory(false, 0);
      }, 250);
      return () => clearTimeout(timer);
    } else {
      fetchCategorySummary();
    }
  }, [activeTab, fetchInventory, fetchCategorySummary]);

  return (
    <div className="sd-dashboard">
      {/* Toast Alert */}
      {toast && (
        <div className={`hd-toast ${toast.type}`}>
          <span>{toast.message}</span>
          <button className="hd-toast-close" onClick={() => setToast(null)}>✕</button>
        </div>
      )}

      {/* Page Header */}
      <div className="sd-page-header">
        <div>
          <h1 className="sd-page-title">Inventory Management</h1>
          <p className="sd-page-subtitle">Real-time variant-level stock allocation, warehouse on-hand units, and category summaries</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            className="sd-refresh-btn"
            onClick={() => activeTab === 'products' ? fetchInventory(false, 0) : fetchCategorySummary()}
            disabled={loading}
          >
            <RefreshCw size={15} className={loading ? 'sd-spinning' : ''} />
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button
          onClick={() => setActiveTab('products')}
          style={{
            padding: '8px 16px', borderRadius: 8, border: 'none',
            background: activeTab === 'products' ? '#122D29' : '#FFFFFF',
            color: activeTab === 'products' ? '#FFFFFF' : '#122D29',
            fontWeight: 600, fontSize: 13, cursor: 'pointer',
            boxShadow: activeTab === 'products' ? '0 2px 4px rgba(18,45,41,0.15)' : 'none',
            border: activeTab === 'products' ? '1px solid #122D29' : '1px solid #E5DFC8',
          }}
        >
          Product & Variant Stock
        </button>
        <button
          onClick={() => setActiveTab('categories')}
          style={{
            padding: '8px 16px', borderRadius: 8, border: 'none',
            background: activeTab === 'categories' ? '#122D29' : '#FFFFFF',
            color: activeTab === 'categories' ? '#FFFFFF' : '#122D29',
            fontWeight: 600, fontSize: 13, cursor: 'pointer',
            boxShadow: activeTab === 'categories' ? '0 2px 4px rgba(18,45,41,0.15)' : 'none',
            border: activeTab === 'categories' ? '1px solid #122D29' : '1px solid #E5DFC8',
          }}
        >
          Category-Level Aggregates
        </button>
      </div>

      {activeTab === 'products' ? (
        <>
          {/* Filters Bar */}
          <div className="sd-card" style={{ marginBottom: 16, padding: '16px 20px' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
              <div style={{ position: 'relative', flex: '1 1 240px', minWidth: 200 }}>
                <Search size={16} color="#A8A293" style={{ position: 'absolute', left: 12, top: 11 }} />
                <input
                  type="text"
                  placeholder="Search product, variant, or SKU..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  style={{
                    width: '100%', height: 38, padding: '0 12px 0 36px',
                    borderRadius: 8, border: '1px solid #E5DFC8',
                    fontSize: 13, background: '#FFFFFF', color: '#1D1C17',
                  }}
                />
              </div>

              <select
                value={stockStatus}
                onChange={e => setStockStatus(e.target.value)}
                style={{ height: 38, padding: '0 12px', borderRadius: 8, border: '1px solid #E5DFC8', fontSize: 13, background: '#FFFFFF', color: '#1D1C17' }}
              >
                <option value="">All Stock Statuses</option>
                <option value="in_stock">In Stock (Available &gt; 0)</option>
                <option value="out_of_stock">Out of Stock (Available = 0)</option>
              </select>
            </div>
          </div>

          {/* Table Card */}
          <div className="sd-card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #F0EBDC', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: '#122D29' }}>
                Stock Ledger ({total} variants)
              </span>
              <span style={{ fontSize: 12, color: '#8B8578' }}>
                Formula: Available + Reserved = Total Stock
              </span>
            </div>

            {loading ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 48, gap: 10 }}>
                <div style={{ width: 24, height: 24, border: '2px solid #E5DFC8', borderTopColor: '#122D29', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                <span style={{ color: '#8B8578', fontSize: 13 }}>Loading inventory records...</span>
              </div>
            ) : items.length === 0 ? (
              <div className="sd-empty" style={{ padding: 48 }}>No inventory records found.</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: '#FDFCFA', borderBottom: '1px solid #E5DFC8', color: 'rgba(18,45,41,0.6)', textTransform: 'uppercase', fontSize: 11, letterSpacing: '0.04em' }}>
                      <th style={{ padding: '12px 16px' }}>Product</th>
                      <th style={{ padding: '12px 16px' }}>Category</th>
                      <th style={{ padding: '12px 16px' }}>Variant / SKU</th>
                      <th style={{ padding: '12px 16px', textAlign: 'right' }}>Available</th>
                      <th style={{ padding: '12px 16px', textAlign: 'right' }}>Reserved</th>
                      <th style={{ padding: '12px 16px', textAlign: 'right' }}>Total Stock</th>
                      <th style={{ padding: '12px 16px' }}>Status</th>
                      <th style={{ padding: '12px 16px' }}>Last Updated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map(item => {
                      const isLowStock = item.available_stock > 0 && item.available_stock <= 5;
                      const isOut = item.available_stock === 0;
                      return (
                        <tr key={item.variant_id} style={{ borderBottom: '1px solid #F0EBDC' }}>
                          <td style={{ padding: '12px 16px', fontWeight: 600, color: '#122D29' }}>
                            {item.product_name}
                          </td>
                          <td style={{ padding: '12px 16px', color: '#5C5A54' }}>
                            {item.category_name || '—'}
                          </td>
                          <td style={{ padding: '12px 16px' }}>
                            <div style={{ fontWeight: 600, color: '#122D29' }}>{item.variant_name}</div>
                            <div style={{ fontSize: 11, color: '#8B8578' }}>{item.sku}</div>
                          </td>
                          <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, color: isOut ? '#991B1B' : isLowStock ? '#B45309' : '#15803D', fontVariantNumeric: 'tabular-nums' }}>
                            {item.available_stock.toLocaleString('en-IN')}
                          </td>
                          <td style={{ padding: '12px 16px', textAlign: 'right', color: '#5C5A54', fontVariantNumeric: 'tabular-nums' }}>
                            {item.reserved_stock.toLocaleString('en-IN')}
                          </td>
                          <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, color: '#122D29', fontVariantNumeric: 'tabular-nums' }}>
                            {item.total_stock.toLocaleString('en-IN')}
                          </td>
                          <td style={{ padding: '12px 16px' }}>
                            <span style={{
                              display: 'inline-flex', alignItems: 'center', gap: 4,
                              backgroundColor: isOut ? '#FEF2F2' : isLowStock ? '#FEF3C7' : '#DCFCE7',
                              color: isOut ? '#991B1B' : isLowStock ? '#B45309' : '#15803D',
                              padding: '2px 8px', borderRadius: 9999, fontSize: 11, fontWeight: 600,
                            }}>
                              <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: isOut ? '#991B1B' : isLowStock ? '#B45309' : '#15803D' }} />
                              {isOut ? 'Out of Stock' : isLowStock ? 'Low Stock' : 'In Stock'}
                            </span>
                          </td>
                          <td style={{ padding: '12px 16px', color: '#8B8578', fontSize: 12 }}>
                            {item.updated_at ? new Date(item.updated_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Load More Button */}
            {hasMore && (
              <div style={{ padding: '16px 20px', textAlign: 'center', borderTop: '1px solid #F0EBDC' }}>
                <button
                  onClick={() => fetchInventory(true, offset + 30)}
                  disabled={loadingMore}
                  style={{
                    background: '#FFFFFF', border: '1px solid #E5DFC8', borderRadius: 8,
                    padding: '8px 24px', fontSize: 13, fontWeight: 600, color: '#122D29',
                    cursor: 'pointer',
                  }}
                >
                  {loadingMore ? 'Loading more...' : 'Load More Inventory'}
                </button>
              </div>
            )}
          </div>
        </>
      ) : (
        /* Category-Level Summary Card */
        <div className="sd-card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #F0EBDC' }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#122D29' }}>
              Category Stock Breakdown
            </span>
          </div>

          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 48, gap: 10 }}>
              <div style={{ width: 24, height: 24, border: '2px solid #E5DFC8', borderTopColor: '#122D29', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
              <span style={{ color: '#8B8578', fontSize: 13 }}>Aggregating category metrics...</span>
            </div>
          ) : categories.length === 0 ? (
            <div className="sd-empty" style={{ padding: 48 }}>No categories configured.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#FDFCFA', borderBottom: '1px solid #E5DFC8', color: 'rgba(18,45,41,0.6)', textTransform: 'uppercase', fontSize: 11, letterSpacing: '0.04em' }}>
                    <th style={{ padding: '12px 16px' }}>Category Name</th>
                    <th style={{ padding: '12px 16px', textAlign: 'right' }}>Products</th>
                    <th style={{ padding: '12px 16px', textAlign: 'right' }}>Variants</th>
                    <th style={{ padding: '12px 16px', textAlign: 'right' }}>Available Units</th>
                    <th style={{ padding: '12px 16px', textAlign: 'right' }}>Reserved Units</th>
                    <th style={{ padding: '12px 16px', textAlign: 'right' }}>Total Units</th>
                    <th style={{ padding: '12px 16px', textAlign: 'right' }}>Out of Stock</th>
                    <th style={{ padding: '12px 16px', textAlign: 'right' }}>Low Stock (&le;5)</th>
                  </tr>
                </thead>
                <tbody>
                  {categories.map(cat => (
                    <tr key={cat.category_id} style={{ borderBottom: '1px solid #F0EBDC' }}>
                      <td style={{ padding: '12px 16px', fontWeight: 600, color: '#122D29' }}>
                        {cat.category_name}
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                        {cat.product_count}
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                        {cat.variant_count}
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, color: '#15803D', fontVariantNumeric: 'tabular-nums' }}>
                        {cat.available_stock.toLocaleString('en-IN')}
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'right', color: '#5C5A54', fontVariantNumeric: 'tabular-nums' }}>
                        {cat.reserved_stock.toLocaleString('en-IN')}
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, color: '#122D29', fontVariantNumeric: 'tabular-nums' }}>
                        {cat.total_stock.toLocaleString('en-IN')}
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'right', color: cat.out_of_stock_products > 0 ? '#991B1B' : '#5C5A54', fontWeight: cat.out_of_stock_products > 0 ? 700 : 400, fontVariantNumeric: 'tabular-nums' }}>
                        {cat.out_of_stock_products}
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'right', color: cat.low_stock_products > 0 ? '#B45309' : '#5C5A54', fontWeight: cat.low_stock_products > 0 ? 700 : 400, fontVariantNumeric: 'tabular-nums' }}>
                        {cat.low_stock_products}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default InventoryManagement;

