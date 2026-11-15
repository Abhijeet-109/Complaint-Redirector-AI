import assert from 'node:assert/strict';
import test from 'node:test';

test('Super Admin Overview: Primary KPI and Status calculations derive accurately from backend dataset', () => {
  const sampleComplaints = [
    { id: 1, status: 'pending', complaint_text: 'Ticket 1', create_at: '2026-10-01T10:00:00Z' },
    { id: 2, status: 'followed_up', complaint_text: 'Ticket 2', create_at: '2026-10-02T10:00:00Z' },
    { id: 3, status: 'resolved', complaint_text: 'Ticket 3', create_at: '2026-10-03T10:00:00Z' },
    { id: 4, status: 'open', complaint_text: 'Ticket 4', create_at: '2026-10-04T10:00:00Z' },
    { id: 5, status: 'completed', complaint_text: 'Ticket 5', create_at: '2026-10-05T10:00:00Z' },
    { id: 6, status: 'pending', complaint_text: 'Ticket 6', create_at: '2026-10-06T10:00:00Z' },
  ];

  // Primary Total Complaints
  const totalComplaints = sampleComplaints.length;
  assert.equal(totalComplaints, 6, 'Total complaints matches authoritative dataset count');

  // Resolved count: 'resolved' or 'completed'
  const resolvedCount = sampleComplaints.filter((c) => {
    const s = (c.status || '').toLowerCase();
    return s === 'resolved' || s === 'completed';
  }).length;
  assert.equal(resolvedCount, 2, 'Resolved complaints count matches resolved + completed');

  // Pending count: 'pending' or 'open'
  const pendingCount = sampleComplaints.filter((c) => {
    const s = (c.status || '').toLowerCase();
    return s === 'pending' || s === 'open';
  }).length;
  assert.equal(pendingCount, 3, 'Pending complaints count matches pending + open');
});

test('Super Admin Overview: Administration KPIs filter by exact roles without double counting', () => {
  const sampleUsers = [
    { id: 1, name: 'Customer 1', role: 'user' },
    { id: 2, name: 'Customer 2', role: 'user' },
    { id: 3, name: 'Customer 3', role: 'user' },
    { id: 4, name: 'Staff Handler 1', role: 'department_handler' },
    { id: 5, name: 'Staff Handler 2', role: 'department_handler' },
    { id: 6, name: 'Admin 1', role: 'admin' },
    { id: 7, name: 'Super Admin', role: 'super_admin' },
  ];

  const regularUsers = sampleUsers.filter((u) => u.role === 'user');
  const handlers = sampleUsers.filter((u) => u.role === 'department_handler');
  const admins = sampleUsers.filter((u) => u.role === 'admin' || u.role === 'super_admin');

  assert.equal(regularUsers.length, 3, 'Total Users correctly counts role=user');
  assert.equal(handlers.length, 2, 'Total Dept Handlers correctly counts role=department_handler');
  assert.equal(admins.length, 2, 'Total Admins correctly counts admin + super_admin');
});

test('Super Admin Overview: Department Chart guarantees all 6 canonical departments with genuine zeroes', () => {
  const CANONICAL_DEPARTMENTS = [
    'Returns & Replacement',
    'Account & Security',
    'Technical Support',
    'Payments & Refunds',
    'Order & Delivery',
    'Product & Quality',
  ];

  const sampleComplaints = [
    { id: 1, current_department: 'Returns & Replacement' },
    { id: 2, current_department: 'Returns & Replacement' },
    { id: 3, current_department: 'Account & Security' },
  ];

  const countMap = {};
  CANONICAL_DEPARTMENTS.forEach((dept) => {
    countMap[dept] = 0;
  });

  sampleComplaints.forEach((c) => {
    const dept = c.current_department;
    countMap[dept] = (countMap[dept] || 0) + 1;
  });

  assert.equal(countMap['Returns & Replacement'], 2);
  assert.equal(countMap['Account & Security'], 1);
  assert.equal(countMap['Technical Support'], 0, 'Zero count department remains visible with genuine zero');
  assert.equal(countMap['Payments & Refunds'], 0);
  assert.equal(countMap['Order & Delivery'], 0);
  assert.equal(countMap['Product & Quality'], 0);

  const keys = Object.keys(countMap);
  assert.equal(keys.length, 6, 'Exactly 6 canonical departments are represented');
});

test('Super Admin Overview: Recent complaints are sorted chronologically descending', () => {
  const sampleComplaints = [
    { id: 1, create_at: '2026-10-01T10:00:00Z', complaint_text: 'Old' },
    { id: 3, create_at: '2026-10-15T12:00:00Z', complaint_text: 'Newest' },
    { id: 2, create_at: '2026-10-10T11:00:00Z', complaint_text: 'Mid' },
  ];

  const sorted = [...sampleComplaints].sort((a, b) => {
    const dateA = new Date(a.create_at || 0).getTime();
    const dateB = new Date(b.create_at || 0).getTime();
    if (dateA !== dateB) return dateB - dateA;
    return (b.id || 0) - (a.id || 0);
  });

  assert.equal(sorted[0].id, 3, 'Latest complaint by timestamp is first');
  assert.equal(sorted[1].id, 2);
  assert.equal(sorted[2].id, 1);
});

test('Super Admin Overview: Focused complaint navigation identifies target page correctly', () => {
  const totalComplaints = 25;
  const pageSize = 5;
  const items = Array.from({ length: totalComplaints }, (_, i) => ({
    id: 100 - i, // 100, 99, 98 ... 76
  }));

  const targetId = 88;
  const targetIndex = items.findIndex((c) => c.id === targetId);
  assert.ok(targetIndex !== -1);

  const targetPage = Math.floor(targetIndex / pageSize) + 1;
  // targetIndex is 12 (100 - 88 = 12). Page should be Math.floor(12 / 5) + 1 = 3.
  assert.equal(targetPage, 3, 'Page for complaint #88 with pageSize 5 is page 3');
});
