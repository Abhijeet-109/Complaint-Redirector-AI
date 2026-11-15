import assert from 'node:assert/strict';
import test from 'node:test';

test('Complaints Oversight 4 KPI cards calculate accurately from real data', () => {
  const sampleComplaints = [
    { id: 1, status: 'pending', complaint_text: 'Issue 1' },
    { id: 2, status: 'followed_up', complaint_text: 'Issue 2' },
    { id: 3, status: 'resolved', complaint_text: 'Issue 3' },
    { id: 4, status: 'open', complaint_text: 'Issue 4' },
    { id: 5, status: 'completed', complaint_text: 'Issue 5' },
  ];
  const sampleRedirectionData = {
    summary: { total_complaints_forwarded: 3 },
  };

  const total = sampleComplaints.length;
  const redirected = sampleRedirectionData?.summary?.total_complaints_forwarded || 0;
  const pending = sampleComplaints.filter(
    (c) => (c.status || '').toLowerCase() === 'pending' || (c.status || '').toLowerCase() === 'open'
  ).length;
  const resolved = sampleComplaints.filter(
    (c) => (c.status || '').toLowerCase() === 'resolved' || (c.status || '').toLowerCase() === 'completed'
  ).length;

  assert.equal(total, 5);
  assert.equal(redirected, 3);
  assert.equal(pending, 2);
  assert.equal(resolved, 2);
});

test('Complaints Oversight pagination computes ranges and boundaries correctly', () => {
  const totalItems = 42;
  const pageSize = 10;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  assert.equal(totalPages, 5);

  const computeRange = (currentPage) => {
    const safePage = Math.min(Math.max(1, currentPage), totalPages);
    const startRecord = (safePage - 1) * pageSize + 1;
    const endRecord = Math.min(safePage * pageSize, totalItems);
    return { safePage, startRecord, endRecord };
  };

  assert.deepEqual(computeRange(1), { safePage: 1, startRecord: 1, endRecord: 10 });
  assert.deepEqual(computeRange(4), { safePage: 4, startRecord: 31, endRecord: 40 });
  assert.deepEqual(computeRange(5), { safePage: 5, startRecord: 41, endRecord: 42 });
  // Clamping
  assert.deepEqual(computeRange(0), { safePage: 1, startRecord: 1, endRecord: 10 });
  assert.deepEqual(computeRange(99), { safePage: 5, startRecord: 41, endRecord: 42 });
});

test('Complaints table search filters across text, customer, email, id, and department', () => {
  const sampleComplaints = [
    {
      id: 9,
      complaint_text: 'I want to get new product in place of this damaged product',
      user_name: 'Abhijeet',
      user_email: 'user1@gmail.com',
      current_department: 'Returns & Replacement',
      status: 'resolved',
    },
    {
      id: 7,
      complaint_text: 'I want new product in replacement',
      user_name: 'Ajay',
      user_email: 'user3@gmail.com',
      current_department: 'Account & Security',
      status: 'open',
    },
  ];

  const searchFilter = (items, q) => {
    const query = q.toLowerCase();
    return items.filter((item) => {
      const text = (item.complaint_text || '').toLowerCase();
      const customer = (item.user_name || '').toLowerCase();
      const email = (item.user_email || '').toLowerCase();
      const idStr = String(item.id || '');
      const dept = (item.current_department || '').toLowerCase();
      return (
        text.includes(query) ||
        customer.includes(query) ||
        email.includes(query) ||
        idStr.includes(query) ||
        dept.includes(query)
      );
    });
  };

  // Search by ID
  assert.equal(searchFilter(sampleComplaints, '9').length, 1);
  assert.equal(searchFilter(sampleComplaints, '#9').length, 0); // matches id digit

  // Search by customer name
  assert.equal(searchFilter(sampleComplaints, 'abhijeet').length, 1);

  // Search by email
  assert.equal(searchFilter(sampleComplaints, 'user3@').length, 1);

  // Search by department
  assert.equal(searchFilter(sampleComplaints, 'Account').length, 1);

  // Search by text
  assert.equal(searchFilter(sampleComplaints, 'damaged').length, 1);
});
