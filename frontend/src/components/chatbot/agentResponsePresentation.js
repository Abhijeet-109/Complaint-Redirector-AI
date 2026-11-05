const AGENTS = new Set(['product', 'cart', 'order', 'shipping', 'returns', 'knowledge', 'support', 'guardrail']);
const STRUCTURED_TYPES = new Set([
  'product_list', 'product_details', 'product_comparison', 'cart_summary', 'cart_update',
  'order_list', 'order_details', 'order_status', 'shipment_list', 'shipment_details',
  'return_request_list',
]);

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function isMoney(value) {
  if (isNumber(value)) return true;
  return typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value));
}

function isProduct(value) {
  return isRecord(value)
    && (value.name === null || value.name === undefined || typeof value.name === 'string')
    && (value.brand === null || value.brand === undefined || typeof value.brand === 'string')
    && Array.isArray(value.variants)
    && value.variants.every((variant) => isRecord(variant));
}

function isOrder(value, requireItems = false) {
  return isRecord(value)
    && typeof value.order_number === 'string'
    && (value.status === null || value.status === undefined || typeof value.status === 'string')
    && (!requireItems || Array.isArray(value.items));
}

function isShipment(value) {
  return isRecord(value)
    && typeof value.order_number === 'string'
    && typeof value.shipment_available === 'boolean';
}

function isReturnRequest(value) {
  return isRecord(value)
    && isNumber(value.return_request_id)
    && isNumber(value.quantity);
}

export function isValidStructuredResponse(response) {
  if (!isRecord(response)
    || response.schema_version !== 1
    || !AGENTS.has(response.agent)
    || typeof response.answer !== 'string') return false;

  if (response.response_type === 'text') return response.data === null;
  if (!STRUCTURED_TYPES.has(response.response_type) || !isRecord(response.data)) return false;

  const { data, response_type: type } = response;
  if (type === 'product_list' || type === 'product_comparison') {
    return Array.isArray(data.products) && data.products.every(isProduct);
  }
  if (type === 'product_details') return isProduct(data.product);
  if (type === 'cart_summary' || type === 'cart_update') {
    return Array.isArray(data.items)
      && data.items.every((item) => isRecord(item)
        && Number.isInteger(item.quantity)
        && (typeof item.product_name === 'string' || typeof item.variant_name === 'string')
        && isMoney(item.unit_price)
        && isMoney(item.line_total))
      && Number.isInteger(data.item_count)
      && isMoney(data.total);
  }
  if (type === 'order_list') return Array.isArray(data.orders) && data.orders.every((order) => isOrder(order));
  if (type === 'order_details') return isOrder(data.order, true);
  if (type === 'order_status') return typeof data.order_number === 'string' && typeof data.status === 'string';
  if (type === 'shipment_list') return Array.isArray(data.shipments) && data.shipments.every(isShipment);
  if (type === 'shipment_details') return isShipment(data.shipment);
  if (type === 'return_request_list') {
    return Array.isArray(data.return_requests) && data.return_requests.every(isReturnRequest);
  }
  return false;
}

export function getStructuredResponseSummary(response) {
  if (!isValidStructuredResponse(response) || response.response_type === 'text') return null;
  const { data } = response;
  switch (response.response_type) {
    case 'product_list': {
      const count = data.products.length;
      return count ? `I found ${count} matching product${count === 1 ? '' : 's'}.` : "I couldn't find any matching products.";
    }
    case 'product_details': return 'Here are the requested product details.';
    case 'product_comparison': return data.products.length ? 'Here is the product comparison.' : 'There are no matching products to compare.';
    case 'cart_summary': return data.items.length ? 'Here is your current cart.' : 'Your cart is empty.';
    case 'cart_update': return 'Your cart has been updated.';
    case 'order_list': return data.orders.length ? `Here are your ${data.orders.length} recent orders.` : "You don't have any recent orders.";
    case 'order_details': return 'Here are your order details.';
    case 'order_status': return 'Here is your order status.';
    case 'shipment_list': return data.shipments.length
      ? `Here is shipment information for ${data.shipments.length} order${data.shipments.length === 1 ? '' : 's'}.`
      : 'No shipment information was found.';
    case 'shipment_details': return 'Here are your shipment details.';
    case 'return_request_list': return data.return_requests.length
      ? `Here are your ${data.return_requests.length} existing return requests.`
      : "You don't have any existing return requests.";
    default: return null;
  }
}
