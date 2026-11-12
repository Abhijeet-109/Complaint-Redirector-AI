import React, { useState } from 'react';
import { MapPin, X } from 'lucide-react';
import { useAddressBook } from '../../context/AddressContext';
import { useAuth } from '../../context/AuthContext';
import { accountService } from '../../services/accountService';

const DEFAULT_NAV_ITEMS = ['Home'];

export function CategoryNav({ activeCategory, onSelectCategory, items, onNavigate, extraRightAction }) {
  const navItems = items || DEFAULT_NAV_ITEMS;
  const { addresses, selectedAddress, selectAddress, setDefaultAddress, refreshAddresses } = useAddressBook();
  const { isAuthenticated } = useAuth();
  const [open, setOpen] = useState(false);
  const [pin, setPin] = useState('');
  const [feedback, setFeedback] = useState('');
  const [busy, setBusy] = useState(false);

  const checkPin = async (event) => {
    event.preventDefault();
    if (!/^\d{6}$/.test(pin)) { setFeedback('Enter a valid six-digit PIN code.'); return; }
    setBusy(true); setFeedback('Checking delivery availability…');
    try {
      const result = await accountService.deliveryCheck(pin);
      setFeedback(result.deliverable ? `Deliverable: ${result.area}, ${result.city}` : 'Delivery is unavailable at this PIN code.');
    } catch (error) { setFeedback(error.message || 'Could not check this PIN code.'); }
    finally { setBusy(false); }
  };

  return <nav className="fk-secondary-nav">
    <div className="fk-nav-links">
      {navItems.map((item) => {
        const isActive = (activeCategory || 'Home').toLowerCase() === item.toLowerCase();
        return <button key={item} className={`fk-nav-item ${isActive ? 'active' : ''}`} onClick={() => onSelectCategory?.(item)}>{item}</button>;
      })}
    </div>
    <div className="fk-secondary-nav-right">
      {extraRightAction}
      <button type="button" className="fk-nav-delivery" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-expanded={open} title="Choose delivery location">
        <MapPin size={18} strokeWidth={2.2} color="var(--fk-text-primary)" />
        <span className="fk-delivery-text"><span className="fk-delivery-label">Deliver to</span><span className="fk-delivery-value">{selectedAddress ? selectedAddress.pin_code : isAuthenticated ? 'Add address' : 'Choose location'}</span></span>
      </button>
    </div>
    {open && <div className="fk-modal-overlay" role="presentation" onClick={() => setOpen(false)}>
      <section className="fk-auth-modal" role="dialog" aria-modal="true" aria-label="Delivery location" onClick={(event) => event.stopPropagation()} style={{ maxWidth: 540 }}>
        <div className="fk-auth-header"><strong>Choose delivery location</strong><button type="button" aria-label="Close" onClick={() => setOpen(false)}><X size={20} /></button></div>
        <div style={{ padding: 20 }}>
          {isAuthenticated ? <>
            {addresses.length ? addresses.map((address) => <article key={address.id} style={{ display: 'flex', gap: 12, alignItems: 'start', padding: 12, borderBottom: '1px solid #e7e5dc' }}>
              <input type="radio" name="delivery-address" checked={selectedAddress?.id === address.id} onChange={() => selectAddress(address.id)} aria-label={`Deliver to ${address.label} ${address.pin_code}`} />
              <div style={{ flex: 1 }}><strong>{address.label}{address.is_default ? ' · Default' : ''}</strong><p style={{ margin: '5px 0', lineHeight: 1.45 }}>{[address.recipient_name, address.address_line1, address.address_line2, address.locality, address.city, address.state, address.pin_code].filter(Boolean).join(', ')}</p>{!address.is_default && <button type="button" className="fk-checkout-back" onClick={async () => { try { await setDefaultAddress(address.id); setFeedback('Default address changed.'); } catch (error) { setFeedback(error.message || 'Could not set the default address.'); } }}>Set as default</button>}</div>
            </article>) : <p>No saved addresses yet.</p>}
            <button type="button" className="fk-auth-btn" style={{ marginTop: 14 }} onClick={() => { setOpen(false); onNavigate?.('account', 'address'); }}>{addresses.length ? 'Manage addresses' : 'Add an address'}</button>
            <button type="button" className="fk-checkout-back" onClick={refreshAddresses}>Refresh addresses</button>
          </> : <form onSubmit={checkPin}>
            <label htmlFor="fk-nav-pincode">Check availability by PIN code</label><div style={{ display: 'flex', gap: 8, marginTop: 8 }}><input id="fk-nav-pincode" inputMode="numeric" maxLength={6} value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, '').slice(0, 6))} /><button type="submit" disabled={busy}>{busy ? 'Checking…' : 'Check'}</button></div>
          </form>}
          {feedback && <p role="status" style={{ marginBottom: 0 }}>{feedback}</p>}
        </div>
      </section>
    </div>}
  </nav>;
}
