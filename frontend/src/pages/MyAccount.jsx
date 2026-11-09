import React, { useEffect, useState } from 'react';
import { AccountLayout } from '../components/account/AccountLayout';
import { OrdersModal } from '../components/common/OrdersModal';
import { WishlistDrawer } from '../components/common/WishlistDrawer';
import { ChatbotWidget } from '../components/chatbot/ChatbotWidget';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { useAddressBook } from '../context/AddressContext';
import { accountService } from '../services/accountService';

const blankAddress = { recipient_name: '', mobile_number: '', address_line1: '', address_line2: '', locality: '', city: '', state: '', pin_code: '', label: 'Home', is_default: false };

function AccountSection({ section, onProfileSaved }) {
  const { refreshAddresses } = useAddressBook();
  const [profile, setProfile] = useState({ name: '', email: '', mobile_number: '' });
  const [password, setPassword] = useState({ current_password: '', new_password: '' });
  const [addresses, setAddresses] = useState([]);
  const [address, setAddress] = useState(blankAddress);
  const [editingId, setEditingId] = useState(null);
  const [preference, setPreference] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState({ type: '', text: '' });

  const notify = (type, text) => setNotice({ type, text });
  const loadAddresses = async () => setAddresses(await accountService.addresses());

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        if (section === 'profile') {
          const value = await accountService.profile();
          if (alive) setProfile(value);
        } else if (section === 'address') {
          const value = await accountService.addresses();
          if (alive) setAddresses(value);
        } else if (section === 'payments') {
          const value = await accountService.paymentPreference();
          if (alive) setPreference(value.preferred_payment_method || '');
        }
      } catch (error) { if (alive) notify('error', error.message || 'Could not load this account section.'); }
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
    try { await accountService.changePassword(password); setPassword({ current_password: '', new_password: '' }); notify('success', 'Password updated.'); }
    catch (error) { notify('error', error.message || 'Password could not be updated.'); }
    finally { setBusy(false); }
  };

  const saveAddress = async (event) => {
    event.preventDefault(); setBusy(true);
    try {
      const { id, ...payload } = address;
      if (editingId) await accountService.updateAddress(editingId, payload);
      else await accountService.createAddress(payload);
      await loadAddresses(); await refreshAddresses(); setAddress(blankAddress); setEditingId(null); notify('success', editingId ? 'Address updated.' : 'Address saved.');
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

    {section === 'profile' && <>
      <form onSubmit={saveProfile} style={cardStyle}>
        <h2 style={{ marginTop: 0, fontSize: 18 }}>Personal details</h2>
        <label style={fieldStyle}>Full name<input style={inputStyle} required maxLength={120} value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} /></label>
        <label style={fieldStyle}>Registered email<input style={inputStyle} value={profile.email} readOnly /></label>
        <label style={fieldStyle}>Mobile number<input style={inputStyle} inputMode="tel" minLength={10} maxLength={15} value={profile.mobile_number || ''} onChange={(e) => setProfile({ ...profile, mobile_number: e.target.value })} /></label>
        <button className="fk-checkout-submit" disabled={busy}>Save profile</button>
      </form>
      <form onSubmit={changePassword} style={cardStyle}>
        <h2 style={{ marginTop: 0, fontSize: 18 }}>Change password</h2>
        <label style={fieldStyle}>Current password<input style={inputStyle} type="password" autoComplete="current-password" required value={password.current_password} onChange={(e) => setPassword({ ...password, current_password: e.target.value })} /></label>
        <label style={fieldStyle}>New password<input style={inputStyle} type="password" autoComplete="new-password" minLength={8} required value={password.new_password} onChange={(e) => setPassword({ ...password, new_password: e.target.value })} /></label>
        <button className="fk-checkout-submit" disabled={busy}>Update password</button>
      </form>
    </>}

    {section === 'address' && <>
      <div style={cardStyle}>
        <h2 style={{ marginTop: 0, fontSize: 18 }}>Saved addresses</h2>
        {addresses.length === 0 && <p>No saved addresses yet. Add one below.</p>}
        {addresses.map((item) => <article key={item.id} style={{ padding: 14, borderTop: '1px solid #e7e5dc' }}>
          <strong>{item.label}{item.is_default ? ' · Default' : ''}</strong><p style={{ lineHeight: 1.55 }}>{item.recipient_name} · {item.mobile_number}<br />{item.address_line1}{item.address_line2 ? `, ${item.address_line2}` : ''}, {item.locality}, {item.city}, {item.state} {item.pin_code}</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <button type="button" className="fk-checkout-back" onClick={() => { setAddress({ ...blankAddress, ...item }); setEditingId(item.id); }}>Edit</button>
            {!item.is_default && <button type="button" className="fk-checkout-back" onClick={async () => { try { await accountService.setDefaultAddress(item.id); await loadAddresses(); await refreshAddresses(); notify('success', 'Default address changed.'); } catch (error) { notify('error', error.message); } }}>Set as default</button>}
            <button type="button" className="fk-checkout-back" onClick={async () => { try { await accountService.deleteAddress(item.id); await loadAddresses(); await refreshAddresses(); notify('success', 'Address deleted.'); } catch (error) { notify('error', error.message); } }}>Delete</button>
          </div>
        </article>)}
      </div>
      <form onSubmit={saveAddress} style={cardStyle}>
        <h2 style={{ marginTop: 0, fontSize: 18 }}>{editingId ? 'Edit address' : 'Add an address'}</h2>
        <div className="fk-checkout-fields">
          {[["recipient_name","Recipient name"],["mobile_number","Mobile number"],["address_line1","Address line 1"],["address_line2","Address line 2"],["locality","Locality / landmark"],["city","City"],["state","State"],["pin_code","PIN code"]].map(([key,label]) => <label key={key} className={key === 'address_line1' || key === 'address_line2' ? 'fk-field-wide' : ''}>{label}<input style={inputStyle} required={key !== 'address_line2'} inputMode={key === 'pin_code' || key === 'mobile_number' ? 'numeric' : undefined} pattern={key === 'pin_code' ? '[0-9]{6}' : undefined} maxLength={key === 'pin_code' ? 6 : key === 'mobile_number' ? 15 : 240} value={address[key] || ''} onChange={(e) => setAddress({ ...address, [key]: e.target.value })} /></label>)}
          <label>Label<select style={inputStyle} value={address.label} onChange={(e) => setAddress({ ...address, label: e.target.value })}>{['Home','Work','Other'].map((label) => <option key={label}>{label}</option>)}</select></label>
          <label style={{ alignSelf: 'end' }}><input type="checkbox" checked={address.is_default} onChange={(e) => setAddress({ ...address, is_default: e.target.checked })} /> Set as default</label>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 15 }}><button className="fk-checkout-submit" disabled={busy}>{editingId ? 'Save address' : 'Add address'}</button>{editingId && <button type="button" className="fk-checkout-back" onClick={() => { setAddress(blankAddress); setEditingId(null); }}>Cancel</button>}</div>
      </form>
    </>}

    {section === 'payments' && <div style={cardStyle}>
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
  const [ordersOpen, setOrdersOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const validSection = ['profile', 'address', 'payments', 'orders', 'wishlist'].includes(section) ? section : 'profile';
  useEffect(() => {
    if (validSection === 'orders') setOrdersOpen(true);
    if (validSection === 'wishlist') setIsWishlistOpen(true);
  }, [validSection, setIsWishlistOpen]);
  return <>
    <AccountLayout activeItem={validSection} onNavigate={onNavigate} onOpenOrders={() => setOrdersOpen(true)} onOpenWishlist={() => setIsWishlistOpen(true)} onToggleChatbot={() => setChatOpen((open) => !open)} scrollable>
      {['profile', 'address', 'payments'].includes(validSection)
        ? <AccountSection key={validSection} section={validSection} onProfileSaved={(value) => { setUser({ ...user, ...value }); localStorage.setItem('flatkart_user', JSON.stringify({ ...user, ...value })); }} />
        : <section style={{ padding: 28 }}><h1>{validSection === 'orders' ? 'My Orders' : 'Wishlist'}</h1><p>Your account data is available in the {validSection === 'orders' ? 'order history' : 'wishlist'} panel.</p></section>}
    </AccountLayout>
    <OrdersModal isOpen={ordersOpen} onClose={() => setOrdersOpen(false)} />
    <WishlistDrawer onNavigate={onNavigate} />
    <ChatbotWidget isOpen={chatOpen} onToggle={() => setChatOpen((open) => !open)} onNavigate={onNavigate} />
  </>;
}

export default MyAccount;
