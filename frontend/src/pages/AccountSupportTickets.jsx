import React, { useEffect, useState } from 'react';
import { Headphones, RefreshCw } from 'lucide-react';
import { ComplaintStatusBadge } from '../components/complaints/ComplaintStatusBadge';
import { ComplaintDetailsModal } from '../components/complaints/ComplaintDetailsModal';
import { useAuth } from '../context/AuthContext';
import { getSupportTickets } from '../services/supportTicketCache';
import './accountPages.css';

const dateLabel = (value) => value && !Number.isNaN(new Date(value).getTime())
  ? new Date(value).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Date unavailable';

export function AccountSupportTickets() {
  const { user } = useAuth();
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);
  const load = async () => {
    setLoading(true); setError('');
    try { const records = await getSupportTickets(user?.id, { refresh: true }); setTickets(records); }
    catch (cause) { setError(cause.message || 'Could not load your support tickets.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { let alive = true; setTickets([]); setLoading(true); setError(''); getSupportTickets(user?.id).then((records) => { if (alive) { setTickets(records); setLoading(false); } }).catch((cause) => { if (alive) { setError(cause.message || 'Could not load your support tickets.'); setLoading(false); } }); return () => { alive = false; }; }, [user?.id]);

  return <section className="fk-account-page fk-support-page">
    <div className="fk-page-heading"><div><h1>My Support Tickets <span className="fk-ticket-count">{tickets.length}</span></h1><p>Track issues you have raised with Flatkart support.</p></div><button className="fk-page-refresh" type="button" onClick={load} disabled={loading}><RefreshCw size={16} /> Refresh</button></div>
    {error && <p className="fk-account-notice is-error" role="alert">{error}</p>}
    {loading ? <p className="fk-account-state" role="status">Loading your support tickets…</p> : tickets.length ? <div className="fk-ticket-list">{tickets.map((ticket) => <article className="fk-ticket-card" key={ticket.id}>
      <div className="fk-ticket-top"><div><span className="fk-ticket-id">Ticket #{ticket.id}</span><span className="fk-ticket-date">Submitted {dateLabel(ticket.create_at || ticket.created_at)}</span></div><ComplaintStatusBadge status={ticket.status} /></div>
      <p>{ticket.complaint_text || ticket.issue_summary || 'Support request'}</p>
      <div className="fk-ticket-meta"><span>Department: {ticket.current_department || ticket.predicted_department || 'Being reviewed'}</span><button type="button" onClick={() => setSelected(ticket)}>View details</button></div>
    </article>)}</div> : <div className="fk-account-empty"><Headphones size={34} /><strong>No support tickets yet</strong><p>Tickets you submit will appear here with their current status.</p></div>}
    <ComplaintDetailsModal complaint={selected} onClose={() => setSelected(null)} />
  </section>;
}
