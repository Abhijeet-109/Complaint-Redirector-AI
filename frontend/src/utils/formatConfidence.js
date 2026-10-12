export function formatConfidence(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0 || numeric > 100) return null;
  const percentage = numeric <= 1 ? numeric * 100 : numeric;
  return `${Math.round(percentage)}% confidence`;
}
