import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Banknote, Building2, CheckCircle2, LockKeyhole, MapPin, Smartphone, ShieldCheck, Trash2, Minus, Plus } from 'lucide-react';
import { Header } from '../components/layout/Header';
import { Footer } from '../components/layout/Footer';
import { CartDrawer } from '../components/common/CartDrawer';
import { WishlistDrawer } from '../components/common/WishlistDrawer';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { useAddressBook } from '../context/AddressContext';
import { productService } from '../services/productService';
import { accountService } from '../services/accountService';

const money = (value) => `₹${Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const emptyAddress = { recipient_name: '', mobile_number: '', address_line1: '', address_line2: '', locality: '', city: '', state: '', pin_code: '' };
const newCheckoutId = () => globalThis.crypto?.randomUUID?.() || `fk-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const readBuyNowIntent = () => {
  try {
    const item = JSON.parse(sessionStorage.getItem('flatkart_buy_now_intent') || 'null');
    if (!item?.variantId) return null;
    const normalized = { ...item, checkoutId: item.checkoutId || newCheckoutId() };
    sessionStorage.setItem('flatkart_buy_now_intent', JSON.stringify(normalized));
    return normalized;
  } catch { return null; }
};
const idempotencyStorageKey = (method, mode, identity) => `flatkart_checkout_${mode}_${method}_${identity}_idempotency`;
const keyFor = (method, mode, identity) => {
  const key = idempotencyStorageKey(method, mode, identity);
  let value = sessionStorage.getItem(key);
  if (!value) { value = globalThis.crypto?.randomUUID?.() || `fk-${Date.now()}-${Math.random().toString(36).slice(2)}`; sessionStorage.setItem(key, value); }
  return value;
};

let razorpayScriptPromise;
function loadRazorpay() {
  if (window.Razorpay) return Promise.resolve();
  if (!razorpayScriptPromise) razorpayScriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script'); script.src = 'https://checkout.razorpay.com/v1/checkout.js'; script.async = true;
    script.onload = () => resolve(); script.onerror = () => { razorpayScriptPromise = null; reject(new Error('Razorpay Checkout could not be loaded. Check your connection and try again.')); };
    document.body.appendChild(script);
  });
  return razorpayScriptPromise;
}

function SuccessOverlay({ message, orderNumber, onContinue }) {
  if (!message) return null;
  return <div className="fk-checkout-success-scrim" role="status" aria-live="assertive"><section className="fk-checkout-success-card"><CheckCircle2 size={48} aria-hidden="true" /><h2>{message}</h2>{orderNumber && <p>Order reference: <strong>{orderNumber}</strong></p>}{message === 'Order Placed Successfully' || message === 'Order Successfully placed' ? <button type="button" onClick={onContinue}>Continue shopping</button> : <p className="fk-checkout-success-detail">Confirming your order…</p>}</section></div>;
}

export function Checkout({ onNavigate }) {
  const { user } = useAuth();
  const { cart, refreshCart, setIsCartOpen, updateQuantity, removeFromCart } = useCart();
  const { addresses, selectedAddress, selectAddress, refreshAddresses } = useAddressBook();
  const [buyNow, setBuyNow] = useState(readBuyNowIntent);
  const [buyNowSummary, setBuyNowSummary] = useState(null);
  const viewCart = buyNow ? buyNowSummary : cart;
  const cartItems = viewCart?.items || [];
  const methods = viewCart?.payment_methods || { cod: false, online: false, online_methods: [] };
  const [address, setAddress] = useState({ ...emptyAddress, recipient_name: user?.name || '', mobile_number: user?.mobile_number || '' });
  const [selectedAddressId, setSelectedAddressId] = useState(null);
  const [manualAddress, setManualAddress] = useState(false);
  const [editingSavedAddressId, setEditingSavedAddressId] = useState(null);
  const [saveAddress, setSaveAddress] = useState(false);
  const [setDefault, setSetDefault] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [activeMethod, setActiveMethod] = useState('');
  const [selectedMethod, setSelectedMethod] = useState('');
  const [preferredMethod, setPreferredMethod] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState({ message: '', orderNumber: '' });
  const formRef = useRef(null);
  const checkoutMode = buyNow ? 'buy_now' : 'cart';
  const checkoutIdentity = buyNow
    ? buyNow.checkoutId || `${buyNow.variantId}-${buyNow.quantity}`
    : cartItems.map((item) => `${item.variant_id}-${item.quantity}`).sort().join('_') || 'empty';
  const intentPayload = useMemo(() => buyNow ? { checkout_mode: 'buy_now', variant_id: buyNow.variantId, quantity: buyNow.quantity } : { checkout_mode: 'cart' }, [buyNow]);

  const refreshBuyNow = async (intent = buyNow) => {
    if (!intent) { setBuyNowSummary(null); return; }
    try { setBuyNowSummary(await productService.getCheckoutSummary(intent)); }
    catch (cause) { setError(cause.message || 'This Buy Now item is no longer available.'); setBuyNowSummary({ items: [], payment_methods: { cod: false, online: false, online_methods: [] } }); }
  };
  useEffect(() => { if (buyNow) refreshBuyNow(buyNow); else refreshCart(); }, []);
  useEffect(() => { accountService.paymentPreference().then((value) => setPreferredMethod(value.preferred_payment_method || '')).catch(() => {}); }, []);
  useEffect(() => {
    if (selectedAddress) {
      setSelectedAddressId(selectedAddress.id);
      setAddress({ ...emptyAddress, ...selectedAddress });
      setManualAddress(false);
    }
  }, [selectedAddress?.id]);
  useEffect(() => {
    const available = [...(methods.cod ? ['cod'] : []), ...(methods.online_methods || [])];
    if (preferredMethod && available.includes(preferredMethod)) setSelectedMethod(preferredMethod);
    else if (!available.includes(selectedMethod)) setSelectedMethod(available[0] || '');
  }, [methods.cod, methods.online_methods?.join(','), selectedMethod, preferredMethod]);

  const setField = (event) => { setSelectedAddressId(null); setAddress((current) => ({ ...current, [event.target.name]: event.target.value })); };
  const checkoutAddress = async () => {
    if (selectedAddressId && !manualAddress) return { address_id: selectedAddressId };
    const snapshot = Object.fromEntries(Object.entries({ ...emptyAddress, ...address, address_line2: address.address_line2.trim() || null }).filter(([key]) => Object.hasOwn(emptyAddress, key)));
    const availability = await accountService.deliveryCheck(snapshot.pin_code);
    if (!availability.deliverable) throw new Error('Delivery is unavailable at the selected PIN code.');
    if (editingSavedAddressId) {
      const saved = await accountService.updateAddress(editingSavedAddressId, { ...snapshot, label: address.label || 'Home', is_default: Boolean(address.is_default) });
      await refreshAddresses({ refresh: true });
      return { address_id: saved.id };
    }
    if (saveAddress) {
      const saved = await accountService.createAddress({ ...snapshot, label: 'Home', is_default: setDefault });
      await refreshAddresses({ refresh: true });
      return { address_id: saved.id };
    }
    return { address: snapshot };
  };

  const mutateLine = async (item, delta) => {
    setError('');
    if (buyNow) {
      const quantity = item.quantity + delta;
      if (quantity < 1) { setBuyNow(null); sessionStorage.removeItem('flatkart_buy_now_intent'); setBuyNowSummary(null); return; }
      if (quantity > item.available_stock) return;
      const next = { ...buyNow, quantity, checkoutId: newCheckoutId() };
      sessionStorage.setItem('flatkart_buy_now_intent', JSON.stringify(next)); setBuyNow(next); await refreshBuyNow(next);
      return;
    }
    try { if (item.quantity + delta < 1) await removeFromCart(item.variant_id); else await updateQuantity(item.variant_id, item.quantity + delta); }
    catch (cause) { setError(cause.message || 'Could not update your cart.'); }
  };
  const removeLine = async (item) => {
    if (buyNow) { setBuyNow(null); setBuyNowSummary(null); sessionStorage.removeItem('flatkart_buy_now_intent'); return; }
    try { await removeFromCart(item.variant_id); } catch (cause) { setError(cause.message || 'Could not remove this item.'); }
  };

  const placeCod = async () => {
    if (submittingRef.current || !formRef.current?.reportValidity()) return;
    submittingRef.current = true;
    setSubmitting(true); setActiveMethod('cod'); setError('');
    try {
      const addressPayload = await checkoutAddress();
      const result = await productService.placeCodOrder(addressPayload.address || null, keyFor('cod', checkoutMode, checkoutIdentity), { ...addressPayload, ...intentPayload });
      sessionStorage.removeItem(idempotencyStorageKey('cod', checkoutMode, checkoutIdentity));
      if (buyNow) sessionStorage.removeItem('flatkart_buy_now_intent'); else await refreshCart();
      setSuccess({ message: 'Order Placed Successfully', orderNumber: result.order.order_number });
    } catch (cause) { setError(cause.message || 'Your order could not be placed. Please try again.'); }
    finally { submittingRef.current = false; setSubmitting(false); setActiveMethod(''); }
  };

  const placeOnline = async () => {
    if (submittingRef.current || !formRef.current?.reportValidity()) return;
    submittingRef.current = true;
    setSubmitting(true); setActiveMethod(selectedMethod); setError('');
    let paymentAttemptId = null;
    try {
      const addressPayload = await checkoutAddress();
      const paymentOrder = await productService.createRazorpayCheckout(addressPayload.address || null, keyFor(selectedMethod, checkoutMode, checkoutIdentity), { ...addressPayload, ...intentPayload, online_method: selectedMethod });
      paymentAttemptId = paymentOrder.attempt_id;
      if (paymentOrder.completed && paymentOrder.order?.payment_status === 'captured') {
        if (buyNow) sessionStorage.removeItem('flatkart_buy_now_intent'); else await refreshCart();
        setSuccess({ message: 'Payment success', orderNumber: paymentOrder.order.order_number });
        window.setTimeout(() => setSuccess({ message: 'Order Successfully placed', orderNumber: paymentOrder.order.order_number }), 1300); return;
      }
      await loadRazorpay();
      const response = await new Promise((resolve, reject) => {
        const modal = new window.Razorpay({
          key: paymentOrder.key_id, amount: paymentOrder.amount, currency: paymentOrder.currency,
          name: 'Flatkart', description: `Order ${paymentOrder.local_order_reference}`, order_id: paymentOrder.razorpay_order_id,
          config: { display: { blocks: { flatkart: { name: 'Pay with', instruments: [{ method: selectedMethod }] } }, sequence: ['block.flatkart'], preferences: { show_default_blocks: false } } },
          prefill: { name: address.recipient_name, email: user?.email || '' }, theme: { color: '#122D29' },
          handler: resolve, modal: { ondismiss: () => reject(new Error('Payment cancelled. You can try again.')) },
        });
        modal.on('payment.failed', (event) => reject(new Error(event.error?.description || 'Payment failed. Please try again.')));
        modal.open();
      });
      const verified = await productService.verifyRazorpayPayment({ razorpay_order_id: response.razorpay_order_id, razorpay_payment_id: response.razorpay_payment_id, razorpay_signature: response.razorpay_signature });
      if (!verified.success || verified.order?.payment_status !== 'captured' || verified.order?.status !== 'placed') throw new Error('Payment verification is still pending. Your cart is unchanged; check the payment status before retrying.');
      sessionStorage.removeItem(idempotencyStorageKey(selectedMethod, checkoutMode, checkoutIdentity));
      if (buyNow) sessionStorage.removeItem('flatkart_buy_now_intent'); else await refreshCart();
      setSuccess({ message: 'Payment success', orderNumber: verified.order.order_number });
      window.setTimeout(() => setSuccess({ message: 'Order Successfully placed', orderNumber: verified.order.order_number }), 1300);
    } catch (cause) {
      if (cause.message?.toLowerCase().includes('cancel') || cause.message?.toLowerCase().includes('failed')) {
        let confirmed = !paymentAttemptId;
        if (paymentAttemptId) { try { const result = await productService.cancelRazorpayAttempt(paymentAttemptId); confirmed = ['cancelled','failed','expired'].includes(result.status); } catch { confirmed = false; } }
        if (confirmed) sessionStorage.removeItem(idempotencyStorageKey(selectedMethod, checkoutMode, checkoutIdentity));
      }
      setError(cause.message || 'Payment could not be verified. Your order is not marked as paid.');
    } finally { submittingRef.current = false; setSubmitting(false); setActiveMethod(''); }
  };

  const empty = cartItems.length === 0;
  const onlineMethods = methods.online_methods || [];

  return <div className="fk-page-container">
    <Header onNavigate={onNavigate} />
    <main className="fk-checkout-page">
      <button type="button" className="fk-checkout-back" onClick={() => { if (buyNow) { setBuyNow(null); sessionStorage.removeItem('flatkart_buy_now_intent'); onNavigate('home'); } else if (!empty) setIsCartOpen(true); else onNavigate('home'); }}><ArrowLeft size={17} /> Back to {buyNow ? 'product' : empty ? 'store' : 'cart'}</button>
      <div className="fk-checkout-heading"><div><span>SECURE CHECKOUT {buyNow && '· BUY NOW'}</span><h1>Delivery & payment</h1><p>Review your items and tell us where to deliver them.</p></div><div className="fk-checkout-trust"><LockKeyhole size={16} /> Secure checkout <span>·</span> <ShieldCheck size={16} /> Protected payment</div></div>
      {error && <div className="fk-checkout-error" role="alert">{error}</div>}
      {empty ? <section className="fk-checkout-empty"><h2>{buyNow ? 'Buy Now item unavailable' : 'Your cart is empty'}</h2><p>{buyNow ? 'Choose an available product option and try again.' : 'Add an item before checking out.'}</p><button type="button" onClick={() => onNavigate('home')}>Browse Flatkart</button></section> :
        <form ref={formRef} className="fk-checkout-layout" onSubmit={(event) => event.preventDefault()}>
          <section className="fk-checkout-main">
            <fieldset className="fk-checkout-card fk-address-card"><legend><span>01</span> Delivery address</legend>
              {addresses.length > 0 && !manualAddress && <div className="fk-saved-address-list">{addresses.map((item) => <label key={item.id} className={`fk-payment-option ${selectedAddressId === item.id ? 'is-active' : ''}`}><input type="radio" name="saved_address" checked={selectedAddressId === item.id} onChange={() => { selectAddress(item.id); setSelectedAddressId(item.id); setAddress({ ...emptyAddress, ...item }); }} /><span><strong>{item.label}{item.is_default ? ' · Default' : ''}</strong><small>{item.recipient_name}, {item.mobile_number} · {item.locality}, {item.city} {item.pin_code}</small></span></label>)}</div>}
              {addresses.length > 0 && !manualAddress && <button type="button" className="fk-checkout-back" onClick={() => { setManualAddress(true); setSelectedAddressId(null); setEditingSavedAddressId(null); setAddress({ ...emptyAddress, recipient_name: user?.name || '', mobile_number: user?.mobile_number || '' }); }}>+ Use another address</button>}
              {(manualAddress || addresses.length === 0) && <div className="fk-checkout-fields">
                <label>Recipient name<input required name="recipient_name" autoComplete="name" maxLength={120} value={address.recipient_name} onChange={setField} /></label>
                <label>Mobile number<input required name="mobile_number" autoComplete="tel" inputMode="tel" minLength={10} maxLength={15} value={address.mobile_number} onChange={setField} /></label>
                <label className="fk-field-wide">Address line 1<input required name="address_line1" autoComplete="address-line1" maxLength={240} value={address.address_line1} onChange={setField} placeholder="House number, street, building" /></label>
                <label className="fk-field-wide">Address line 2 <span>(optional)</span><input name="address_line2" autoComplete="address-line2" maxLength={240} value={address.address_line2} onChange={setField} placeholder="Apartment, suite, floor" /></label>
                <label>Locality / landmark<input required name="locality" maxLength={120} value={address.locality} onChange={setField} /></label><label>City<input required name="city" autoComplete="address-level2" maxLength={100} value={address.city} onChange={setField} /></label>
                <label>State<input required name="state" autoComplete="address-level1" maxLength={100} value={address.state} onChange={setField} /></label><label>PIN code<input required name="pin_code" autoComplete="postal-code" inputMode="numeric" pattern="[0-9]{6}" minLength={6} maxLength={6} value={address.pin_code} onChange={(event) => { setSelectedAddressId(null); setAddress((current) => ({ ...current, pin_code: event.target.value.replace(/\D/g, '').slice(0, 6) })); }} /></label>
                {!editingSavedAddressId && <label className="fk-field-wide fk-checkbox-row"><input className="fk-compact-checkbox" type="checkbox" checked={saveAddress} onChange={(event) => setSaveAddress(event.target.checked)} /> Save this address to my Address Book</label>}
                {saveAddress && <label className="fk-field-wide fk-checkbox-row"><input className="fk-compact-checkbox" type="checkbox" checked={setDefault} onChange={(event) => setSetDefault(event.target.checked)} /> Set as default address</label>}
                {addresses.length > 0 && manualAddress && <button type="button" className="fk-checkout-back" onClick={() => { setManualAddress(false); setEditingSavedAddressId(null); setAddress({ ...emptyAddress, ...selectedAddress }); setSelectedAddressId(selectedAddress?.id || null); }}>Cancel address edit</button>}
              </div>}
              {selectedAddressId && !manualAddress && <button type="button" className="fk-checkout-back" onClick={() => { setEditingSavedAddressId(selectedAddressId); setManualAddress(true); setAddress({ ...emptyAddress, ...selectedAddress }); }}>Edit selected address</button>}
              <p className="fk-checkout-address-hint"><MapPin size={14} /> Delivery is checked against current serviceability records before an order is placed.</p>
            </fieldset>
            <fieldset className="fk-checkout-card fk-payment-card"><legend><span>02</span> Payment method</legend>
              <div className="fk-payment-options">
                {methods.cod && <label className={`fk-payment-option ${selectedMethod === 'cod' ? 'is-active' : ''}`}><input type="radio" name="payment_method" checked={selectedMethod === 'cod'} onChange={() => setSelectedMethod('cod')} /><Banknote size={20} /><span><strong>Cash on Delivery</strong><small>Pay when your order arrives</small></span></label>}
                {onlineMethods.includes('upi') && <label className={`fk-payment-option ${selectedMethod === 'upi' ? 'is-active' : ''}`}><input type="radio" name="payment_method" checked={selectedMethod === 'upi'} onChange={() => setSelectedMethod('upi')} /><Smartphone size={20} /><span><strong>UPI</strong><small>Pay securely with Razorpay</small></span></label>}
                {onlineMethods.includes('netbanking') && <label className={`fk-payment-option ${selectedMethod === 'netbanking' ? 'is-active' : ''}`}><input type="radio" name="payment_method" checked={selectedMethod === 'netbanking'} onChange={() => setSelectedMethod('netbanking')} /><Building2 size={20} /><span><strong>Net Banking</strong><small>Pay securely with Razorpay</small></span></label>}
                {!methods.cod && !onlineMethods.length && <p className="fk-checkout-no-methods">No payment method is currently available for every item in this order.</p>}
              </div>
              {selectedMethod === 'cod' && <button className="fk-checkout-submit" type="button" disabled={submitting} onClick={placeCod}>{submitting ? 'Placing order…' : 'Place order · Cash on Delivery'}</button>}
              {['upi','netbanking'].includes(selectedMethod) && <button className="fk-checkout-submit fk-checkout-online" type="button" disabled={submitting} onClick={placeOnline}>{submitting ? 'Preparing secure payment…' : `Pay ${money(viewCart.total_amount)} securely`}</button>}
              {onlineMethods.length > 0 && <p className="fk-payment-footnote"><LockKeyhole size={13} /> Razorpay handles your UPI and banking details. Flatkart never receives them.</p>}
              {(methods.cod || onlineMethods.length > 0) && <div className="fk-accepted-payments"><strong>Accepted Payment Methods</strong><span><Banknote size={16} /> Cash on Delivery</span>{onlineMethods.includes('upi') && <span><Smartphone size={16} /> UPI</span>}{onlineMethods.includes('netbanking') && <span><Building2 size={16} /> Net Banking</span>}</div>}
            </fieldset>
          </section>
          <aside className="fk-checkout-card fk-order-summary"><h2>Order summary <span>{viewCart.item_count} items</span></h2>
            <div className="fk-checkout-lines">{cartItems.map((item) => <article key={item.variant_id} className="fk-checkout-line"><img src={item.image || '/assets/cat_men_hi.jpg'} alt="" /><div><strong>{item.product_name}</strong><span>{item.variant_name} · SKU {item.sku}</span><span>{money(item.unit_price)} each</span><div className="fk-checkout-quantity"><button type="button" aria-label={`Decrease ${item.product_name} quantity`} disabled={submitting} onClick={() => mutateLine(item, -1)}><Minus size={14} /></button><span>{item.quantity}</span><button type="button" aria-label={`Increase ${item.product_name} quantity`} disabled={submitting || item.quantity >= item.available_stock} onClick={() => mutateLine(item, 1)}><Plus size={14} /></button><button type="button" aria-label={`Remove ${item.product_name}`} disabled={submitting} onClick={() => removeLine(item)}><Trash2 size={14} /></button></div></div><b>{money(item.line_total)}</b></article>)}</div>
            <div className="fk-checkout-totals"><div><span>Subtotal</span><strong>{money(viewCart.subtotal)}</strong></div><div className="fk-checkout-grand"><span>Total</span><strong>{money(viewCart.total_amount)}</strong></div></div><p className="fk-checkout-price-note">Prices are confirmed by Flatkart at checkout. No shipping fee or discount has been added.</p>
          </aside>
        </form>}
    </main>
    <Footer onNavigate={onNavigate} /><CartDrawer onNavigate={onNavigate} /><WishlistDrawer onNavigate={onNavigate} />
    <SuccessOverlay message={success.message} orderNumber={success.orderNumber} onContinue={() => onNavigate('home')} />
  </div>;
}

export default Checkout;
