import React, { useState, useEffect, useMemo } from 'react';
import { Search, ChevronDown, Plus, AlertCircle, RefreshCw, Inbox, Loader2 } from 'lucide-react';
import { Header } from '../components/layout/Header';
import { CategoryNav } from '../components/layout/CategoryNav';
import { AccountSidebar } from '../components/account/AccountSidebar';
import { ComplaintStatusBadge } from '../components/complaints/ComplaintStatusBadge';
import { ComplaintForm } from '../components/complaints/ComplaintForm';
import { ComplaintDetailsModal } from '../components/complaints/ComplaintDetailsModal';
import { ChatbotWidget } from '../components/chatbot/ChatbotWidget';
import { CartDrawer } from '../components/common/CartDrawer';
import { WishlistDrawer } from '../components/common/WishlistDrawer';
import { OrdersModal } from '../components/common/OrdersModal';
import { complaintService } from '../services/complaintService';
import { useAuth } from '../context/AuthContext';
import './MyComplaints.css';

export function MyComplaints({ onNavigate }) {
  const { user, isAuthenticated, loading: authLoading } = useAuth();

  // Complaints data state
  const [complaints, setComplaints] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState('');

  // Filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [selectedDept, setSelectedDept] = useState('all');

  // Modal states
  const [isNewComplaintOpen, setIsNewComplaintOpen] = useState(false);
  const [selectedComplaint, setSelectedComplaint] = useState(null);
  const [isOrdersOpen, setIsOrdersOpen] = useState(false);
  const [isChatbotOpen, setIsChatbotOpen] = useState(false);

  // Category navigation state
  const [activeCategory, setActiveCategory] = useState('Home');

  // Auth protection: redirect to login if unauthenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      if (onNavigate) {
        onNavigate('login');
      }
    }
  }, [authLoading, isAuthenticated, onNavigate]);

  // Load complaints from backend API
  const loadComplaints = async () => {
    if (!isAuthenticated) return;
    setIsLoading(true);
    setFetchError('');
    try {
      const data = await complaintService.getMyComplaints();
      setComplaints(Array.isArray(data) ? data : []);
    } catch (err) {
      setFetchError(err.message || 'Failed to load your complaints. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      loadComplaints();
    }
  }, [isAuthenticated]);

  // Extract unique departments from loaded data for the department dropdown
  const departmentOptions = useMemo(() => {
    const depts = new Set();
    complaints.forEach((c) => {
      const d = c.current_department || c.predicted_department;
      if (d) depts.add(d);
    });
    return Array.from(depts);
  }, [complaints]);

  // Format complaint ID for clean presentation
  const formatComplaintId = (complaint) => {
    const year = complaint.create_at
      ? new Date(complaint.create_at).getFullYear()
      : new Date().getFullYear();
    return `CMP-${year}-${String(complaint.id).padStart(5, '0')}`;
  };

  // Format date readable (e.g. "12 May 2024")
  const formatDate = (dateStr) => {
    if (!dateStr) return '—';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
    } catch {
      return dateStr;
    }
  };

  // Filter complaints based on search query, status, and department
  const filteredComplaints = useMemo(() => {
    return complaints.filter((c) => {
      const formattedId = formatComplaintId(c).toLowerCase();
      const rawId = String(c.id);
      const text = (c.complaint_text || '').toLowerCase();
      const q = searchQuery.trim().toLowerCase();

      // Search match
      const matchesSearch =
        !q ||
        formattedId.includes(q) ||
        rawId.includes(q) ||
        text.includes(q);

      // Status match
      let matchesStatus = true;
      if (selectedStatus !== 'all') {
        const normStatus = (c.status || '').toLowerCase();
        if (selectedStatus === 'open') {
          matchesStatus = normStatus === 'open' || normStatus === 'pending';
        } else if (selectedStatus === 'in_progress') {
          matchesStatus = normStatus === 'in_progress' || normStatus === 'in progress';
        } else if (selectedStatus === 'resolved') {
          matchesStatus = normStatus === 'resolved';
        } else if (selectedStatus === 'closed') {
          matchesStatus = normStatus === 'closed';
        }
      }

      // Department match
      let matchesDept = true;
      if (selectedDept !== 'all') {
        const dept = (c.current_department || c.predicted_department || '').toLowerCase();
        matchesDept = dept === selectedDept.toLowerCase();
      }

      return matchesSearch && matchesStatus && matchesDept;
    });
  }, [complaints, searchQuery, selectedStatus, selectedDept]);

  const handleSelectCategory = (catName) => {
    setActiveCategory(catName);
    if (onNavigate) {
      onNavigate('home');
    }
  };

  return (
    <div className="fk-page-container">
      {/* 1. Flatkart Header */}
      <Header
        onNavigate={onNavigate}
        onOpenOrders={() => setIsOrdersOpen(true)}
        onSelectProduct={() => {}}
      />

      {/* 2. Flatkart Category Subnav */}
      <CategoryNav
        activeCategory={activeCategory}
        onSelectCategory={handleSelectCategory}
      />

      {/* 3. Main Dashboard Body */}
      <div className="fk-dashboard-container">
        {/* Left Sidebar */}
        <AccountSidebar
          activeItem="complaints"
          onNavigate={onNavigate}
          onOpenOrders={() => setIsOrdersOpen(true)}
          onOpenWishlist={() => {}}
          onToggleChatbot={() => setIsChatbotOpen(!isChatbotOpen)}
        />

        {/* Main Complaints Content */}
        <main className="fk-dashboard-main">
          {/* Breadcrumb Navigation */}
          <nav className="fk-breadcrumbs" aria-label="Breadcrumb">
            <span
              className="fk-breadcrumb-link"
              onClick={() => onNavigate && onNavigate('home')}
            >
              Home
            </span>
            <span className="fk-breadcrumb-sep">&gt;</span>
            <span className="fk-breadcrumb-link">My Account</span>
            <span className="fk-breadcrumb-sep">&gt;</span>
            <span className="fk-breadcrumb-current">My Complaints</span>
          </nav>

          {/* Page Heading & New Complaint Action */}
          <div className="fk-complaints-header-row">
            <div>
              <h1 className="fk-complaints-title">My Complaints</h1>
              <p className="fk-complaints-desc">
                Track and manage all your complaints in one place.
              </p>
            </div>

            <button
              className="fk-btn-new-complaint"
              onClick={() => setIsNewComplaintOpen(true)}
              aria-label="Submit a new complaint"
            >
              <Plus size={18} strokeWidth={2.5} />
              <span>New Complaint</span>
            </button>
          </div>

          {/* Search and Filters Bar */}
          <div className="fk-complaints-filter-bar">
            {/* Search Box */}
            <div className="fk-filter-search-box">
              <input
                type="text"
                className="fk-filter-search-input"
                placeholder="Search by issue or complaint ID"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                aria-label="Search complaints"
              />
              <Search size={16} className="fk-filter-search-icon" />
            </div>

            {/* Status Filter */}
            <div className="fk-filter-select-wrapper">
              <select
                className="fk-filter-select"
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                aria-label="Filter by status"
              >
                <option value="all">All Status</option>
                <option value="open">Open</option>
                <option value="in_progress">In Progress</option>
                <option value="resolved">Resolved</option>
                <option value="closed">Closed</option>
              </select>
              <ChevronDown size={15} className="fk-filter-select-arrow" />
            </div>

            {/* Department Filter */}
            <div className="fk-filter-select-wrapper">
              <select
                className="fk-filter-select"
                value={selectedDept}
                onChange={(e) => setSelectedDept(e.target.value)}
                aria-label="Filter by department"
              >
                <option value="all">All Departments</option>
                {departmentOptions.map((dept) => (
                  <option key={dept} value={dept}>
                    {dept}
                  </option>
                ))}
              </select>
              <ChevronDown size={15} className="fk-filter-select-arrow" />
            </div>
          </div>

          {/* Error State Banner */}
          {fetchError && (
            <div
              className="fk-complaint-alert error"
              style={{ marginBottom: '16px' }}
              role="alert"
            >
              <AlertCircle size={18} />
              <span style={{ flex: 1 }}>{fetchError}</span>
              <button
                onClick={loadComplaints}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  fontWeight: '700',
                  color: '#C03E33',
                  textDecoration: 'underline',
                  cursor: 'pointer',
                }}
              >
                <RefreshCw size={14} /> Retry
              </button>
            </div>
          )}

          {/* Complaints Table Container */}
          <div className="fk-complaints-table-wrapper">
            {isLoading ? (
              <div className="fk-table-loading-state">
                <Loader2 size={24} className="fk-spin-icon" color="var(--fk-olive)" />
                <span>Loading your complaints...</span>
              </div>
            ) : filteredComplaints.length === 0 ? (
              <div className="fk-table-empty-state">
                <div className="fk-table-empty-icon">
                  <Inbox size={26} />
                </div>
                <div className="fk-table-empty-title">
                  {complaints.length === 0
                    ? 'No complaints filed yet'
                    : 'No matching complaints found'}
                </div>
                <div className="fk-table-empty-desc">
                  {complaints.length === 0
                    ? 'Have an issue with an order or service? File a complaint and our AI system will automatically route it to the right department.'
                    : 'Try adjusting your search terms or filter criteria.'}
                </div>
                {complaints.length === 0 && (
                  <button
                    className="fk-btn-new-complaint"
                    onClick={() => setIsNewComplaintOpen(true)}
                  >
                    <Plus size={16} /> File your first complaint
                  </button>
                )}
              </div>
            ) : (
              <table className="fk-complaints-table">
                <thead className="fk-complaints-thead">
                  <tr>
                    <th className="fk-complaints-th">Complaint ID</th>
                    <th className="fk-complaints-th">Issue</th>
                    <th className="fk-complaints-th">Submitted On</th>
                    <th className="fk-complaints-th">Department</th>
                    <th className="fk-complaints-th">Status</th>
                    <th className="fk-complaints-th" style={{ textAlign: 'right' }}>
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody className="fk-complaints-tbody">
                  {filteredComplaints.map((item) => (
                    <tr key={item.id}>
                      <td className="fk-complaints-td id-col">
                        {formatComplaintId(item)}
                      </td>
                      <td className="fk-complaints-td issue-col" title={item.complaint_text}>
                        {item.complaint_text}
                      </td>
                      <td className="fk-complaints-td date-col">
                        {formatDate(item.create_at)}
                      </td>
                      <td className="fk-complaints-td dept-col">
                        {item.current_department || item.predicted_department || '—'}
                      </td>
                      <td className="fk-complaints-td">
                        <ComplaintStatusBadge status={item.status} />
                      </td>
                      <td className="fk-complaints-td" style={{ textAlign: 'right' }}>
                        <button
                          className="fk-btn-view-details"
                          onClick={() => setSelectedComplaint(item)}
                          aria-label={`View details for complaint ${formatComplaintId(item)}`}
                        >
                          View Details
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </main>
      </div>

      {/* Floating Pebble Help / AI Chatbot Assistant */}
      <ChatbotWidget
        isOpen={isChatbotOpen}
        onToggle={() => setIsChatbotOpen(!isChatbotOpen)}
        onNavigate={onNavigate}
      />

      {/* Drawers & Modals */}
      <CartDrawer />
      <WishlistDrawer />
      <OrdersModal
        isOpen={isOrdersOpen}
        onClose={() => setIsOrdersOpen(false)}
        onOpenChatbot={() => setIsChatbotOpen(true)}
      />

      {/* New Complaint Form Modal */}
      <ComplaintForm
        isOpen={isNewComplaintOpen}
        onClose={() => setIsNewComplaintOpen(false)}
        onComplaintSubmitted={loadComplaints}
      />

      {/* View Complaint Details Modal */}
      <ComplaintDetailsModal
        complaint={selectedComplaint}
        onClose={() => setSelectedComplaint(null)}
      />
    </div>
  );
}

export default MyComplaints;
