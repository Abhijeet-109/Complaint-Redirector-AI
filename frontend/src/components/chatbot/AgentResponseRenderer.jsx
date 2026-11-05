import React from 'react';
import './AgentResponseRenderer.css';

function present(value, fallback = 'Not available') {
  return value === null || value === undefined || value === '' ? fallback : value;
}

function price(value) {
  if (value === null || value === undefined || value === '') return 'Not available';
  const amount = Number(value);
  return Number.isFinite(amount)
    ? new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(amount)
    : 'Not available';
}

function date(value) {
  if (!value) return 'Not available';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 'Not available' : parsed.toLocaleDateString('en-IN');
}

function Field({ label, value }) {
  if (value === null || value === undefined || value === '') return null;
  return <div className="fk-agent-response-field"><span>{label}</span><strong>{value}</strong></div>;
}

function ProductCard({ product }) {
  return (
    <article className="fk-agent-product-card">
      <h4>{present(product?.name, 'Product')}</h4>
      <Field label="Brand" value={product?.brand} />
      {product?.description && <p className="fk-agent-product-description">{product.description}</p>}
      {Array.isArray(product?.variants) && product.variants.map((variant, index) => (
        <div className="fk-agent-variant" key={`${variant?.sku || variant?.name || 'variant'}-${index}`}>
          <Field label="Variant" value={variant?.name} />
          <Field label="Price" value={price(variant?.price)} />
          <Field label="Availability" value={variant?.is_available === true ? 'Available' : variant?.is_available === false ? 'Unavailable' : null} />
          <Field label="Stock" value={variant?.stock_status} />
        </div>
      ))}
    </article>
  );
}

function OrderCard({ order, details = false }) {
  return (
    <article className="fk-agent-record-card">
      <div className="fk-agent-record-heading"><strong>Order {present(order?.order_number)}</strong><span>{present(order?.status)}</span></div>
      <div className="fk-agent-response-grid">
        <Field label="Date" value={date(order?.order_date)} />
        <Field label="Total" value={price(order?.total_amount)} />
      </div>
      {details && Array.isArray(order?.items) && order.items.length > 0 && (
        <div className="fk-agent-items">
          {order.items.map((item, index) => (
            <div className="fk-agent-item-row" key={`${item?.sku || item?.product || 'item'}-${index}`}>
              <span>{present(item?.product, 'Item')}{item?.variant ? ` · ${item.variant}` : ''}</span>
              <span>Qty {present(item?.quantity, '—')} · {price(item?.line_total ?? item?.unit_price)}</span>
            </div>
          ))}
        </div>
      )}
    </article>
  );
}

function ShipmentCard({ shipment }) {
  return (
    <article className="fk-agent-record-card">
      <div className="fk-agent-record-heading"><strong>Order {present(shipment?.order_number)}</strong><span>{shipment?.shipment_available ? present(shipment?.status) : 'Shipment information unavailable'}</span></div>
      {shipment?.shipment_available && <div className="fk-agent-response-grid">
        <Field label="Tracking reference" value={shipment?.tracking_reference} />
        <Field label="Shipped" value={date(shipment?.shipped_at)} />
        <Field label="Delivered" value={date(shipment?.delivered_at)} />
      </div>}
    </article>
  );
}

function ReturnCard({ request }) {
  return (
    <article className="fk-agent-record-card">
      <div className="fk-agent-record-heading"><strong>Order {present(request?.order_number)}</strong><span>{present(request?.status)}</span></div>
      <div className="fk-agent-response-grid">
        <Field label="Product" value={request?.product_name} />
        <Field label="Variant" value={request?.variant_name} />
        <Field label="Quantity" value={request?.quantity} />
        <Field label="Reason" value={request?.reason} />
      </div>
    </article>
  );
}

export function AgentResponseRenderer({ response }) {
  if (!response || typeof response !== 'object' || typeof response.response_type !== 'string') return null;
  const { response_type: type, data } = response;
  if (!data || typeof data !== 'object') return null;

  let content = null;
  if (type === 'product_list' || type === 'product_comparison') {
    const products = Array.isArray(data.products) ? data.products : [];
    if (products.length) content = <div className={`fk-agent-product-list ${type === 'product_comparison' ? 'comparison' : ''}`}>{products.map((product, index) => <ProductCard key={`${product?.name || 'product'}-${index}`} product={product} />)}</div>;
  } else if (type === 'product_details' && data.product) {
    content = <ProductCard product={data.product} />;
  } else if (type === 'cart_summary' || type === 'cart_update') {
    const items = Array.isArray(data.items) ? data.items : [];
    content = <article className="fk-agent-record-card fk-agent-cart-card">
      <div className="fk-agent-record-heading"><strong>{type === 'cart_update' ? 'Cart updated' : 'Your cart'}</strong></div>
      {items.length ? <div className="fk-agent-items">{items.map((item, index) => <div className="fk-agent-item-row" key={`${item?.product_name || 'item'}-${index}`}><span>{present(item?.product_name, 'Product')}{item?.variant_name ? ` · ${item.variant_name}` : ''}<small>Qty {present(item?.quantity, '—')} · {price(item?.unit_price)} each</small></span><strong>{price(item?.line_total)}</strong></div>)}</div> : <p>Your cart is empty.</p>}
      <div className="fk-agent-cart-total"><span>Total</span><strong>{price(data.total)}</strong></div>
    </article>;
  } else if (type === 'order_list' && Array.isArray(data.orders)) {
    if (data.orders.length) content = <div className="fk-agent-record-list">{data.orders.map((order, index) => <OrderCard key={`${order?.order_number || 'order'}-${index}`} order={order} />)}</div>;
  } else if (type === 'order_details' && data.order) {
    content = <OrderCard order={data.order} details />;
  } else if (type === 'order_status') {
    content = <OrderCard order={data} />;
  } else if (type === 'shipment_list' && Array.isArray(data.shipments)) {
    if (data.shipments.length) content = <div className="fk-agent-record-list">{data.shipments.map((shipment, index) => <ShipmentCard key={`${shipment?.order_number || 'shipment'}-${index}`} shipment={shipment} />)}</div>;
  } else if (type === 'shipment_details' && data.shipment) {
    content = <ShipmentCard shipment={data.shipment} />;
  } else if (type === 'return_request_list' && Array.isArray(data.return_requests)) {
    if (data.return_requests.length) content = <div className="fk-agent-record-list">{data.return_requests.map((request, index) => <ReturnCard key={`${request?.return_request_id || 'return'}-${index}`} request={request} />)}</div>;
  }

  return content ? <div className="fk-agent-response-data">{content}</div> : null;
}

export default AgentResponseRenderer;
