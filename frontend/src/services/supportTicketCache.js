import { complaintService } from './complaintService';

const cache = new Map();
const inFlight = new Map();
const TTL = 30_000;

export function getSupportTickets(ownerId, { refresh = false } = {}) {
  if (ownerId == null) return Promise.resolve([]);
  const key = String(ownerId);
  const saved = cache.get(key);
  if (!refresh && saved && Date.now() - saved.time < TTL) return Promise.resolve(saved.value);
  if (!refresh && inFlight.has(key)) return inFlight.get(key);
  const request = complaintService.getMyComplaints().then((value) => {
    const records = Array.isArray(value) ? value : [];
    cache.set(key, { time: Date.now(), value: records });
    return records;
  }).finally(() => inFlight.delete(key));
  inFlight.set(key, request);
  return request;
}
