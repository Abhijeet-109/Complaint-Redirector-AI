import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from './AuthContext';
import { accountService } from '../services/accountService';
import { getAddressesForUser } from '../services/addressCache';

const AddressContext = createContext(null);

export function AddressProvider({ children }) {
  const { user, isAuthenticated, loading } = useAuth();
  const ownerId = isAuthenticated ? user?.id : null;
  const [state, setState] = useState({ ownerId: null, addresses: [], selectedId: null, error: '' });
  const refreshAddresses = useCallback(async ({ refresh = false } = {}) => {
    if (!ownerId || loading) { setState({ ownerId: null, addresses: [], selectedId: null, error: '' }); return []; }
    try {
      const addresses = await getAddressesForUser(ownerId, { refresh });
      const stored = localStorage.getItem(`flatkart_delivery_address:${ownerId}`);
      const savedId = stored ? Number(stored) : null;
      const selectedId = addresses.some((item) => item.id === savedId) ? savedId : (addresses.find((item) => item.is_default)?.id || null);
      setState({ ownerId, addresses, selectedId, error: '' });
      return addresses;
    } catch (error) {
      setState({ ownerId, addresses: [], selectedId: null, error: error.message || 'Could not load saved addresses.' });
      return [];
    }
  }, [ownerId, loading]);

  useEffect(() => {
    setState({ ownerId: null, addresses: [], selectedId: null, error: '' });
    if (!loading && ownerId) refreshAddresses();
  }, [ownerId, loading, refreshAddresses]);

  const selectAddress = useCallback((id) => {
    const numericId = id == null ? null : Number(id);
    setState((current) => current.ownerId === ownerId ? { ...current, selectedId: numericId } : current);
    if (ownerId && numericId) localStorage.setItem(`flatkart_delivery_address:${ownerId}`, String(numericId));
  }, [ownerId]);

  const setDefaultAddress = useCallback(async (id) => {
    await accountService.setDefaultAddress(id);
    localStorage.setItem(`flatkart_delivery_address:${ownerId}`, String(id));
    await refreshAddresses({ refresh: true });
  }, [ownerId, refreshAddresses]);

  const value = useMemo(() => ({
    addresses: state.ownerId === ownerId ? state.addresses : [],
    selectedAddress: state.ownerId === ownerId ? state.addresses.find((item) => item.id === state.selectedId) || state.addresses.find((item) => item.is_default) || null : null,
    addressError: state.ownerId === ownerId ? state.error : '',
    refreshAddresses, selectAddress, setDefaultAddress,
  }), [state, ownerId, refreshAddresses, selectAddress, setDefaultAddress]);
  return <AddressContext.Provider value={value}>{children}</AddressContext.Provider>;
}

export function useAddressBook() { return useContext(AddressContext); }
