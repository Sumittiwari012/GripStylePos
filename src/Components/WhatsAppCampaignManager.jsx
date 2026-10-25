import React, { useCallback, useEffect, useMemo, useState } from "react";
import "./WhatsAppCampaignManager.css";

/**
 * GripStyle WhatsApp Campaign Manager
 * Props:
 *   apiBaseUrl: e.g. "https://localhost:5001" (no trailing slash)
 *   getAuthHeaders: optional function returning auth headers for your existing login system
 */
const DEFAULT_API = "https://gripstyleapi.runasp.net";

function money(value) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Number(value || 0));
}
function dateText(value) {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}
function statusClass(status) {
  return `wa-status wa-status-${String(status || "unknown").toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}

export default function WhatsAppCampaignManager({ apiBaseUrl = DEFAULT_API, getAuthHeaders }) {
  const base = apiBaseUrl.replace(/\/$/, "");
  const [campaigns, setCampaigns] = useState([]);
  const [selectedCampaign, setSelectedCampaign] = useState(null);
  const [campaignDetails, setCampaignDetails] = useState(null);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [campaignName, setCampaignName] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [maxAttempts, setMaxAttempts] = useState(2);
  const [imageUrl, setImageUrl] = useState("https://gripstyle.in/durga-puja-banner.png");
  const [batchSize, setBatchSize] = useState(10);
  const [filters, setFilters] = useState({ activeCustomersOnly: true, minimumPurchaseCount: "", minimumSpend: "", purchaseFrom: "", purchaseTo: "" });
  const [customers, setCustomers] = useState([]);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [audienceTotal, setAudienceTotal] = useState(0);
  const [audiencePage, setAudiencePage] = useState(1);
  const [audiencePageSize] = useState(100);
  const [audienceLoaded, setAudienceLoaded] = useState(false);
  const [audienceSortBy, setAudienceSortBy] = useState("customerName");
  const [audienceSortDirection, setAudienceSortDirection] = useState("asc");

  const headers = useCallback(() => {
    const auth = typeof getAuthHeaders === "function" ? getAuthHeaders() : {};
    return { "Content-Type": "application/json", ...(auth || {}) };
  }, [getAuthHeaders]);

  const api = useCallback(async (path, options = {}) => {
    const response = await fetch(`${base}${path}`, {
      ...options,
      headers: { ...headers(), ...(options.headers || {}) },
    });
    const text = await response.text();
    let data = null;
    if (text) {
      try { data = JSON.parse(text); } catch { data = text; }
    }
    if (!response.ok) {
      const message = typeof data === "string" ? data : data?.message || data?.title || `Request failed (${response.status})`;
      throw new Error(message);
    }
    return data;
  }, [base, headers]);

  const loadCampaigns = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    setError("");
    try {
      const data = await api("/api/whatsapp/campaigns");
      setCampaigns(Array.isArray(data) ? data : []);
    } catch (e) { setError(e.message || "Unable to load campaigns."); }
    finally { if (!quiet) setLoading(false); }
  }, [api]);

  const loadCampaign = useCallback(async (id) => {
    if (!id) return;
    setWorking(true); setError("");
    try {
      const [details, campaignStats] = await Promise.all([
        api(`/api/whatsapp/campaigns/${id}`),
        api(`/api/whatsapp/campaigns/${id}/stats`),
      ]);
      setSelectedCampaign(id); setCampaignDetails(details); setStats(campaignStats);
    } catch (e) { setError(e.message || "Unable to load campaign details."); }
    finally { setWorking(false); }
  }, [api]);

  useEffect(() => { loadCampaigns(); }, [loadCampaigns]);

  const summary = useMemo(() => {
    const total = campaigns.length;
    const running = campaigns.filter(c => String(c.status).toLowerCase() === "running").length;
    const drafts = campaigns.filter(c => String(c.status).toLowerCase() === "draft").length;
    const paused = campaigns.filter(c => c.isPaused || String(c.status).toLowerCase() === "paused").length;
    return { total, running, drafts, paused };
  }, [campaigns]);

  async function previewAudience(page = 1) {
    setWorking(true); setError(""); setNotice("");
    try {
      const payload = {
        activeCustomersOnly: filters.activeCustomersOnly,
        minimumPurchaseCount: filters.minimumPurchaseCount === "" ? null : Number(filters.minimumPurchaseCount),
        minimumSpend: filters.minimumSpend === "" ? null : Number(filters.minimumSpend),
        purchaseFrom: filters.purchaseFrom || null,
        purchaseTo: filters.purchaseTo || null,
        page,
        pageSize: audiencePageSize,
      };
      const result = await api("/api/whatsapp/audience/preview", { method: "POST", body: JSON.stringify(payload) });
      setCustomers(result?.customers || []);
      setAudienceTotal(Number(result?.totalCount || 0));
      setAudiencePage(Number(result?.page || page));
      setAudienceLoaded(true);
    } catch (e) { setError(e.message || "Unable to preview audience."); }
    finally { setWorking(false); }
  }

  function toggleCustomer(id) {
    setSelectedIds(old => {
      const next = new Set(old);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function toggleCurrentPage() {
    setSelectedIds(old => {
      const next = new Set(old);
      const allSelected = customers.length > 0 && customers.every(c => next.has(c.customerId));
      customers.forEach(c => allSelected ? next.delete(c.customerId) : next.add(c.customerId));
      return next;
    });
  }

  async function createCampaign(event) {
    event.preventDefault(); setWorking(true); setError(""); setNotice("");
    try {
      const created = await api("/api/whatsapp/campaigns", {
        method: "POST",
        body: JSON.stringify({ campaignName: campaignName.trim(), templateId: Number(templateId), maxAttemptsPerRecipient: Number(maxAttempts) }),
      });
      setShowCreate(false); setCampaignName(""); setTemplateId("");
      setNotice(`Campaign “${campaignName.trim()}” created. Select it below to prepare recipients.`);
      await loadCampaigns(true);
      if (created?.id) await loadCampaign(created.id);
    } catch (e) { setError(e.message || "Unable to create campaign."); }
    finally { setWorking(false); }
  }

  async function prepareRecipients() {
    if (!selectedCampaign) return;
    if (selectedIds.size === 0) { setError("Select at least one customer in Audience Preview first."); return; }
    if (!window.confirm(`Add ${selectedIds.size} selected customer(s) to this campaign?`)) return;
    setWorking(true); setError(""); setNotice("");
    try {
      const result = await api(`/api/whatsapp/campaigns/${selectedCampaign}/prepare`, {
        method: "POST", body: JSON.stringify({ customerIds: Array.from(selectedIds) }),
      });
      setNotice(`Recipients prepared: ${result?.added ?? 0} added. Already prepared: ${result?.alreadyPrepared ?? 0}.`);
      await loadCampaign(selectedCampaign); await loadCampaigns(true);
    } catch (e) { setError(e.message || "Unable to prepare recipients."); }
    finally { setWorking(false); }
  }

  async function startCampaign() {
    if (!selectedCampaign) return;
    const pending = (campaignDetails?.recipients || []).filter(r => r.status === "Pending").length;
    if (!pending) { setError("This campaign has no pending recipients. Prepare recipients first."); return; }
    if (!imageUrl.trim() || !/^https:\/\//i.test(imageUrl.trim())) { setError("Enter a publicly accessible HTTPS image URL."); return; }
    if (!window.confirm(`Send a real WhatsApp template message to up to ${Math.min(Number(batchSize), pending)} recipient(s) now?`)) return;
    setWorking(true); setError(""); setNotice("");
    try {
      const result = await api(`/api/whatsapp/campaigns/${selectedCampaign}/start`, {
        method: "POST", body: JSON.stringify({ imageUrl: imageUrl.trim(), batchSize: Number(batchSize) }),
      });
      setNotice(`Batch processed: ${result?.processed ?? 0}. ${result?.remainingPending ? "More recipients remain; run the next batch when ready." : "No pending recipients remain."}`);
      await loadCampaign(selectedCampaign); await loadCampaigns(true);
    } catch (e) { setError(e.message || "Unable to start campaign."); }
    finally { setWorking(false); }
  }

  async function campaignAction(action) {
    if (!selectedCampaign) return;
    setWorking(true); setError(""); setNotice("");
    try {
      await api(`/api/whatsapp/campaigns/${selectedCampaign}/${action}`, { method: "POST", body: "{}" });
      setNotice(action === "pause" ? "Campaign paused." : "Campaign resumed.");
      await loadCampaign(selectedCampaign); await loadCampaigns(true);
    } catch (e) { setError(e.message || `Unable to ${action} campaign.`); }
    finally { setWorking(false); }
  }

  const sortedCustomers = useMemo(() => {
    const valueOf = (customer) => {
      switch (audienceSortBy) {
        case "purchaseCount":
          return Number(customer.purchaseCount || 0);
        case "totalSpend":
          return Number(customer.totalSpend || 0);
        case "lastPurchaseDate": {
          const timestamp = customer.lastPurchaseDate
            ? new Date(customer.lastPurchaseDate).getTime()
            : 0;
          return Number.isNaN(timestamp) ? 0 : timestamp;
        }
        case "customerName":
        default:
          return String(customer.customerName || "").toLocaleLowerCase("en");
      }
    };

    return [...customers].sort((a, b) => {
      const first = valueOf(a);
      const second = valueOf(b);
      let comparison;

      if (typeof first === "string" && typeof second === "string") {
        comparison = first.localeCompare(second);
      } else {
        comparison = first - second;
      }

      if (comparison === 0) {
        comparison = Number(a.customerId || 0) - Number(b.customerId || 0);
      }

      return audienceSortDirection === "desc" ? -comparison : comparison;
    });
  }, [customers, audienceSortBy, audienceSortDirection]);

  const recipients = campaignDetails?.recipients || [];
  const countByStatus = stats?.recipientCounts || [];
  const countStatus = (name) => countByStatus.find(x => x.status === name)?.count || 0;

  return (
    <div className="wa-manager">
      <header className="wa-header">
        <div className="wa-brand-mark">G</div>
        <div className="wa-header-copy"><div className="wa-eyebrow">GRIPSTYLE · CUSTOMER ENGAGEMENT</div><h1>WhatsApp Campaigns</h1><p>Create campaigns, select customers and track delivery in one place.</p></div>
        <button className="wa-button wa-button-primary" onClick={() => setShowCreate(true)}>＋ New campaign</button>
      </header>

      {error && <div className="wa-alert wa-alert-error" role="alert"><strong>Something needs attention</strong><span>{error}</span><button onClick={() => setError("")} aria-label="Dismiss">×</button></div>}
      {notice && <div className="wa-alert wa-alert-success" role="status"><span>{notice}</span><button onClick={() => setNotice("")} aria-label="Dismiss">×</button></div>}

      <section className="wa-metrics">
        <Metric label="All campaigns" value={summary.total} icon="▤" />
        <Metric label="Running" value={summary.running} icon="↗" />
        <Metric label="Drafts" value={summary.drafts} icon="✎" />
        <Metric label="Paused" value={summary.paused} icon="Ⅱ" />
      </section>

      <div className="wa-main-grid">
        <section className="wa-panel wa-campaign-panel">
          <div className="wa-panel-heading"><div><h2>Campaign list</h2><p>Choose a campaign to manage recipients and delivery.</p></div><button className="wa-button wa-button-light wa-button-small" onClick={() => loadCampaigns()} disabled={loading}>{loading ? "Loading…" : "↻ Refresh"}</button></div>
          {campaigns.length === 0 && !loading ? <EmptyState title="No campaigns yet" text="Create your first campaign to start building an audience." action={() => setShowCreate(true)} /> : (
            <div className="wa-campaign-list">
              {campaigns.map(c => <button key={c.id} className={`wa-campaign-row ${selectedCampaign === c.id ? "is-selected" : ""}`} onClick={() => loadCampaign(c.id)}>
                <span className="wa-campaign-icon">◉</span><span className="wa-campaign-info"><strong>{c.campaignName}</strong><small>{c.templateName || `Template #${c.templateId || "—"}`} · {dateText(c.scheduledAt || c.startedAt || c.createdDate)}</small></span><span className={statusClass(c.isPaused ? "Paused" : c.status)}>{c.isPaused ? "Paused" : c.status}</span><span className="wa-chevron">›</span>
              </button>)}
            </div>
          )}
        </section>

        <section className="wa-panel wa-detail-panel">
          {!campaignDetails ? <div className="wa-empty-detail"><div className="wa-empty-icon">◉</div><h2>Campaign workspace</h2><p>Select a campaign from the list to see recipients, prepare your audience and run a send batch.</p><div className="wa-workflow"><span>01 <b>Choose</b></span><i>→</i><span>02 <b>Prepare</b></span><i>→</i><span>03 <b>Send</b></span></div></div> : <>
            <div className="wa-panel-heading wa-detail-heading"><div><div className="wa-eyebrow">CAMPAIGN #{campaignDetails.id}</div><h2>{campaignDetails.campaignName}</h2><p>{campaignDetails.template?.templateName || campaignDetails.templateName || "Template"} · {campaignDetails.template?.languageCode || "en"}</p></div><span className={statusClass(campaignDetails.isPaused ? "Paused" : campaignDetails.status)}>{campaignDetails.isPaused ? "Paused" : campaignDetails.status}</span></div>
            <div className="wa-status-cards">
              <MiniStat label="Recipients" value={recipients.length} />
              <MiniStat label="Delivered" value={countStatus("Delivered")} />
              <MiniStat label="Read" value={countStatus("Read")} />
              <MiniStat label="Manual review" value={countStatus("ManualReview")} />
            </div>
            <div className="wa-action-block">
              <h3>Send configuration</h3>
              <label className="wa-field"><span>Image header URL</span><input value={imageUrl} onChange={e => setImageUrl(e.target.value)} placeholder="https://your-domain.com/banner.png" /></label>
              <div className="wa-inline-fields"><label className="wa-field"><span>Batch size</span><select value={batchSize} onChange={e => setBatchSize(Number(e.target.value))}><option value={1}>1 recipient (test)</option><option value={5}>5 recipients</option><option value={10}>10 recipients</option><option value={25}>25 recipients</option><option value={50}>50 recipients</option></select></label><div className="wa-field wa-help-field"><span>Before sending</span><small>Confirm the image is public and the selected recipients are eligible for marketing messages.</small></div></div>
              <div className="wa-actions"><button className="wa-button wa-button-primary" onClick={startCampaign} disabled={working || !recipients.some(r => r.status === "Pending")}>{working ? "Working…" : "▶ Send next batch"}</button>{campaignDetails.isPaused || campaignDetails.status === "Paused" ? <button className="wa-button wa-button-light" onClick={() => campaignAction("resume")} disabled={working}>Resume</button> : <button className="wa-button wa-button-light" onClick={() => campaignAction("pause")} disabled={working || ["Completed", "Cancelled"].includes(campaignDetails.status)}>Ⅱ Pause</button>}<button className="wa-button wa-button-light" onClick={() => loadCampaign(selectedCampaign)} disabled={working}>↻ Refresh</button></div>
              <p className="wa-warning-note"><span>ⓘ</span> Sending here contacts real customers. Error 131049 should be reviewed manually; do not repeatedly retry blocked messages.</p>
            </div>
            <div className="wa-recipient-heading"><div><h3>Recipients</h3><p>{recipients.length} customer(s) prepared for this campaign.</p></div><button className="wa-button wa-button-light wa-button-small" onClick={prepareRecipients} disabled={working || ["Completed", "Cancelled"].includes(campaignDetails.status)}>＋ Add selected customers</button></div>
            {recipients.length === 0 ? <div className="wa-inline-empty">No recipients prepared. Select customers in Audience Preview below, then add them to this campaign.</div> : <div className="wa-table-wrap"><table className="wa-table"><thead><tr><th>Customer</th><th>Phone</th><th>Status</th><th>Attempts</th><th>Last error</th></tr></thead><tbody>{recipients.map(r => <tr key={r.id}><td><strong>{r.customerName || `Customer #${r.customerId}`}</strong><small>ID {r.customerId}</small></td><td>{r.phoneNumber}</td><td><span className={statusClass(r.status)}>{r.status}</span></td><td>{r.attemptCount}</td><td>{r.lastErrorCode ? `${r.lastErrorCode}${r.lastErrorDetails ? ` · ${r.lastErrorDetails}` : ""}` : "—"}</td></tr>)}</tbody></table></div>}
          </>}
        </section>
      </div>

      <section className="wa-panel wa-audience-panel">
        <div className="wa-panel-heading"><div><div className="wa-eyebrow">AUDIENCE BUILDER</div><h2>Preview and select customers</h2><p>Use purchase history to filter the audience, then manually select the customers to prepare.</p></div><div className="wa-audience-count">{audienceLoaded ? `${audienceTotal.toLocaleString("en-IN")} matches` : "Not previewed"}</div></div>
        <div className="wa-filter-grid">
          <label className="wa-field"><span>Minimum purchases</span><input type="number" min="0" placeholder="Any" value={filters.minimumPurchaseCount} onChange={e => setFilters({ ...filters, minimumPurchaseCount: e.target.value })} /></label>
          <label className="wa-field"><span>Minimum spend (₹)</span><input type="number" min="0" placeholder="Any amount" value={filters.minimumSpend} onChange={e => setFilters({ ...filters, minimumSpend: e.target.value })} /></label>
          <label className="wa-field"><span>Purchase from</span><input type="date" value={filters.purchaseFrom} onChange={e => setFilters({ ...filters, purchaseFrom: e.target.value })} /></label>
          <label className="wa-field"><span>Purchase to</span><input type="date" value={filters.purchaseTo} onChange={e => setFilters({ ...filters, purchaseTo: e.target.value })} /></label>
          <label className="wa-check-field"><input type="checkbox" checked={filters.activeCustomersOnly} onChange={e => setFilters({ ...filters, activeCustomersOnly: e.target.checked })} /><span>Active customers only</span></label>
          <div className="wa-filter-actions"><button className="wa-button wa-button-primary" onClick={() => previewAudience(1)} disabled={working}>{working ? "Loading…" : "⌕ Preview audience"}</button><button className="wa-button wa-button-light" onClick={() => { setFilters({ activeCustomersOnly: true, minimumPurchaseCount: "", minimumSpend: "", purchaseFrom: "", purchaseTo: "" }); setSelectedIds(new Set()); setCustomers([]); setAudienceLoaded(false); setAudienceTotal(0); }} disabled={working}>Reset</button></div>
        </div>
        {audienceLoaded && <>
          <div className="wa-audience-toolbar">
            <label className="wa-check-field">
              <input type="checkbox" checked={customers.length > 0 && customers.every(c => selectedIds.has(c.customerId))} onChange={toggleCurrentPage} />
              <span>Select all on this page</span>
            </label>
            <span>{selectedIds.size} selected across preview pages</span>
            <label className="wa-field wa-sort-field">
              <span>Sort preview by</span>
              <select value={audienceSortBy} onChange={e => setAudienceSortBy(e.target.value)}>
                <option value="customerName">Customer name</option>
                <option value="purchaseCount">Purchase count</option>
                <option value="totalSpend">Total spend</option>
                <option value="lastPurchaseDate">Last purchase date</option>
              </select>
            </label>
            <label className="wa-field wa-sort-field">
              <span>Order</span>
              <select value={audienceSortDirection} onChange={e => setAudienceSortDirection(e.target.value)}>
                <option value="asc">Increasing (ascending)</option>
                <option value="desc">Decreasing (descending)</option>
              </select>
            </label>
            <button className="wa-button wa-button-light wa-button-small" onClick={prepareRecipients} disabled={working || !selectedCampaign || selectedIds.size === 0 || ["Completed", "Cancelled"].includes(campaignDetails?.status)}>Add selection to campaign</button>
          </div>
          <p className="wa-sort-note">Sorting changes the order of customers on the current preview page only.</p>
          {customers.length === 0 ? <div className="wa-inline-empty">No customers match these filters.</div> : <div className="wa-table-wrap"><table className="wa-table wa-audience-table"><thead><tr><th className="wa-select-col"></th><th>Customer</th><th>Mobile</th><th>Purchases</th><th>Total spend</th><th>Last purchase</th></tr></thead><tbody>{sortedCustomers.map(c => <tr key={c.customerId}><td><input aria-label={`Select ${c.customerName}`} type="checkbox" checked={selectedIds.has(c.customerId)} onChange={() => toggleCustomer(c.customerId)} /></td><td><strong>{c.customerName}</strong><small>ID {c.customerId}</small></td><td>{c.mobileNumber}</td><td>{c.purchaseCount}</td><td>{money(c.totalSpend)}</td><td>{c.lastPurchaseDate ? new Date(c.lastPurchaseDate).toLocaleDateString("en-IN") : "—"}</td></tr>)}</tbody></table></div>}
          <div className="wa-pagination"><span>Page {audiencePage} · Showing {customers.length} of {audienceTotal.toLocaleString("en-IN")}</span><div><button className="wa-button wa-button-light wa-button-small" disabled={working || audiencePage <= 1} onClick={() => previewAudience(audiencePage - 1)}>Previous</button><button className="wa-button wa-button-light wa-button-small" disabled={working || audiencePage * audiencePageSize >= audienceTotal} onClick={() => previewAudience(audiencePage + 1)}>Next</button></div></div>
        </>}
      </section>

      {showCreate && <div className="wa-modal-backdrop" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) setShowCreate(false); }}><div className="wa-modal" role="dialog" aria-modal="true" aria-labelledby="wa-create-title"><div className="wa-modal-heading"><div><div className="wa-eyebrow">NEW WORKFLOW</div><h2 id="wa-create-title">Create campaign</h2><p>Choose an approved WhatsApp template from your database.</p></div><button className="wa-close" onClick={() => setShowCreate(false)} aria-label="Close">×</button></div><form onSubmit={createCampaign} className="wa-create-form"><label className="wa-field"><span>Campaign name</span><input required maxLength={200} value={campaignName} onChange={e => setCampaignName(e.target.value)} placeholder="e.g. Durga Puja 2026" /></label><label className="wa-field"><span>Approved template ID</span><input required type="number" min="1" value={templateId} onChange={e => setTemplateId(e.target.value)} placeholder="Enter WhatsAppTemplate.Id" /><small>Use the ID of a template marked APPROVED in your WhatsAppTemplate table.</small></label><label className="wa-field"><span>Maximum attempts per recipient</span><select value={maxAttempts} onChange={e => setMaxAttempts(Number(e.target.value))}><option value={1}>1 attempt</option><option value={2}>2 attempts (default)</option><option value={3}>3 attempts</option></select><small>131049 remains manual review; this setting must not be used to automatically retry that error.</small></label><div className="wa-modal-actions"><button type="button" className="wa-button wa-button-light" onClick={() => setShowCreate(false)}>Cancel</button><button type="submit" className="wa-button wa-button-primary" disabled={working}>{working ? "Creating…" : "Create draft campaign"}</button></div></form></div></div>}
      <footer className="wa-footer">GripStyle Campaign Manager <span>·</span> Messages are sent through your configured backend, never directly from the browser.</footer>
    </div>
  );
}

function Metric({ label, value, icon }) { return <div className="wa-metric-card"><span className="wa-metric-icon">{icon}</span><div><span>{label}</span><strong>{value}</strong></div></div>; }
function MiniStat({ label, value }) { return <div className="wa-mini-stat"><span>{label}</span><strong>{value}</strong></div>; }
function EmptyState({ title, text, action }) { return <div className="wa-empty-list"><div className="wa-empty-icon">＋</div><h3>{title}</h3><p>{text}</p><button className="wa-button wa-button-primary" onClick={action}>Create campaign</button></div>; }
