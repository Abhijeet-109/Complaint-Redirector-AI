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
import '../handler/HandlerDashboard.css';

export function HandlerDashboard({ onNavigate, routePath }) {
  const { user } = useAuth();

  // Normalize current path
  const currentPath = useMemo(() => {
    const raw = (routePath || (typeof window !== 'undefined' ? window.location.pathname : '')).toLowerCase();
    if (raw === '/handler' || raw === '/handler/' || raw === '/handler-dashboard') {
      return '/handler/dashboard';
    }
    if (raw.startsWith('/handler/')) {
      return raw.replace(/\/$/, '');
    }
    return '/handler/dashboard';
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
  const [complaints, setComplaints] = useState([]);
  const [reviewQueueClaims, setReviewQueueClaims] = useState([]);
  const [reviewTabCounts, setReviewTabCounts] = useState(null);
  const [allRequests, setAllRequests] = useState([]);
  const [trackingHandoffs, setTrackingHandoffs] = useState([]);
  const [trackingKpi, setTrackingKpi] = useState(null);
  const [auditLogs, setAuditLogs] = useState([]);
  const [auditKpi, setAuditKpi] = useState(null);
  const [reportsData, setReportsData] = useState(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [
        statsRes,
        complaintsRes,
        queueRes,
        allReqRes,
        handoffsRes,
        auditRes,
        reportsRes,
      ] = await Promise.allSettled([
        handlerService.getOverviewStats(),
        handlerService.getAssignedComplaints(),
        handlerService.getReturns({ include_all: false, limit: 50 }),
        handlerService.getReturns({ include_all: true, limit: 50 }),
        handlerService.getTrackingHandoffs({ limit: 50 }),
        handlerService.getHistoryAudit({ limit: 50 }),
        handlerService.getReportsStats(),
      ]);

      if (statsRes.status === 'fulfilled' && statsRes.value) {
        setOverviewStats(statsRes.value);
      }
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
        setTrackingHandoffs(handoffsRes.value.items || []);
        if (handoffsRes.value.kpi_counts) setTrackingKpi(handoffsRes.value.kpi_counts);
      }
      if (auditRes.status === 'fulfilled' && auditRes.value) {
        setAuditLogs(auditRes.value.items || []);
        if (auditRes.value.kpi_counts) setAuditKpi(auditRes.value.kpi_counts);
      }
      if (reportsRes.status === 'fulfilled' && reportsRes.value) {
        setReportsData(reportsRes.value);
      }
    } catch (err) {
      console.error('Failed to load handler dashboard data:', err);
      setError(err.message || 'Error loading dashboard data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

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

  const queueBadgeCount = reviewQueueClaims.length > 0 ? reviewQueueClaims.length : (overviewStats?.pending_review || 0);

  // Render the matching view based on route path
  const renderCurrentView = () => {
    // 1. Dedicated Detail Views (NOT modals)
    if (requestDetailMatch) {
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

    if (handoffDetailMatch) {
      const handoffId = handoffDetailMatch[1];
      return (
        <HandlerHandoffDetailView
          handoffId={handoffId}
          onBack={() => onNavigate('handler-dashboard', '/handler/tracking')}
          onRefresh={loadData}
        />
      );
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
          />
        );
      case '/handler/complaints':
        return (
          <HandlerComplaintsView
            complaints={complaints}
            loading={loading}
            onNavigate={onNavigate}
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
          />
        );
    }
  };

  return (
    <HandlerLayout
      currentPath={activeSidebarPath}
      onNavigate={onNavigate}
      queueCount={queueBadgeCount}
      departmentName="Returns & Replacement"
    >
      {renderCurrentView()}
    </HandlerLayout>
  );
}

export default HandlerDashboard;
