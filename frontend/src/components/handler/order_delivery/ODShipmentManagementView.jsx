import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Search,
  RefreshCw,
  X,
  Truck,
  MapPin,
  Calendar,
  ExternalLink,
  Clock,
  CheckCircle2,
  AlertCircle,
  FileText,
} from 'lucide-react';
import { handlerService } from '../../../services/handlerService';
import { HandlerPagination } from '../HandlerPagination';

function StatusBadge({ status }) {
  const statusConfig = {
    ready_for_dispatch: { bg: '#DBEAFE', color: '#1D4ED8', label: 'Ready for Dispatch' },
    received: { bg: '#E0E7FF', color: '#4338CA', label: 'Received' },
    scheduled: { bg: '#FEF3C7', color: '#B45309', label: 'Scheduled' },
    shipped: { bg: '#CFFAFE', color: '#0E7490', label: 'Shipped' },
    in_transit: { bg: '#FEF3C7', color: '#B45309', label: 'In Transit' },
    out_for_delivery: { bg: '#FFEDD5', color: '#C2410C', label: 'Out for Delivery' },
    delivered: { bg: '#DCFCE7', color: '#15803D', label: 'Delivered' },
    failed: { bg: '#FEF2F2', color: '#991B1B', label: 'Failed' },
    pending: { bg: '#F5F5F4', color: '#78716C', label: 'Pending' },
  };
  const key = String(status || '').toLowerCase();
  const config = statusConfig[key] || { bg: '#F5F5F4', color: '#78716C', label: status || 'Unknown' };

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '3px 9px',
        borderRadius: 4,
        fontSize: 11,
        fontWeight: 600,
        backgroundColor: config.bg,
        color: config.color,
        whiteSpace: 'nowrap',
      }}
    >
      {config.label}
    </span>
  );
}

export function ODShipmentManagementView({ onNavigate }) {
  const [shipments, setShipments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [actionError, setActionError] = useState('');
  const [actionSuccess, setActionSuccess] = useState('');

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [carrierFilter, setCarrierFilter] = useState('all');
  const [selectedShipment, setSelectedShipment] = useState(null);

  // Edit fields
  const [selectedNextStatus, setSelectedNextStatus] = useState('');
  const [carrierInput, setCarrierInput] = useState('');
  const [trackingRefInput, setTrackingRefInput] = useState('');
  const [trackingUrlInput, setTrackingUrlInput] = useState('');
  const [etaInput, setEtaInput] = useState('');
  const [operationalNote, setOperationalNote] = useState('');
  const [updating, setUpdating] = useState(false);

  // Pagination
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const loadShipments = useCallback(async () => {
    try {
      setRefreshing(true);
      setError(null);
      const res = await handlerService.getOrderDeliveryShipments({ limit: 100 });
      setShipments(res.items || []);
    } catch (err) {
      console.error('Failed to load shipments:', err);
      setError(err.message || 'Error loading shipments from backend.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadShipments();
  }, [loadShipments]);

  const carriersList = useMemo(() => {
    const set = new Set();
    shipments.forEach((s) => {
      if (s.carrier) set.add(s.carrier);
    });
    return Array.from(set);
  }, [shipments]);

  const filteredShipments = useMemo(() => {
    return shipments.filter((shp) => {
      if (statusFilter !== 'all' && shp.status !== statusFilter) return false;
      if (carrierFilter !== 'all' && shp.carrier !== carrierFilter) return false;
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const matchesId = (shp.tracking_reference || '').toLowerCase().includes(q);
        const matchesOrder = (shp.order_number || '').toLowerCase().includes(q);
        const matchesCust = (shp.customer_name || '').toLowerCase().includes(q);
        const matchesCarrier = (shp.carrier || '').toLowerCase().includes(q);
        if (!matchesId && !matchesOrder && !matchesCust && !matchesCarrier) return false;
      }
      return true;
    });
  }, [shipments, statusFilter, carrierFilter, searchTerm]);

  const paginatedShipments = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredShipments.slice(start, start + pageSize);
  }, [filteredShipments, page, pageSize]);

  const totalPages = Math.ceil(filteredShipments.length / pageSize) || 1;

  const handleOpenDetail = (shp) => {
    setSelectedShipment(shp);
    setSelectedNextStatus(shp.next_status_options?.[0] || '');
    setCarrierInput(shp.carrier || '');
    setTrackingRefInput(shp.tracking_reference || '');
    setTrackingUrlInput(shp.tracking_url || '');
    setEtaInput(shp.estimated_delivery_date ? shp.estimated_delivery_date.slice(0, 10) : '');
    setOperationalNote('');
    setActionError('');
    setActionSuccess('');
  };

  const handleCloseDetail = () => {
    setSelectedShipment(null);
  };

  const handleUpdate = async () => {
    if (!selectedShipment || updating) return;
    setUpdating(true);
    setActionError('');
    setActionSuccess('');

    const metadata = {
      ...(carrierInput.trim() ? { carrier: carrierInput.trim() } : {}),
      ...(trackingRefInput.trim() ? { tracking_reference: trackingRefInput.trim() } : {}),
      ...(trackingUrlInput.trim() ? { tracking_url: trackingUrlInput.trim() } : {}),
      ...(etaInput ? { estimated_delivery_date: new Date(etaInput).toISOString() } : {}),
    };

    try {
      await handlerService.updateOrderDeliveryShipmentStatus(
        selectedShipment.order_id,
        selectedNextStatus || undefined,
        operationalNote.trim() || undefined,
        metadata
      );
      setActionSuccess('Shipment updated successfully.');
      await loadShipments();
      setSelectedShipment((prev) => (prev ? {
        ...prev,
        status: selectedNextStatus || prev.status,
        carrier: carrierInput,
        tracking_reference: trackingRefInput,
        tracking_url: trackingUrlInput,
        estimated_delivery_date: etaInput,
      } : null));
    } catch (err) {
      setActionError(err.message || 'Failed to update shipment.');
    } finally {
      setUpdating(false);
    }
  };

  return (
    <div style={{ padding: '0 4px 30px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: '#122D29', margin: 0, letterSpacing: '-0.02em' }}>
            Shipment Management
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#68726E' }}>
            Receive, schedule, dispatch, and track outbound customer shipments.
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 12, color: '#68726E' }}>
            Showing <strong>{filteredShipments.length}</strong> of {shipments.length} shipments
          </span>
          <button
            type="button"
            onClick={loadShipments}
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
      </div>

      {/* Toolbar Filter Card */}
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
            placeholder="Search tracking #, order, customer..."
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

        {/* Status Filter */}
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
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
          <option value="all">All Shipment Statuses</option>
          <option value="ready_for_dispatch">Ready for Dispatch</option>
          <option value="received">Received</option>
          <option value="scheduled">Scheduled</option>
          <option value="shipped">Shipped</option>
          <option value="out_for_delivery">Out for Delivery</option>
          <option value="delivered">Delivered</option>
        </select>

        {/* Carrier Filter */}
        {carriersList.length > 0 && (
          <select
            value={carrierFilter}
            onChange={(e) => {
              setCarrierFilter(e.target.value);
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
            <option value="all">All Carriers</option>
            {carriersList.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        )}

        {(searchTerm || statusFilter !== 'all' || carrierFilter !== 'all') && (
          <button
            type="button"
            onClick={() => {
              setSearchTerm('');
              setStatusFilter('all');
              setCarrierFilter('all');
              setPage(1);
            }}
            style={{
              background: 'none',
              border: 'none',
              color: '#88928E',
              fontSize: 11.5,
              fontWeight: 600,
              cursor: 'pointer',
              textDecoration: 'underline',
            }}
          >
            Reset filters
          </button>
        )}
      </div>

      {/* Main Table Card */}
      <div style={{ background: '#FFFFFF', border: '1px solid #E8E4D8', borderRadius: 8, overflow: 'hidden' }}>
        {loading && shipments.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#68726E', fontSize: 13 }}>
            Loading shipments...
          </div>
        ) : filteredShipments.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#68726E' }}>
            <p style={{ margin: 0, fontWeight: 600, fontSize: 14 }}>No shipments found</p>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: '#88928E' }}>
              No shipments match the current filters.
            </p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, textAlign: 'left' }}>
              <thead>
                <tr style={{ background: '#FAF7F2', borderBottom: '1px solid #E8E4D8', color: '#5A6460', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  <th style={{ padding: '10px 16px', fontWeight: 600 }}>Shipment Ref</th>
                  <th style={{ padding: '10px 16px', fontWeight: 600 }}>Order Number</th>
                  <th style={{ padding: '10px 16px', fontWeight: 600 }}>Customer</th>
                  <th style={{ padding: '10px 16px', fontWeight: 600 }}>Destination</th>
                  <th style={{ padding: '10px 16px', fontWeight: 600 }}>Carrier</th>
                  <th style={{ padding: '10px 16px', fontWeight: 600 }}>Tracking ID</th>
                  <th style={{ padding: '10px 16px', fontWeight: 600 }}>ETA</th>
                  <th style={{ padding: '10px 16px', fontWeight: 600 }}>Shipment Status</th>
                  <th style={{ padding: '10px 16px', fontWeight: 600, textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {paginatedShipments.map((shp) => {
                  const addr = shp.delivery_address || {};
                  const destination = [addr.city, addr.state].filter(Boolean).join(', ') || 'Address on file';

                  return (
                    <tr
                      key={shp.id || shp.order_id}
                      style={{ borderBottom: '1px solid #F0ECE1', transition: 'background-color 0.1s' }}
                      onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#FAF7F2'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                    >
                      <td style={{ padding: '12px 16px', fontWeight: 700, color: '#122D29' }}>
                        SH-{String(shp.id || shp.order_id).padStart(4, '0')}
                      </td>
                      <td style={{ padding: '12px 16px', fontWeight: 600, color: '#183A34' }}>
                        {shp.order_number}
                      </td>
                      <td style={{ padding: '12px 16px', color: '#2B322F', fontWeight: 500 }}>
                        {shp.customer_name || 'Customer'}
                      </td>
                      <td style={{ padding: '12px 16px', color: '#5A6460' }}>
                        {destination}
                      </td>
                      <td style={{ padding: '12px 16px', color: '#3A423F' }}>
                        {shp.carrier || 'Not assigned'}
                      </td>
                      <td style={{ padding: '12px 16px', color: '#68726E', fontSize: 11.5 }}>
                        {shp.tracking_reference || '—'}
                      </td>
                      <td style={{ padding: '12px 16px', color: '#68726E', whiteSpace: 'nowrap' }}>
                        {shp.estimated_delivery_date ? new Date(shp.estimated_delivery_date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }) : '—'}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <StatusBadge status={shp.status} />
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                        <button
                          type="button"
                          onClick={() => handleOpenDetail(shp)}
                          style={{
                            background: '#FFFFFF',
                            border: '1px solid #E8E4D8',
                            borderRadius: 5,
                            padding: '4px 10px',
                            fontSize: 11,
                            fontWeight: 600,
                            color: '#183A34',
                            cursor: 'pointer',
                          }}
                        >
                          Manage
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Standardized Shared Pagination */}
        <HandlerPagination
          currentPage={page}
          pageSize={pageSize}
          totalItems={filteredShipments.length}
          onPageChange={(p) => setPage(p)}
          onPageSizeChange={(sz) => {
            setPageSize(sz);
            setPage(1);
          }}
          pageSizeOptions={[5, 10, 20, 50]}
        />
      </div>

      {/* Shipment Detail & Action Drawer */}
      {selectedShipment && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            right: 0,
            bottom: 0,
            width: 480,
            maxWidth: '100vw',
            backgroundColor: '#FFFFFF',
            boxShadow: '-4px 0 24px rgba(18, 45, 41, 0.15)',
            zIndex: 100,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* Drawer Header */}
          <div style={{ padding: '18px 22px', borderBottom: '1px solid #E8E4D8', display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#FAF7F2' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <h2 style={{ fontSize: 17, fontWeight: 800, color: '#122D29', margin: 0 }}>
                  Shipment #{selectedShipment.id || selectedShipment.order_id}
                </h2>
                <StatusBadge status={selectedShipment.status} />
              </div>
              <span style={{ fontSize: 11.5, color: '#68726E' }}>
                Order {selectedShipment.order_number}
              </span>
            </div>
            <button
              type="button"
              onClick={handleCloseDetail}
              style={{ background: 'none', border: 'none', color: '#68726E', cursor: 'pointer', padding: 4 }}
            >
              <X size={18} />
            </button>
          </div>

          {/* Drawer Body */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '20px 22px' }}>
            {actionSuccess && (
              <div style={{ backgroundColor: '#DCFCE7', color: '#15803D', padding: '9px 12px', borderRadius: 6, fontSize: 12, marginBottom: 14, fontWeight: 500 }}>
                {actionSuccess}
              </div>
            )}
            {actionError && (
              <div style={{ backgroundColor: '#FEE2E2', color: '#991B1B', padding: '9px 12px', borderRadius: 6, fontSize: 12, marginBottom: 14, fontWeight: 500 }}>
                {actionError}
              </div>
            )}

            {/* Destination */}
            <div style={{ marginBottom: 18, borderBottom: '1px solid #F0ECE1', paddingBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#88928E', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>
                Delivery Address
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12.5, color: '#3A423F' }}>
                <MapPin size={16} color="#88928E" style={{ flexShrink: 0, marginTop: 2 }} />
                <span>
                  {selectedShipment.delivery_address ? (
                    [
                      selectedShipment.delivery_address.street,
                      selectedShipment.delivery_address.locality,
                      selectedShipment.delivery_address.city,
                      selectedShipment.delivery_address.state,
                      selectedShipment.delivery_address.pin_code,
                    ].filter(Boolean).join(', ')
                  ) : (
                    'Address on file'
                  )}
                </span>
              </div>
            </div>

            {/* Carrier Metadata Inputs */}
            <div style={{ marginBottom: 18, borderBottom: '1px solid #F0ECE1', paddingBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#88928E', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 10 }}>
                Carrier &amp; Tracking Information
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 11, color: '#5A6460', marginBottom: 4 }}>
                    Carrier Name
                  </label>
                  <input
                    type="text"
                    value={carrierInput}
                    onChange={(e) => setCarrierInput(e.target.value)}
                    placeholder="e.g. Blue Dart, Delhivery"
                    style={{ width: '100%', padding: '7px 9px', border: '1px solid #D6CEB5', borderRadius: 6, fontSize: 12 }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 11, color: '#5A6460', marginBottom: 4 }}>
                    Tracking Reference
                  </label>
                  <input
                    type="text"
                    value={trackingRefInput}
                    onChange={(e) => setTrackingRefInput(e.target.value)}
                    placeholder="Tracking ID"
                    style={{ width: '100%', padding: '7px 9px', border: '1px solid #D6CEB5', borderRadius: 6, fontSize: 12 }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 11, color: '#5A6460', marginBottom: 4 }}>
                    Estimated Delivery
                  </label>
                  <input
                    type="date"
                    value={etaInput}
                    onChange={(e) => setEtaInput(e.target.value)}
                    style={{ width: '100%', padding: '6px 8px', border: '1px solid #D6CEB5', borderRadius: 6, fontSize: 12 }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 11, color: '#5A6460', marginBottom: 4 }}>
                    Tracking URL
                  </label>
                  <input
                    type="url"
                    value={trackingUrlInput}
                    onChange={(e) => setTrackingUrlInput(e.target.value)}
                    placeholder="https://..."
                    style={{ width: '100%', padding: '7px 9px', border: '1px solid #D6CEB5', borderRadius: 6, fontSize: 12 }}
                  />
                </div>
              </div>
            </div>

            {/* Advancement & Next Status Transition */}
            <div style={{ background: '#FAF7F2', border: '1px solid #E8E4D8', borderRadius: 8, padding: 16, marginBottom: 18 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#122D29', marginBottom: 8 }}>
                Advance Shipment Lifecycle
              </div>

              {(selectedShipment.next_status_options || []).length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#5A6460', marginBottom: 4 }}>
                      Next Shipment Milestone:
                    </label>
                    <select
                      value={selectedNextStatus}
                      onChange={(e) => setSelectedNextStatus(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '8px 10px',
                        border: '1px solid #D6CEB5',
                        borderRadius: 6,
                        fontSize: 12.5,
                        backgroundColor: '#FFFFFF',
                      }}
                    >
                      <option value="">Keep current status</option>
                      {(selectedShipment.next_status_options || []).map((st) => (
                        <option key={st} value={st}>
                          {st.replace(/_/g, ' ').toUpperCase()}
                        </option>
                      ))}
                    </select>
                  </div>

                  {selectedNextStatus === 'delivered' && (
                    <div style={{ backgroundColor: '#FEF3C7', color: '#92400E', padding: '8px 10px', borderRadius: 6, fontSize: 11 }}>
                      <strong>Important:</strong> Transitioning to <strong>Delivered</strong> will automatically synchronize and complete the linked customer order.
                    </div>
                  )}

                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#5A6460', marginBottom: 4 }}>
                      Operational Note:
                    </label>
                    <textarea
                      rows={2}
                      value={operationalNote}
                      onChange={(e) => setOperationalNote(e.target.value)}
                      placeholder="Add dispatch or carrier handoff note..."
                      style={{
                        width: '100%',
                        padding: '7px 10px',
                        border: '1px solid #D6CEB5',
                        borderRadius: 6,
                        fontSize: 12,
                        backgroundColor: '#FFFFFF',
                        resize: 'none',
                      }}
                    />
                  </div>

                  <button
                    type="button"
                    onClick={handleUpdate}
                    disabled={updating}
                    style={{
                      background: '#183A34',
                      color: '#FFFFFF',
                      border: 'none',
                      borderRadius: 6,
                      padding: '9px 16px',
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: updating ? 'not-allowed' : 'pointer',
                      marginTop: 4,
                    }}
                  >
                    {updating ? 'Saving...' : 'Save Shipment Update'}
                  </button>
                </div>
              ) : (
                <p style={{ margin: 0, fontSize: 12, color: '#88928E' }}>
                  This shipment has reached its terminal stage ({selectedShipment.status}).
                </p>
              )}
            </div>

            {/* Shipment Event History */}
            {selectedShipment.events && selectedShipment.events.length > 0 && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#88928E', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 10 }}>
                  Shipment Event History ({selectedShipment.events.length})
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {selectedShipment.events.map((ev) => (
                    <div
                      key={ev.id}
                      style={{
                        padding: '8px 10px',
                        background: '#FAF7F2',
                        border: '1px solid #EFECE4',
                        borderRadius: 6,
                        fontSize: 11.5,
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', color: '#122D29', fontWeight: 600, marginBottom: 2 }}>
                        <span>{ev.new_status ? ev.new_status.replace(/_/g, ' ').toUpperCase() : 'Event'}</span>
                        <span style={{ fontSize: 10.5, color: '#88928E', fontWeight: 400 }}>
                          {ev.created_at ? new Date(ev.created_at).toLocaleString('en-IN') : '—'}
                        </span>
                      </div>
                      {ev.note && <div style={{ color: '#5A6460' }}>{ev.note}</div>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default ODShipmentManagementView;

