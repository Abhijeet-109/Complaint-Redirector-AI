export const ROLE_DASHBOARD_PAGES = Object.freeze({
  department_handler: 'handler-dashboard',
  admin: 'admin-dashboard',
  super_admin: 'super-admin-dashboard',
});

export function isCustomerRole(role) {
  return role === 'user';
}

export function resolveAuthorizedPage(page, role, isAuthenticated) {
  const protectedPages = new Set([
    'my-complaints',
    'handler-dashboard',
    'admin-dashboard',
    'super-admin-dashboard',
  ]);

  if (!isAuthenticated) {
    return protectedPages.has(page) ? 'login' : page;
  }

  const dashboardPage = ROLE_DASHBOARD_PAGES[role];
  if (dashboardPage) {
    return page === 'login' || page === 'register' || page === dashboardPage
      ? page
      : dashboardPage;
  }

  if (isCustomerRole(role)) {
    return ['handler-dashboard', 'admin-dashboard', 'super-admin-dashboard'].includes(page)
      ? 'my-complaints'
      : page;
  }

  return 'login';
}
