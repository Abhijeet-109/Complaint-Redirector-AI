import { accountService } from './accountService';

const cache = new Map();
const inFlight = new Map();
const TTL = 15_000;

export function getAddressesForUser(ownerId, { refresh = false } = {}) {
  if (ownerId == null) return Promise.resolve([]);
  const key = String(ownerId);
  const cached = cache.get(key);
  if (!refresh && cached && Date.now() - cached.time < TTL) return Promise.resolve(cached.value);
  if (!refresh && inFlight.has(key)) return inFlight.get(key);
  let request;
  request = accountService.addresses().then((value) => {
    const addresses = Array.isArray(value) ? value : [];
    cache.set(key, { time: Date.now(), value: addresses });
    return addresses;
  }).finally(() => {
    if (inFlight.get(key) === request) inFlight.delete(key);
  });
  inFlight.set(key, request);
  return request;
}
