import React from 'react';
import { Banknote, Building2, Smartphone } from 'lucide-react';

const options = {
  cod: { label: 'Cash on Delivery', Icon: Banknote },
  upi: { label: 'UPI', Icon: Smartphone },
  netbanking: { label: 'Net Banking', Icon: Building2 },
};

export function PaymentMethodShowcase({ methods = [] }) {
  const available = methods.map((method) => options[method]).filter(Boolean);
  if (!available.length) return <p>Payment options will be confirmed at checkout.</p>;
  return <div className="fk-product-payment-methods">{available.map(({ label, Icon }) => <span className="fk-product-payment-method" key={label}><Icon size={17} aria-hidden="true" /><span>{label}</span></span>)}</div>;
}
