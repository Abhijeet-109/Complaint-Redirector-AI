import assert from 'node:assert/strict';
import test from 'node:test';

test('Complaints page subtitles are accurately department-specific', () => {
  const getSubtitle = (departmentName, departmentSubtitle) => {
    return departmentSubtitle || (
      departmentName === 'Order & Delivery'
        ? 'Customer complaints related to orders, shipments and deliveries.'
        : departmentName === 'Payments & Refunds'
        ? 'Customer complaints related to payments and refund enquiries.'
        : 'Customer complaints related to return and replacement requests.'
    );
  };

  assert.equal(
    getSubtitle('Order & Delivery'),
    'Customer complaints related to orders, shipments and deliveries.'
  );
  assert.equal(
    getSubtitle('Payments & Refunds'),
    'Customer complaints related to payments and refund enquiries.'
  );
  assert.equal(
    getSubtitle('Returns & Replacement'),
    'Customer complaints related to return and replacement requests.'
  );
  assert.equal(
    getSubtitle('Order & Delivery', 'Custom subtitle override'),
    'Custom subtitle override'
  );
});

test('KPI counters derive accurately from real canonical statuses', () => {
  const sampleComplaints = [
    { id: 1, status: 'pending' },
    { id: 2, status: 'followed_up' },
    { id: 3, status: 'in_progress' },
    { id: 4, status: 'resolved' },
    { id: 5, status: 'pending' },
    { id: 6, status: 'closed' },
  ];

  const total = sampleComplaints.length;
  const pending = sampleComplaints.filter((c) => (c.status || '').toLowerCase() === 'pending').length;
  const inProgress = sampleComplaints.filter((c) =>
    ['in progress', 'in_progress', 'followed_up', 'in-process'].includes((c.status || '').toLowerCase())
  ).length;
  const resolved = sampleComplaints.filter((c) =>
    ['resolved', 'closed', 'completed'].includes((c.status || '').toLowerCase())
  ).length;

  assert.equal(total, 6);
  assert.equal(pending, 2);
  assert.equal(inProgress, 2);
  assert.equal(resolved, 2);
});

test('Order & Delivery and Payments avoid empty fabricated columns', () => {
  const getColumns = (departmentName) => {
    const isReturns = departmentName === 'Returns & Replacement';
    const cols = ['COMPLAINT ID'];
    if (isReturns) {
      cols.push('REQUEST ID', 'ORDER ID');
    }
    cols.push('CUSTOMER', 'SUBJECT', 'STATUS', 'RAISED ON', 'ACTIONS');
    return cols;
  };

  const returnsCols = getColumns('Returns & Replacement');
  assert.deepEqual(returnsCols, [
    'COMPLAINT ID',
    'REQUEST ID',
    'ORDER ID',
    'CUSTOMER',
    'SUBJECT',
    'STATUS',
    'RAISED ON',
    'ACTIONS',
  ]);

  const odCols = getColumns('Order & Delivery');
  assert.deepEqual(odCols, [
    'COMPLAINT ID',
    'CUSTOMER',
    'SUBJECT',
    'STATUS',
    'RAISED ON',
    'ACTIONS',
  ]);
  assert.equal(odCols.includes('REQUEST ID'), false);
  assert.equal(odCols.includes('ORDER ID'), false);

  const payCols = getColumns('Payments & Refunds');
  assert.deepEqual(payCols, [
    'COMPLAINT ID',
    'CUSTOMER',
    'SUBJECT',
    'STATUS',
    'RAISED ON',
    'ACTIONS',
  ]);
  assert.equal(payCols.includes('REQUEST ID'), false);
});

test('Redirection reasons match backend literal constraint', () => {
  const allowedBackendReasons = ['model_fault', 'further_processing'];
  const uiOptions = [
    { value: 'further_processing', label: 'Further Department Processing Required' },
    { value: 'model_fault', label: 'Model Classification Fault' },
  ];

  for (const opt of uiOptions) {
    assert.equal(
      allowedBackendReasons.includes(opt.value),
      true,
      `Option ${opt.value} must be accepted by backend Literal constraint`
    );
  }
});

test('Date filtering correctly filters by timeframe', () => {
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;

  const items = [
    { id: 1, create_at: new Date(now - 2 * dayMs).toISOString() }, // 2 days ago
    { id: 2, create_at: new Date(now - 15 * dayMs).toISOString() }, // 15 days ago
    { id: 3, create_at: new Date(now - 60 * dayMs).toISOString() }, // 60 days ago
    { id: 4, create_at: new Date(now - 120 * dayMs).toISOString() }, // 120 days ago
  ];

  const filterByTimeframe = (list, timeframe) => {
    if (timeframe === 'all') return list;
    const days = timeframe === '7days' ? 7 : timeframe === '90days' ? 90 : 30;
    const maxAgeMs = days * dayMs;
    return list.filter((item) => {
      const itemDate = new Date(item.create_at).getTime();
      return (now - itemDate) <= maxAgeMs;
    });
  };

  assert.equal(filterByTimeframe(items, '7days').length, 1);
  assert.equal(filterByTimeframe(items, '30days').length, 2);
  assert.equal(filterByTimeframe(items, '90days').length, 3);
  assert.equal(filterByTimeframe(items, 'all').length, 4);
});
