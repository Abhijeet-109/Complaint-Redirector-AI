import React, { useEffect, useState } from 'react';
import { Check, Eye, EyeOff, Pencil, Trash2, ChevronDown, ArrowLeft } from 'lucide-react';
import { AccountLayout } from '../components/account/AccountLayout';
import { WishlistDrawer } from '../components/common/WishlistDrawer';
import { ChatbotWidget } from '../components/chatbot/ChatbotWidget';
import { CartDrawer } from '../components/common/CartDrawer';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { useAddressBook } from '../context/AddressContext';
import { accountService } from '../services/accountService';
import { getAddressesForUser } from '../services/addressCache';
import { AccountOrders } from './AccountOrders';
import { AccountSupportTickets } from './AccountSupportTickets';

const blankAddress = { recipient_name: '', mobile_number: '', address_line1: '', address_line2: '', locality: '', city: '', state: '', pin_code: '', label: 'Home', is_default: false };

function EyeIcon({ visible }) { return visible ? <EyeOff size={17} /> : <Eye size={17} />; }

function AccountSection({ section, onProfileSaved }) {
  const { refreshAddresses } = useAddressBook();
  const { user } = useAuth();
  const [profile, setProfile] = useState({ name: '', email: '', mobile_number: '' });
  const [password, setPassword] = useState({ current_password: '', new_password: '' });
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [addresses, setAddresses] = useState([]);
  const [address, setAddress] = useState(blankAddress);
  const [editingId, setEditingId] = useState(null);
  const [preference, setPreference] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState({ type: '', text: '' });

  const notify = (type, text) => setNotice({ type, text });
  const loadAddresses = async ({ refresh = false } = {}) => setAddresses(await getAddressesForUser(user?.id, { refresh }));

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setNotice({ type: '', text: '' });
    const load = async () => {
      try {
        if (section === 'profile') {
          const value = await accountService.profile();
          if (alive) setProfile(value);
        } else if (section === 'address') {
          const value = await getAddressesForUser(user?.id);
          if (alive) setAddresses(value);
        } else if (section === 'payments') {
          const value = await accountService.paymentPreference();
          if (alive) setPreference(value.preferred_payment_method || '');
        }
      } catch (error) { if (alive) notify('error', error.message || 'Could not load this account section.'); }
      finally { if (alive) setLoading(false); }
    };
    load();
    return () => { alive = false; };
  }, [section]);

  const saveProfile = async (event) => {
    event.preventDefault(); setBusy(true); setNotice({ type: '', text: '' });
    try { const value = await accountService.updateProfile({ name: profile.name, mobile_number: profile.mobile_number || null }); setProfile(value); onProfileSaved(value); notify('success', 'Profile updated.'); }
    catch (error) { notify('error', error.message || 'Profile could not be updated.'); }
    finally { setBusy(false); }
  };

  const changePassword = async (event) => {
    event.preventDefault(); setBusy(true);
    try { await accountService.changePassword({ current_password: password.current_password, new_password: password.new_password }); setPassword({ current_password: '', new_password: '' }); setShowCurrentPassword(false); setShowNewPassword(false); notify('success', 'Password updated.'); }
    catch (error) { notify('error', error.message || 'Password could not be updated.'); }
    finally { setBusy(false); }
  };

  const saveAddress = async (event) => {
    event.preventDefault(); setBusy(true);
    try {
      const { id, ...payload } = address;
      if (editingId) await accountService.updateAddress(editingId, payload);
      else await accountService.createAddress(payload);
      await loadAddresses({ refresh: true }); await refreshAddresses({ refresh: true }); setAddress(blankAddress); setEditingId(null); notify('success', editingId ? 'Address updated.' : 'Address saved.');
    } catch (error) { notify('error', error.message || 'Address could not be saved.'); }
    finally { setBusy(false); }
  };

  const cardStyle = { padding: 22, border: '1px solid #e0dfd6', borderRadius: 9, background: 'var(--fk-surface)', marginBottom: 18 };
  const fieldStyle = { display: 'grid', gap: 6, color: '#34463f', fontSize: 13, marginBottom: 13 };
  const inputStyle = { width: '100%', minHeight: 42, padding: '9px 11px', border: '1px solid #d6d7ce', borderRadius: 5, font: 'inherit' };
  const title = section === 'address' ? 'Address Book' : section === 'payments' ? 'Payment Methods' : 'Profile Information';

  return <section style={{ maxWidth: 820, padding: '28px 24px' }}>
    <h1 style={{ margin: '0 0 7px', fontSize: 28 }}>{title}</h1>
    <p style={{ margin: '0 0 22px', color: 'var(--fk-text-muted)' }}>Manage your Flatkart account information.</p>
    {notice.text && <p role={notice.type === 'error' ? 'alert' : 'status'} style={{ padding: 12, borderRadius: 5, color: notice.type === 'error' ? '#8a3228' : '#245842', background: notice.type === 'error' ? '#fff3f0' : '#edf6ed' }}>{notice.text}</p>}
    {loading && <p role="status" className="fk-account-state">Loading account information…</p>}

    {!loading && section === 'profile' && <>
      <form onSubmit={saveProfile} style={cardStyle}>
        <h2 style={{ marginTop: 0, fontSize: 18 }}>Personal details</h2>
        <label style={fieldStyle}>Full name<input style={inputStyle} required maxLength={120} value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} /></label>
        <label style={fieldStyle}>Registered email<input style={inputStyle} value={profile.email} readOnly /></label>
        <label style={fieldStyle}>Mobile number<input style={inputStyle} inputMode="tel" minLength={10} maxLength={15} value={profile.mobile_number || ''} onChange={(e) => setProfile({ ...profile, mobile_number: e.target.value })} /></label>
        <button className="fk-checkout-submit" disabled={busy}>Save profile</button>
      </form>
      <form onSubmit={changePassword} style={cardStyle}>
        <h2 style={{ marginTop: 0, fontSize: 18 }}>Change password</h2>
        <label style={fieldStyle}>Current password<span className="fk-password-control"><input style={inputStyle} type={showCurrentPassword ? 'text' : 'password'} autoComplete="current-password" required value={password.current_password} onChange={(e) => setPassword({ ...password, current_password: e.target.value })} /><button type="button" aria-label={showCurrentPassword ? 'Hide current password' : 'Show current password'} onClick={() => setShowCurrentPassword((visible) => !visible)}><EyeIcon visible={showCurrentPassword} /></button></span></label>
        <label style={fieldStyle}>New password<span className="fk-password-control"><input style={inputStyle} type={showNewPassword ? 'text' : 'password'} autoComplete="new-password" minLength={8} required value={password.new_password} onChange={(e) => setPassword({ ...password, new_password: e.target.value })} /><button type="button" aria-label={showNewPassword ? 'Hide new password' : 'Show new password'} onClick={() => setShowNewPassword((visible) => !visible)}><EyeIcon visible={showNewPassword} /></button></span></label>
        <button className="fk-checkout-submit" disabled={busy}>Update password</button>
      </form>
    </>}

    {!loading && section === 'address' && <>
      <div className="fk-address-list-card" style={cardStyle}>
        <h2>Saved addresses</h2>
        {addresses.length === 0 && <p className="fk-address-empty">No saved addresses yet. Add one below.</p>}
        <div className="fk-address-grid">{addresses.map((item) => <article key={item.id} className="fk-saved-address-card">
          <div className="fk-address-title"><strong>{item.label}</strong>{item.is_default && <span>Default</span>}</div>
          <p><strong>{item.recipient_name}</strong><br />{item.mobile_number}</p>
          <p>{[item.address_line1, item.address_line2, item.locality, item.city, item.state, item.pin_code].filter(Boolean).join(', ')}</p>
          <div className="fk-address-actions">
            <button type="button" className="fk-address-action" onClick={() => { setAddress({ ...blankAddress, ...item }); setEditingId(item.id); }}><Pencil size={15} /> Edit</button>
            {!item.is_default && <button type="button" className="fk-address-action" onClick={async () => { try { await accountService.setDefaultAddress(item.id); await loadAddresses({ refresh: true }); await refreshAddresses({ refresh: true }); notify('success', 'Default address changed.'); } catch (error) { notify('error', error.message); } }}><Check size={15} /> Set as default</button>}
            <button type="button" className="fk-address-action is-danger" onClick={async () => { try { await accountService.deleteAddress(item.id); await loadAddresses({ refresh: true }); await refreshAddresses({ refresh: true }); notify('success', 'Address deleted.'); } catch (error) { notify('error', error.message); } }}><Trash2 size={15} /> Delete</button>
          </div>
        </article>)}</div>
      </div>
      <form onSubmit={saveAddress} className="fk-address-form" style={cardStyle}>
        <h2>{editingId ? 'Edit address' : 'Add an address'}</h2>
        <div className="fk-checkout-fields">
          {[["recipient_name","Recipient name"],["mobile_number","Mobile number"],["address_line1","Address line 1"],["address_line2","Address line 2"],["locality","Locality / landmark"],["city","City"],["state","State"],["pin_code","PIN code"]].map(([key,label]) => <label key={key} className={`${key === 'address_line1' || key === 'address_line2' ? 'fk-field-wide ' : ''}fk-address-field`}>{label}<input className="fk-address-input" required={key !== 'address_line2'} inputMode={key === 'pin_code' || key === 'mobile_number' ? 'numeric' : undefined} pattern={key === 'pin_code' ? '[0-9]{6}' : undefined} maxLength={key === 'pin_code' ? 6 : key === 'mobile_number' ? 15 : 240} value={address[key] || ''} onChange={(e) => setAddress({ ...address, [key]: e.target.value })} /></label>)}
          <label className="fk-address-field">Label<select className="fk-address-input" value={address.label} onChange={(e) => setAddress({ ...address, label: e.target.value })}>{['Home','Work','Other'].map((label) => <option key={label}>{label}</option>)}</select></label>
          <label className="fk-checkbox-row"><input className="fk-compact-checkbox" type="checkbox" checked={address.is_default} onChange={(e) => setAddress({ ...address, is_default: e.target.checked })} /> Set as default</label>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 15 }}><button className="fk-checkout-submit" disabled={busy}>{editingId ? 'Save address' : 'Add address'}</button>{editingId && <button type="button" className="fk-checkout-back" onClick={() => { setAddress(blankAddress); setEditingId(null); }}>Cancel</button>}</div>
      </form>
    </>}

    {!loading && section === 'payments' && <div style={cardStyle}>
      <h2 style={{ marginTop: 0, fontSize: 18 }}>Preferred payment method</h2>
      <p>Choose a preference. Checkout shows only methods supported by every item in your order and your current payment configuration.</p>
      <label style={fieldStyle}>Preference<select style={inputStyle} value={preference} onChange={(e) => setPreference(e.target.value)}><option value="">No preference</option><option value="cod">Cash on Delivery</option><option value="upi">UPI through Razorpay</option><option value="netbanking">Net Banking through Razorpay</option></select></label>
      <button className="fk-checkout-submit" disabled={busy} onClick={async () => { setBusy(true); try { await accountService.savePaymentPreference(preference || null); notify('success', 'Payment preference saved.'); } catch (error) { notify('error', error.message || 'Preference could not be saved.'); } finally { setBusy(false); } }}>Save preference</button>
      <p style={{ marginBottom: 0, color: 'var(--fk-text-muted)', fontSize: 13 }}>Payment credentials and non-tokenized instruments are never stored in your account.</p>
    </div>}
  </section>;
}

export function MyAccount({ section = 'profile', onNavigate }) {
  const { user, setUser } = useAuth();
  const { setIsWishlistOpen } = useCart();
  const [chatOpen, setChatOpen] = useState(false);
  const [orderFilter, setOrderFilter] = useState('all');
  const [resetOrderTrigger, setResetOrderTrigger] = useState(0);

  const validSection = ['profile', 'address', 'payments', 'orders', 'support-tickets', 'wishlist'].includes(section) ? section : 'profile';
  useEffect(() => {
    if (validSection === 'wishlist') setIsWishlistOpen(true);
  }, [validSection, setIsWishlistOpen]);

  const handleBackToOrders = () => {
    setResetOrderTrigger((prev) => prev + 1);
  };

  const handleStartReturnIntake = (context) => {
    const handoff = {
      ...context,
      intent: 'return_replacement',
      requestKey: crypto.randomUUID(),
      createdAt: Date.now(),
    };
    sessionStorage.setItem('flatkart_return_intake_handoff', JSON.stringify(handoff));
    onNavigate?.('my-conversations');
  };

  const navOrderActions = validSection === 'orders' ? (
    <div className="fk-nav-order-actions">
      <button
        type="button"
        className="fk-nav-back-orders-btn"
        onClick={handleBackToOrders}
        title="Back to all orders"
      >
        <ArrowLeft size={14} />
        <span>Back to orders</span>
      </button>

      <div className="fk-nav-order-filter">
        <select
          className="fk-orders-select"
          value={orderFilter}
          onChange={(e) => setOrderFilter(e.target.value)}
          aria-label="Filter orders"
        >
          <option value="all">All Orders</option>
          <option value="active">In Progress</option>
          <option value="delivered">Delivered</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <ChevronDown size={15} className="fk-select-chevron" />
      </div>
    </div>
  ) : null;

  return <>
    <AccountLayout
      activeItem={validSection}
      onNavigate={onNavigate}
      onOpenWishlist={() => setIsWishlistOpen(true)}
      onToggleChatbot={() => setChatOpen((open) => !open)}
      extraNavAction={navOrderActions}
      scrollable
    >
      {['profile', 'address', 'payments'].includes(validSection)
        ? <AccountSection key={validSection} section={validSection} onProfileSaved={(value) => { setUser({ ...user, ...value }); localStorage.setItem('flatkart_user', JSON.stringify({ ...user, ...value })); }} />
        : validSection === 'orders' ? <AccountOrders filter={orderFilter} onFilterChange={setOrderFilter} resetTrigger={resetOrderTrigger} onStartReturnIntake={handleStartReturnIntake} />
          : validSection === 'support-tickets' ? <AccountSupportTickets />
            : <section style={{ padding: 28 }}><h1>Wishlist</h1><p>Your saved products are available in the wishlist panel.</p></section>}
    </AccountLayout>
    <WishlistDrawer onNavigate={onNavigate} />
    <CartDrawer onNavigate={onNavigate} />
    <ChatbotWidget isOpen={chatOpen} onToggle={() => setChatOpen((open) => !open)} onNavigate={onNavigate} />
  </>;
}

export default MyAccount;
