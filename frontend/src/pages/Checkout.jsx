import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, CheckCircle2, LockKeyhole, ShieldCheck } from 'lucide-react';
import { Header } from '../components/layout/Header';
import { Footer } from '../components/layout/Footer';
import { CartDrawer } from '../components/common/CartDrawer';
import { WishlistDrawer } from '../components/common/WishlistDrawer';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { productService } from '../services/productService';

const money = (value) => `₹${Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const emptyAddress = { recipient_name: '', mobile_number: '', address_line1: '', address_line2: '', locality: '', city: '', state: '', pin_code: '' };
const keyFor = (method) => {
  const key = `flatkart_checkout_${method}_idempotency`;
  let value = sessionStorage.getItem(key);
  if (!value) {
    value = globalThis.crypto?.randomUUID?.() || `fk-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    sessionStorage.setItem(key, value);
  }
  return value;
};

let razorpayScriptPromise;
function loadRazorpay() {
  if (window.Razorpay) return Promise.resolve();
  if (!razorpayScriptPromise) {
    razorpayScriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => { razorpayScriptPromise = null; reject(new Error('Razorpay Checkout could not be loaded. Check your connection and try again.')); };
      document.body.appendChild(script);
    });
  }
  return razorpayScriptPromise;
}

function SuccessOverlay({ message, orderNumber, onContinue }) {
  if (!message) return null;
  return <div className="fk-checkout-success-scrim" role="status" aria-live="assertive">
    <section className="fk-checkout-success-card">
      <CheckCircle2 size={48} aria-hidden="true" />
      <h2>{message}</h2>
      {orderNumber && <p>Order reference: <strong>{orderNumber}</strong></p>}
      {message === 'Order Placed Successfully' || message === 'Order Successfully placed'
        ? <button type="button" onClick={onContinue}>Continue shopping</button>
        : <p className="fk-checkout-success-detail">Confirming your order…</p>}
    </section>
  </div>;
}

export function Checkout({ onNavigate }) {
  const { user } = useAuth();
  const { cart, cartItems, refreshCart, setIsCartOpen } = useCart();
  const [address, setAddress] = useState({ ...emptyAddress, recipient_name: user?.name || '' });
  const [submitting, setSubmitting] = useState(false);
  const [activeMethod, setActiveMethod] = useState('');
  const [selectedMethod, setSelectedMethod] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState({ message: '', orderNumber: '' });
  const formRef = useRef(null);

  useEffect(() => { refreshCart(); }, [refreshCart]);
  useEffect(() => { if (!address.recipient_name && user?.name) setAddress((current) => ({ ...current, recipient_name: user.name })); }, [user?.name]);
  useEffect(() => {
    if (cart.payment_methods?.cod) setSelectedMethod('cod');
    else if (cart.payment_methods?.online) setSelectedMethod('online');
  }, [cart.payment_methods?.cod, cart.payment_methods?.online]);

  const setField = (event) => setAddress((current) => ({ ...current, [event.target.name]: event.target.value }));
  const normalizedAddress = () => ({ ...address, address_line2: address.address_line2.trim() || null });

  const placeCod = async () => {
    if (!formRef.current?.reportValidity()) return;
    setSubmitting(true); setActiveMethod('cod'); setError('');
    try {
      const result = await productService.placeCodOrder(normalizedAddress(), keyFor('cod'));
      sessionStorage.removeItem('flatkart_checkout_cod_idempotency');
      await refreshCart();
      setSuccess({ message: 'Order Placed Successfully', orderNumber: result.order.order_number });
    } catch (cause) { setError(cause.message || 'Your order could not be placed. Please try again.'); }
    finally { setSubmitting(false); setActiveMethod(''); }
  };

  const placeOnline = async () => {
    if (!formRef.current?.reportValidity()) return;
    setSubmitting(true); setActiveMethod('online'); setError('');
    let checkout = null;
    let paymentAttemptId = null;
    try {
      const paymentOrder = await productService.createRazorpayCheckout(normalizedAddress(), keyFor('online'));
      paymentAttemptId = paymentOrder.attempt_id;
      if (paymentOrder.completed && paymentOrder.order?.payment_status === 'captured') {
        sessionStorage.removeItem('flatkart_checkout_online_idempotency');
        await refreshCart();
        setSuccess({ message: 'Payment success', orderNumber: paymentOrder.order.order_number });
        window.setTimeout(() => setSuccess({ message: 'Order Successfully placed', orderNumber: paymentOrder.order.order_number }), 1300);
        return;
      }
      const allowedMethods = cart.payment_methods?.online_methods || [];
      if (!allowedMethods.length) throw new Error('No online payment method is available for this cart.');
      await loadRazorpay();
      const response = await new Promise((resolve, reject) => {
        const modal = new window.Razorpay({
          key: paymentOrder.key_id,
          amount: paymentOrder.amount,
          currency: paymentOrder.currency,
          name: 'Flatkart',
          description: `Order ${paymentOrder.local_order_reference}`,
          order_id: paymentOrder.razorpay_order_id,
          config: {
            display: {
              blocks: {
                flatkart: {
                  name: 'Pay with',
                  instruments: allowedMethods.map((method) => ({ method })),
                },
              },
              sequence: ['block.flatkart'],
              preferences: { show_default_blocks: false },
            },
          },
          prefill: { name: address.recipient_name, email: user?.email || '' },
          theme: { color: '#122D29' },
          handler: (value) => resolve(value),
          modal: { ondismiss: () => reject(new Error('Payment cancelled. You can try again.')) },
        });
        modal.on('payment.failed', (event) => reject(new Error(event.error?.description || 'Payment failed. Please try again.')));
        modal.open();
      });
      setSubmitting(true);
      const verified = await productService.verifyRazorpayPayment({
        razorpay_order_id: response.razorpay_order_id,
        razorpay_payment_id: response.razorpay_payment_id,
        razorpay_signature: response.razorpay_signature,
      });
      if (!verified.success || verified.order?.payment_status !== 'captured' || verified.order?.status !== 'placed') {
        throw new Error('Payment verification is still pending. Your cart is unchanged; check the payment status before retrying.');
      }
      sessionStorage.removeItem('flatkart_checkout_online_idempotency');
      await refreshCart();
      checkout = verified.order;
      setSuccess({ message: 'Payment success', orderNumber: checkout.order_number });
      window.setTimeout(() => setSuccess({ message: 'Order Successfully placed', orderNumber: checkout.order_number }), 1300);
    } catch (cause) {
      if (cause.message?.toLowerCase().includes('cancel') || cause.message?.toLowerCase().includes('failed')) {
        let cancellationConfirmed = !paymentAttemptId;
        if (paymentAttemptId) {
          try {
            const result = await productService.cancelRazorpayAttempt(paymentAttemptId);
            cancellationConfirmed = ['cancelled', 'failed', 'expired'].includes(result.status);
          } catch { cancellationConfirmed = false; }
        }
        if (cancellationConfirmed) sessionStorage.removeItem('flatkart_checkout_online_idempotency');
      }
      setError(cause.message || 'Payment could not be verified. Your cart is unchanged.');
    } finally { setSubmitting(false); setActiveMethod(''); }
  };

  const methods = cart.payment_methods || { cod: false, online: false };
  const empty = cartItems.length === 0;

  return <div className="fk-page-container">
    <Header onNavigate={onNavigate} onSelectProduct={(item) => onNavigate('product', item.slug)} />
    <main className="fk-checkout-page">
      <button type="button" className="fk-checkout-back" onClick={() => { if (!empty) setIsCartOpen(true); else onNavigate('home'); }}><ArrowLeft size={17} /> Back to {empty ? 'store' : 'cart'}</button>
      <div className="fk-checkout-heading"><div><span>SECURE CHECKOUT</span><h1>Delivery & payment</h1><p>Review your items and tell us where to deliver them.</p></div><div className="fk-checkout-trust"><LockKeyhole size={16} /> Secure checkout <span>·</span> <ShieldCheck size={16} /> Protected payment</div></div>
      {error && <div className="fk-checkout-error" role="alert">{error}</div>}
      {empty ? <section className="fk-checkout-empty"><h2>Your cart is empty</h2><p>Add an item before checking out.</p><button type="button" onClick={() => onNavigate('home')}>Browse Flatkart</button></section> :
        <form ref={formRef} className="fk-checkout-layout" onSubmit={(event) => event.preventDefault()}>
          <section className="fk-checkout-main">
            <fieldset className="fk-checkout-card fk-address-card">
              <legend><span>01</span> Delivery address</legend>
              <div className="fk-checkout-fields">
                <label>Recipient name<input required name="recipient_name" autoComplete="name" maxLength={120} value={address.recipient_name} onChange={setField} /></label>
                <label>Mobile number<input required name="mobile_number" autoComplete="tel" inputMode="tel" minLength={10} maxLength={15} value={address.mobile_number} onChange={setField} /></label>
                <label className="fk-field-wide">Address line 1<input required name="address_line1" autoComplete="address-line1" maxLength={240} value={address.address_line1} onChange={setField} placeholder="House number, street, building" /></label>
                <label className="fk-field-wide">Address line 2 <span>(optional)</span><input name="address_line2" autoComplete="address-line2" maxLength={240} value={address.address_line2} onChange={setField} placeholder="Apartment, suite, floor" /></label>
                <label>Locality / landmark<input required name="locality" maxLength={120} value={address.locality} onChange={setField} /></label>
                <label>City<input required name="city" autoComplete="address-level2" maxLength={100} value={address.city} onChange={setField} /></label>
                <label>State<input required name="state" autoComplete="address-level1" maxLength={100} value={address.state} onChange={setField} /></label>
                <label>PIN code<input required name="pin_code" autoComplete="postal-code" inputMode="numeric" pattern="[0-9]{6}" minLength={6} maxLength={6} value={address.pin_code} onChange={(event) => setAddress((current) => ({ ...current, pin_code: event.target.value.replace(/\D/g, '').slice(0, 6) }))} /></label>
              </div>
            </fieldset>
            <fieldset className="fk-checkout-card fk-payment-card">
              <legend><span>02</span> Payment method</legend>
              <div className="fk-payment-options">
                {methods.cod && <label className={`fk-payment-option ${selectedMethod === 'cod' ? 'is-active' : ''}`}><input type="radio" name="payment_method" checked={selectedMethod === 'cod'} onChange={() => setSelectedMethod('cod')} /><span><strong>Cash on Delivery</strong><small>Pay when your order arrives</small></span></label>}
                {methods.online && <label className={`fk-payment-option ${selectedMethod === 'online' ? 'is-active' : ''}`}><input type="radio" name="payment_method" checked={selectedMethod === 'online'} onChange={() => setSelectedMethod('online')} /><span><strong>Pay online with Razorpay</strong><small>UPI or Net Banking · Test Mode</small></span></label>}
                {!methods.cod && !methods.online && <p className="fk-checkout-no-methods">No payment method is currently available for every item in this cart. Please return to your cart or contact support.</p>}
              </div>
              {selectedMethod === 'cod' && <button className="fk-checkout-submit" type="button" disabled={submitting} onClick={placeCod}>{submitting && activeMethod === 'cod' ? 'Placing order…' : 'Place order · Cash on Delivery'}</button>}
              {selectedMethod === 'online' && <button className="fk-checkout-submit fk-checkout-online" type="button" disabled={submitting} onClick={placeOnline}>{submitting && activeMethod === 'online' ? 'Preparing secure payment…' : `Pay ${money(cart.total_amount)} securely`}</button>}
              {methods.online && <p className="fk-payment-footnote"><LockKeyhole size={13} /> Your UPI and banking details are handled by Razorpay. Flatkart never receives them.</p>}
            </fieldset>
          </section>
          <aside className="fk-checkout-card fk-order-summary">
            <h2>Order summary <span>{cart.item_count} items</span></h2>
            <div className="fk-checkout-lines">{cartItems.map((item) => <article key={item.variant_id} className="fk-checkout-line"><img src={item.image || '/assets/cat_men_hi.jpg'} alt="" /><div><strong>{item.product_name}</strong><span>{item.variant_name} · SKU {item.sku}</span><span>Qty {item.quantity} × {money(item.unit_price)}</span></div><b>{money(item.line_total)}</b></article>)}</div>
            <div className="fk-checkout-totals"><div><span>Subtotal</span><strong>{money(cart.subtotal)}</strong></div><div className="fk-checkout-grand"><span>Total</span><strong>{money(cart.total_amount)}</strong></div></div>
            <p className="fk-checkout-price-note">Prices are confirmed by Flatkart at checkout. No shipping fee or discount has been added.</p>
          </aside>
        </form>}
    </main>
    <Footer onNavigate={onNavigate} />
    <CartDrawer onNavigate={onNavigate} />
    <WishlistDrawer onNavigate={onNavigate} />
    <SuccessOverlay message={success.message} orderNumber={success.orderNumber} onContinue={() => onNavigate('home')} />
  </div>;
}

export default Checkout;
