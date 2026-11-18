import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, fmtDate, ROUTE_BASE, session } from "./api";
import { ApprovalTag, Badge, Card, ErrorBox, Field, Loading, Shell, useLoad, useToast } from "./ui";
import { MonitoringPanel, TeamPanel } from "./Panels";
import { StatusTree } from "./StatusTree";

const who = "owner";

// ═════════════ Owner home: create + list ═════════════
export function OwnerHome() {
  // /auth/owner/me also checks that the OTP session is still valid
  const me = useLoad(async () => (await api("/auth/owner/me", { who })).owner);
  const saved = session.get()?.owner;

  if (me.loading && !me.data) return <Shell title="Audits" owner={saved}><Loading /></Shell>;
  if (me.error) return <Shell title="Audits" owner={saved}><ErrorBox error={me.error} onRetry={me.reload} /></Shell>;
  return <OwnerAudits owner={me.data} />;
}

function OwnerAudits({ owner }) {
  const { data, error, loading, reload } = useLoad(() => api("", { who }));
  const [show, setShow] = useState(false);
  const [form, setForm] = useState({ auditName: "", auditType: "Full", remarks: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const create = async (e) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      await api("", { method: "POST", who, body: { ...form, remarks: form.remarks || null } });
      setForm({ auditName: "", auditType: "Full", remarks: "" });
      setShow(false);
      reload();
    } catch (x) { setErr(x); } finally { setBusy(false); }
  };

  return (
    <Shell
      title="Audits"
      owner={owner}
      subtitle={`Signed in as ${owner.ownerName}`}
      actions={<button className="au-btn au-btn-primary" onClick={() => setShow(!show)}>{show ? "Cancel" : "New audit"}</button>}
    >
      {show && (
        <Card title="New audit">
          <form className="au-form au-grid" onSubmit={create}>
            <Field label="Audit name"><input className="au-input" value={form.auditName} maxLength={200} onChange={(e) => setForm({ ...form, auditName: e.target.value })} required /></Field>
            <Field label="Type">
              <select className="au-input" value={form.auditType} onChange={(e) => setForm({ ...form, auditType: e.target.value })}>
                <option value="Full">Full</option><option value="Cycle">Cycle</option><option value="Spot">Spot</option>
              </select>
            </Field>
            <div className="au-grid-full">
              <Field label="Remarks (optional)"><textarea className="au-input" rows={2} maxLength={500} value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} /></Field>
              <ErrorBox error={err} />
              <button className="au-btn au-btn-primary" disabled={busy}>{busy ? "Creating…" : "Create audit"}</button>
            </div>
          </form>
        </Card>
      )}

      <ErrorBox error={error} onRetry={reload} />
      {loading && !data ? <Loading /> : data?.length === 0 ? (
        <Card><p>You have no audits yet. Create one, add an incharge and a manager, then start it.</p></Card>
      ) : (
        <div className="au-list">
          {data?.map((a) => (
            <Link key={a.id} to={`${ROUTE_BASE}/owner/${a.id}`} className="au-listitem">
              <div>
                <strong>{a.auditName}</strong>
                <div className="au-muted">{a.auditType} · code {a.auditCode} · started {fmtDate(a.startDate)}</div>
              </div>
              <div className="au-listitem-r">
                {a.reportApproved ? <span className="au-tag au-tag-ok">Report approved</span> : a.reportSubmitted ? <span className="au-tag au-tag-wait">Awaiting approval</span> : null}
                <Badge status={a.status} />
              </div>
            </Link>
          ))}
        </div>
      )}
    </Shell>
  );
}

// ═════════════ Owner: one audit ═════════════
export function OwnerAudit() {
  const { auditId } = useParams();
  const owner = session.get()?.owner;
  const { data, error, loading, reload } = useLoad(() => api(`/${auditId}`, { who }), [auditId]);
  const [tab, setTab] = useState("overview");
  const [toast, notify] = useToast();
  const [busy, setBusy] = useState("");
  const [actErr, setActErr] = useState(null);
  const [tick, setTick] = useState(0);

  const act = async (key, path, body, okMsg, confirmText) => {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(key); setActErr(null);
    try {
      const r = await api(`/${auditId}/${path}`, { method: "POST", who, body });
      notify(r?.message || okMsg);
      reload(); setTick((t) => t + 1);
    } catch (e) { setActErr(e); } finally { setBusy(""); }
  };

  if (loading && !data) return <Shell title="Audit" owner={owner} back={{ to: `${ROUTE_BASE}/owner`, label: "All audits" }}><Loading /></Shell>;
  if (error) return <Shell title="Audit" owner={owner} back={{ to: `${ROUTE_BASE}/owner`, label: "All audits" }}><ErrorBox error={error} onRetry={reload} /></Shell>;

  const a = data.audit;
  const started = a.status !== "Draft";
  const inReview = a.status === "Review";

  const actions = (
    <>
      {a.status === "Draft" && <button className="au-btn au-btn-primary" disabled={busy === "start"} onClick={() => act("start", "start", undefined, "Audit started", "Start the audit? The product list is built from current stock and cannot be rebuilt.")}>Start audit</button>}
      {inReview && !a.reportApproved && <button className="au-btn" disabled={busy === "reopen"} onClick={() => act("reopen", "reopen", { note: window.prompt("Note for the managers (optional)") || null }, "Audit reopened")}>Send back to managers</button>}
      {inReview && a.reportApproved && <button className="au-btn au-btn-primary" disabled={busy === "close"} onClick={() => act("close", "close", undefined, "Audit closed", "Close this audit? This cannot be undone.")}>Close audit</button>}
      {(a.status === "Draft" || a.status === "InProgress") && <button className="au-btn au-btn-danger" disabled={busy === "cancel"} onClick={() => act("cancel", "cancel", undefined, "Audit cancelled", "Cancel this audit? This cannot be undone.")}>Cancel audit</button>}
      {started && <Link className="au-btn" to={`${ROUTE_BASE}/owner/${a.id}/report`}>View report</Link>}
    </>
  );

  return (
    <Shell
      title={a.auditName}
      owner={owner}
      subtitle={`${a.auditType} audit · started ${fmtDate(a.startDate)}`}
      back={{ to: `${ROUTE_BASE}/owner`, label: "All audits" }}
      actions={actions}
    >
      {toast}
      <ErrorBox error={actErr} />

      <div className="au-banner">
        <div>
          <Badge status={a.status} />{" "}
          {started && <ApprovalTag info={{ isApproved: a.reportApproved, label: a.reportApproved ? "Report approved by incharge" : a.reportSubmitted ? "Report not yet approved by incharge" : "Report not yet submitted by manager" }} />}
        </div>
        <div>
          Audit code <span className="au-codebox">{a.auditCode}</span>
          <small className="au-muted au-block">Share it with your incharge and managers. They log in at {ROUTE_BASE}/login</small>
        </div>
      </div>

      <nav className="au-tabs" role="tablist">
        {["overview", "products", "team"].map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? "on" : ""} onClick={() => setTab(t)} disabled={!started && t !== "team" && t !== "overview"}>
            {t === "overview" ? "Progress" : t === "products" ? "Products" : "Team"}
          </button>
        ))}
      </nav>

      {tab === "overview" && (started ? <MonitoringPanel who={who} auditId={auditId} refreshKey={tick} /> : <Card><p>Add an incharge and at least one manager in the Team tab, then start the audit. Progress appears here once counting begins.</p></Card>)}
      {tab === "products" && started && <StatusTree role="owner" auditId={auditId} refreshKey={tick} />}
      {tab === "team" && <TeamPanel who={who} auditId={auditId} auditStatus={a.status} isOwner />}
    </Shell>
  );
}
