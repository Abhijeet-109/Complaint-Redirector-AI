import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { handlerService } from '../../services/handlerService';
import { HandlerLayout } from '../handler/HandlerLayout';
import { HandlerOverviewView } from '../handler/HandlerOverviewView';
import { HandlerReviewQueueView } from '../handler/HandlerReviewQueueView';
import { HandlerRequestsView } from '../handler/HandlerRequestsView';
import { HandlerComplaintsView } from '../handler/HandlerComplaintsView';
import { HandlerTrackingView } from '../handler/HandlerTrackingView';
import { HandlerHistoryView } from '../handler/HandlerHistoryView';
import { HandlerReportsView } from '../handler/HandlerReportsView';
import { HandlerRequestDetailView } from '../handler/HandlerRequestDetailView';
import { HandlerComplaintDetailView } from '../handler/HandlerComplaintDetailView';
import { HandlerHandoffDetailView } from '../handler/HandlerHandoffDetailView';
import { HandlerOrderDeliveryView } from '../handler/HandlerOrderDeliveryView';
import { ODOverviewView } from '../handler/order_delivery/ODOverviewView';
import { ODOrderManagementView } from '../handler/order_delivery/ODOrderManagementView';
import { ODShipmentManagementView } from '../handler/order_delivery/ODShipmentManagementView';
import { ODReturnsHandoffView } from '../handler/order_delivery/ODReturnsHandoffView';
import { ODInventoryView } from '../handler/order_delivery/ODInventoryView';
import { ODExceptionsView } from '../handler/order_delivery/ODExceptionsView';
import { ODHistoryReportsView } from '../handler/order_delivery/ODHistoryReportsView';
import { PaymentsOverviewView } from '../handler/payments/PaymentsOverviewView';
import { PaymentTransactionsView } from '../handler/payments/PaymentTransactionsView';
import { PaymentRefundManagementView } from '../handler/payments/PaymentRefundManagementView';
import { PaymentReportsView } from '../handler/payments/PaymentReportsView';
import { PaymentAuditView } from '../handler/payments/PaymentAuditView';
import '../handler/HandlerDashboard.css';

export function HandlerDashboard({ onNavigate, routePath }) {
  const { user } = useAuth();
  const isOrderDelivery = user?.department_name === 'Order & Delivery';
  const isPaymentsRefunds = user?.department_name === 'Payments & Refunds';

  // Normalize current path and query string parameters
  const { currentPath, highlightId } = useMemo(() => {
    const raw = (routePath || (typeof window !== 'undefined' ? (window.location.pathname + window.location.search) : '')).trim();
    const [pathPart, queryPart] = raw.split('?');
    const pathLower = (pathPart || '').toLowerCase();
    let normalized = '/handler/dashboard';
    if (pathLower === '/handler' || pathLower === '/handler/' || pathLower === '/handler-dashboard') {
      normalized = '/handler/dashboard';
    } else if (pathLower.startsWith('/handler/')) {
      normalized = pathLower.replace(/\/$/, '');
    }
    const params = new URLSearchParams(queryPart || (typeof window !== 'undefined' ? window.location.search : ''));
    return {
      currentPath: normalized,
      highlightId: params.get('highlight'),
    };
  }, [routePath]);

  // Sub-route matchers for dedicated detail views
  const requestDetailMatch = currentPath.match(/^\/handler\/requests\/([^/]+)$/);
  const complaintDetailMatch = currentPath.match(/^\/handler\/complaints\/([^/]+)$/);
  const handoffDetailMatch = currentPath.match(/^\/handler\/tracking\/([^/]+)$/);

  // Active base section for sidebar highlighting
  const activeSidebarPath = useMemo(() => {
    if (requestDetailMatch) return '/handler/requests';
    if (complaintDetailMatch) return '/handler/complaints';
    if (handoffDetailMatch) return '/handler/tracking';
    return currentPath;
  }, [currentPath, requestDetailMatch, complaintDetailMatch, handoffDetailMatch]);

  // Real backend states
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [overviewStats, setOverviewStats] = useState(null);
  const [activityPeriod, setActivityPeriod] = useState('month');
  const activityRequestRef = React.useRef(0);
  const [complaints, setComplaints] = useState([]);
  const [reviewQueueClaims, setReviewQueueClaims] = useState([]);
  const [reviewTabCounts, setReviewTabCounts] = useState(null);
  const [allRequests, setAllRequests] = useState([]);
  const [trackingHandoffs, setTrackingHandoffs] = useState([]);
  const [trackingKpi, setTrackingKpi] = useState(null);
  const [auditLogs, setAuditLogs] = useState([]);
  const [auditKpi, setAuditKpi] = useState(null);
  const [reportsData, setReportsData] = useState(null);
  const [deliveryOrders, setDeliveryOrders] = useState([]);
  const [deliveryShipments, setDeliveryShipments] = useState([]);
  const [paymentsData, setPaymentsData] = useState(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (isPaymentsRefunds) {
        const [pRes, complaintsRes] = await Promise.allSettled([
          handlerService.getPaymentsDashboard(),
          handlerService.getAssignedComplaints(),
        ]);
        if (pRes.status === 'fulfilled' && pRes.value) {
          setPaymentsData(pRes.value);
        }
        if (complaintsRes.status === 'fulfilled' && Array.isArray(complaintsRes.value)) {
          setComplaints(complaintsRes.value);
        }
        setLoading(false);
        return;
      }

      const [
        complaintsRes,
        queueRes,
        allReqRes,
        handoffsRes,
        auditRes,
        reportsRes,
        deliveryOrdersRes,
        deliveryShipmentsRes,
      ] = await Promise.allSettled([
        handlerService.getAssignedComplaints(),
        isOrderDelivery ? Promise.resolve(null) : handlerService.getReturns({ include_all: false, limit: 50 }),
        isOrderDelivery ? Promise.resolve(null) : handlerService.getReturns({ include_all: true, limit: 50 }),
        isOrderDelivery ? handlerService.getOrderDeliveryReturnHandoffs({ limit: 50 }) : handlerService.getTrackingHandoffs({ limit: 50 }),
        isOrderDelivery ? Promise.resolve(null) : handlerService.getHistoryAudit({ limit: 50 }),
        isOrderDelivery ? Promise.resolve(null) : handlerService.getReportsStats(),
        isOrderDelivery ? handlerService.getOrderDeliveryOrders({ limit: 100 }) : Promise.resolve(null),
        isOrderDelivery ? handlerService.getOrderDeliveryShipments({ limit: 100 }) : Promise.resolve(null),
      ]);

      if (complaintsRes.status === 'fulfilled' && Array.isArray(complaintsRes.value)) {
        setComplaints(complaintsRes.value);
      }
      if (queueRes.status === 'fulfilled' && queueRes.value) {
        setReviewQueueClaims(queueRes.value.items || []);
        if (queueRes.value.tab_counts) setReviewTabCounts(queueRes.value.tab_counts);
      }
      if (allReqRes.status === 'fulfilled' && allReqRes.value) {
        setAllRequests(allReqRes.value.items || []);
      }
      if (handoffsRes.status === 'fulfilled' && handoffsRes.value) {
        setTrackingHandoffs((handoffsRes.value.items || []).map((handoff) => isOrderDelivery ? ({
          ...handoff,
          id: handoff.id ?? handoff.handoff_id,
          status: handoff.status || handoff.handoff_status,
          current_owner: handoff.current_owner || 'Order & Delivery',
        }) : handoff));
        if (handoffsRes.value.kpi_counts) setTrackingKpi(handoffsRes.value.kpi_counts);
      }
      if (auditRes.status === 'fulfilled' && auditRes.value) {
        setAuditLogs(auditRes.value.items || []);
        if (auditRes.value.kpi_counts) setAuditKpi(auditRes.value.kpi_counts);
      }
      if (reportsRes.status === 'fulfilled' && reportsRes.value) {
        setReportsData(reportsRes.value);
      }
      if (deliveryOrdersRes.status === 'fulfilled' && deliveryOrdersRes.value) {
        setDeliveryOrders(deliveryOrdersRes.value.items || []);
      }
      if (deliveryShipmentsRes.status === 'fulfilled' && deliveryShipmentsRes.value) {
        setDeliveryShipments(deliveryShipmentsRes.value.items || []);
      }
    } catch (err) {
      console.error('Failed to load handler dashboard data:', err);
      setError(err.message || 'Error loading dashboard data.');
    } finally {
      setLoading(false);
    }
  }, [isOrderDelivery, isPaymentsRefunds]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (isOrderDelivery || isPaymentsRefunds) return undefined;
    const requestId = ++activityRequestRef.current;
    handlerService.getOverviewStats(activityPeriod).then((stats) => {
      if (requestId === activityRequestRef.current) setOverviewStats(stats);
    }).catch((err) => {
      if (requestId === activityRequestRef.current) {
        console.error('Failed to load handler activity stats:', err);
        setError(err.message || 'Error loading handler activity data.');
      }
    });
    return () => {
      activityRequestRef.current += 1;
    };
  }, [activityPeriod, isOrderDelivery]);

  const handlePeriodChange = useCallback((period) => {
    setActivityPeriod(period);
  }, []);

  // Format complaints for overview
  const recentComplaints = useMemo(() => {
    return complaints.slice(0, 3).map((c) => ({
      id: c.complaint_id || `CMP-${c.id}`,
      rawId: c.id,
      orderId: c.order_number || '—',
      status: c.status || 'Pending',
      date: c.create_at ? new Date(c.create_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—',
    }));
  }, [complaints]);

  // Format review requests for overview
  const recentRequests = useMemo(() => {
    const source = allRequests.length > 0 ? allRequests : reviewQueueClaims;
    return source.slice(0, 5).map((r) => ({
      id: r.id ? `TRN-${r.id}` : (r.claim_id ? `TRN-${r.claim_id}` : '—'),
      rawId: r.id || r.claim_id,
      orderId: r.order_number || '—',
      customer: r.customer_name || '—',
      type: (r.resolution_type || '').toLowerCase() === 'replacement' ? 'Replacement' : 'Refund',
      status: r.workflow_status || 'Pending Review',
      updated: r.requested_at ? new Date(r.requested_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—',
    }));
  }, [allRequests, reviewQueueClaims]);

  const queueBadgeCount = isOrderDelivery
    ? deliveryOrders.filter((order) => order.status === 'placed').length
    : isPaymentsRefunds
    ? (paymentsData?.refund_overview?.awaiting_review ?? paymentsData?.kpis?.refunds_pending_count ?? 0)
    : (reviewQueueClaims.length > 0 ? reviewQueueClaims.length : (overviewStats?.pending_review || 0));

  // Render the matching view based on route path
  const renderCurrentView = () => {
    // 1. Dedicated Detail Views (NOT modals)
    if (!isOrderDelivery && !isPaymentsRefunds && requestDetailMatch) {
      const requestId = requestDetailMatch[1];
      return (
        <HandlerRequestDetailView
          requestId={requestId}
          onBack={() => onNavigate('handler-dashboard', '/handler/requests')}
          onRefresh={loadData}
        />
      );
    }

    if (complaintDetailMatch) {
      const complaintId = complaintDetailMatch[1];
      return (
        <HandlerComplaintDetailView
          complaintId={complaintId}
          onBack={() => onNavigate('handler-dashboard', '/handler/complaints')}
          onRefresh={loadData}
        />
      );
    }

    if (!isPaymentsRefunds && handoffDetailMatch) {
      const handoffId = handoffDetailMatch[1];
      return (
        <HandlerHandoffDetailView
          handoffId={handoffId}
          onBack={() => onNavigate('handler-dashboard', '/handler/tracking')}
          onRefresh={loadData}
          isOrderDelivery={isOrderDelivery}
        />
      );
    }

    if (isPaymentsRefunds) {
      switch (currentPath) {
        case '/handler/transactions':
          return <PaymentTransactionsView onNavigate={onNavigate} highlightId={highlightId} />;
        case '/handler/refunds':
        case '/handler/refund-requests':
          return <PaymentRefundManagementView onNavigate={onNavigate} initialTab="all" highlightId={highlightId} />;
        case '/handler/complaints':
          return (
            <HandlerComplaintsView
              complaints={complaints}
              loading={loading}
              onNavigate={onNavigate}
              departmentName="Payments & Refunds"
              departmentSubtitle="Customer complaints related to payments and refund enquiries."
            />
          );
        case '/handler/reports':
          return <PaymentReportsView onNavigate={onNavigate} />;
        case '/handler/history':
        case '/handler/history-reports':
          return <PaymentAuditView onNavigate={onNavigate} />;
        case '/handler/dashboard':
        default:
          return <PaymentsOverviewView onNavigate={onNavigate} />;
      }
    }

    if (isOrderDelivery) {
      switch (currentPath) {
        case '/handler/orders':
          return <ODOrderManagementView onNavigate={onNavigate} />;
        case '/handler/shipments':
          return <ODShipmentManagementView onNavigate={onNavigate} />;
        case '/handler/complaints':
          return (
            <HandlerComplaintsView
              complaints={complaints}
              loading={loading}
              onNavigate={onNavigate}
              departmentName="Order & Delivery"
              departmentSubtitle="Customer complaints related to orders, shipments and deliveries."
            />
          );
        case '/handler/returns-handoffs':
        case '/handler/tracking':
          return <ODReturnsHandoffView onNavigate={onNavigate} />;
        case '/handler/inventory':
          return <ODInventoryView onNavigate={onNavigate} />;
        case '/handler/exceptions':
          return <ODExceptionsView onNavigate={onNavigate} />;
        case '/handler/history-reports':
        case '/handler/history':
        case '/handler/reports':
          return <ODHistoryReportsView onNavigate={onNavigate} />;
        case '/handler/dashboard':
        default:
          return <ODOverviewView onNavigate={onNavigate} />;
      }
    }

    // 2. Main Page Views
    switch (currentPath) {
      case '/handler/review-queue':
        return (
          <HandlerReviewQueueView
            claims={reviewQueueClaims}
            tabCounts={reviewTabCounts}
            loading={loading}
            onNavigate={onNavigate}
            onRefresh={loadData}
          />
        );
      case '/handler/requests':
        return (
          <HandlerRequestsView
            allRequests={allRequests}
            stats={overviewStats}
            loading={loading}
            onNavigate={onNavigate}
            onRefresh={loadData}
            highlightId={highlightId}
          />
        );
      case '/handler/complaints':
        return (
          <HandlerComplaintsView
            complaints={complaints}
            loading={loading}
            onNavigate={onNavigate}
            departmentName="Returns & Replacement"
            departmentSubtitle="Customer complaints related to return and replacement requests."
          />
        );
      case '/handler/tracking':
        return (
          <HandlerTrackingView
            handoffs={trackingHandoffs}
            kpiCounts={trackingKpi}
            loading={loading}
            onNavigate={onNavigate}
          />
        );
      case '/handler/history':
        return (
          <HandlerHistoryView
            auditLogs={auditLogs}
            kpiCounts={auditKpi}
            loading={loading}
          />
        );
      case '/handler/reports':
        return (
          <HandlerReportsView
            reportsData={reportsData || overviewStats}
            loading={loading}
          />
        );
      case '/handler/dashboard':
      default:
        return (
          <HandlerOverviewView
            stats={overviewStats}
            recentRequests={recentRequests}
            recentComplaints={recentComplaints}
            onNavigate={onNavigate}
            activityPeriod={activityPeriod}
            onPeriodChange={handlePeriodChange}
          />
        );
    }
  };

  return (
    <HandlerLayout
      currentPath={activeSidebarPath}
      onNavigate={onNavigate}
      queueCount={queueBadgeCount}
      departmentName={user?.department_name || 'Returns & Replacement'}
    >
      {renderCurrentView()}
    </HandlerLayout>
  );
}

export default HandlerDashboard;
